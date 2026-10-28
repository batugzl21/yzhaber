// YZ Radar — bağımlılıksız Node.js toplayıcı + statik sunucu.
// Çalıştır: node server.js   →   http://localhost:4321
// Kaynakları saat başı tarar, sonuçları data/cache.json'a yazar.

const http = require('http');
const fs = require('fs');
const path = require('path');
const SOURCES = require('./sources');

const PORT = Number(process.env.PORT) || 4321;
const REFRESH_MS = 60 * 60 * 1000;          // saat başı
const MANUAL_COOLDOWN_MS = 3 * 60 * 1000;    // elle yenileme arası en az 3 dk
const MAX_AGE_DAYS = 21;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const CACHE_FILE = path.join(ROOT, 'data', 'cache.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) YZRadar/1.0 (+kisisel haber okuyucu)';

let state = { updatedAt: 0, nextAt: 0, refreshing: false, sources: {}, seen: {}, tr: {} };
let lastManual = 0;

// ─── Yardımcılar ─────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toLocaleTimeString('tr-TR'), ...a);

async function get(url, { json = false, headers = {}, timeout = 20000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', ...headers },
    });
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return json ? res.json() : res.text();
  } finally {
    clearTimeout(t);
  }
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
function decode(s = '') {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}
function stripHtml(s = '') {
  return decode(decode(s))
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function clip(s, n = 260) {
  if (!s || s.length <= n) return s || '';
  return s.slice(0, s.lastIndexOf(' ', n) > n * 0.6 ? s.lastIndexOf(' ', n) : n) + '…';
}
function toDate(v) {
  if (!v) return 0;
  const t = typeof v === 'number' ? (v < 1e12 ? v * 1000 : v) : Date.parse(v);
  if (!Number.isFinite(t)) return 0;
  return Math.min(t, Date.now());
}
function tag(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return m ? m[1] : '';
}
function attr(block, name, a) {
  const m = block.match(new RegExp(`<${name}\\s[^>]*?${a}=["']([^"']+)["']`, 'i'));
  return m ? decode(m[1]) : '';
}

// ─── RSS / Atom ayrıştırıcı ──────────────────────────────────────────────
function parseFeed(xml) {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  return blocks.map((b) => {
    let link = stripHtml(tag(b, 'link'));
    if (!link) {
      const alt = b.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i);
      link = alt ? decode(alt[1]) : attr(b, 'link', 'href');
    }
    const rawBody = tag(b, 'content:encoded') || tag(b, 'description') || tag(b, 'summary') || tag(b, 'media:description') || tag(b, 'content');
    const body = decode(rawBody);
    let image = attr(b, 'media:thumbnail', 'url') || attr(b, 'media:content', 'url') || attr(b, 'enclosure', 'url');
    if (!image) {
      const img = body.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (img) image = decode(img[1]);
    }
    if (image && !/^https?:/.test(image)) image = '';
    const cats = [...b.matchAll(/<category(?:[^>]*term=["']([^"']+)["'])?[^>]*>(?:([\s\S]*?)<\/category>)?/gi)]
      .map((m) => stripHtml(m[1] || m[2] || ''))
      .filter(Boolean);
    return {
      title: stripHtml(tag(b, 'title')),
      url: link.trim(),
      date: toDate(stripHtml(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date'))),
      summary: clip(stripHtml(rawBody)),
      body: stripHtml(rawBody).slice(0, 4000),
      image,
      author: stripHtml(tag(b, 'dc:creator') || tag(tag(b, 'author'), 'name') || ''),
      views: Number(attr(b, 'media:statistics', 'views')) || 0,
      likes: Number(attr(b, 'media:starRating', 'count')) || 0,
      cats,
    };
  }).filter((i) => i.title && i.url);
}

// ─── Kaynak tipleri ──────────────────────────────────────────────────────
const AI_RE = /\b(ai|a\.i\.|llms?|gpt[-\d\w.]*|chatgpt|openai|anthropic|claude|gemini|llama|mistral|qwen|deepseek|grok|copilot|agents?|agentic|mcp|rag|embedding|transformer|diffusion|neural|machine learning|ml|genai|generative|prompt|vibe[- ]?cod\w*|cursor|whisper|ollama|hugging ?face|model|inference|fine[- ]?tun\w*|voice clone|text[- ]to[- ]\w+)\b/i;

const EDU_AI_RE = /\b(ai|a\.i\.|artificial intelligence|generative ai|genai|llms?|gpt[-\d\w.]*|chatgpt|openai|anthropic|claude|gemini|copilot|khanmigo|magicschool|brisk teaching)\b|yapay zek/i;

const TR_AI_RE = /(yapay zek|chatgpt|gemini|claude|openai|copilot|robot)/i;

// Videolar: Shorts hariç, yalnızca gerçekten izlenen ve beğenilenler.
// Eşik videonun yaşıyla ölçeklenir (yeni bir video henüz izlenme toplamamış olabilir).
const MIN_VIEWS = { en: 30000, tr: 15000 };
function popularVideos(items, src) {
  const base = MIN_VIEWS[src.lang] || MIN_VIEWS.en;
  return items
    .filter((i) => !i.url.includes('/shorts/') && !/#shorts?\b/i.test(i.title + ' ' + i.summary))
    .filter((i) => {
      const ageH = (Date.now() - i.date) / 3600000;
      return ageH < 14 * 24 && i.views >= base * Math.min(1, Math.max(0.4, ageH / 72));
    })
    .sort((a, b) => b.views - a.views)
    .map((i) => ({
      ...i,
      metric: `${fmtNum(i.views)} izlenme · ${fmtNum(i.likes)} beğeni`,
      engage: i.views / 150000 + i.likes / 8000,
    }));
}

const fetchers = {
  async rss(src) {
    const xml = await get(src.url);
    let items = parseFeed(xml);
    if (src.aiOnly) {
      // Genel kaynaklarda yalnızca YZ içerikleri; YouTube'da açıklama da kontrol edilir
      const yt = src.url.includes('youtube.com');
      items = items.filter((i) => src.cat === 'edu'
        ? EDU_AI_RE.test(i.title + ' ' + i.summary)
        : [i.title, yt ? i.summary : ''].some((t) => AI_RE.test(t) || TR_AI_RE.test(t)));
    }
    // Techmeme başlıkları "Başlık (Yazar/Yayıncı)" biçiminde
    if (src.id === 'techmeme') items = items.map((i) => ({ ...i, title: i.title.replace(/\s*\(([^()]*\/[^()]*)\)\s*$/, ''), summary: '' }));
    if (src.gnews) {
      // Google Haberler başlığı "Başlık - Yayıncı" biçimindedir; özet yalnızca bağlantı listesidir
      items = items.map((i) => {
        const m = i.title.match(/^(.*) - ([^-]+)$/);
        return { ...i, title: m ? m[1] : i.title, author: m ? m[2] : '', summary: '', metric: m ? m[2] : '' };
      });
    }
    if (src.url.includes('youtube.com/feeds')) items = popularVideos(items, src);
    return items.slice(0, src.limit || 20);
  },

  async anthropic(src) {
    const html = await get(src.url);
    const out = [];
    const seen = new Set();
    const re = /title-link"\s+href="(\/news\/[a-z0-9-]+)"/g;
    let m;
    while ((m = re.exec(html)) && out.length < (src.limit || 15)) {
      if (seen.has(m[1])) continue;
      seen.add(m[1]);
      const chunk = html.slice(m.index, m.index + 4000).replace(/<[^>]+>/g, '|');
      const parts = chunk.split('|').map((s) => decode(s).trim()).filter(Boolean).slice(1);
      const dateStr = parts.find((p) => /^[A-Z][a-z]{2} \d{1,2}, \d{4}$/.test(p));
      out.push({
        title: parts[0] || m[1],
        url: 'https://www.anthropic.com' + m[1],
        summary: clip(parts[1] && parts[1] !== dateStr ? parts[1] : ''),
        date: toDate(dateStr),
      });
    }
    if (!out.length) throw new Error('Sayfa yapısı değişmiş olabilir');
    return out;
  },

  async hn() {
    const since = Math.floor(Date.now() / 1000) - 3 * 86400;
    const terms = ['AI', 'LLM', 'GPT', 'Claude', 'Gemini', 'OpenAI', 'Anthropic', 'agent', 'model', 'DeepSeek', 'Qwen', 'Llama'];
    const map = new Map();
    await Promise.all(terms.map(async (q) => {
      const r = await get(`https://hn.algolia.com/api/v1/search?tags=story&query=${encodeURIComponent(q)}&numericFilters=created_at_i>${since},points>60&hitsPerPage=40`, { json: true });
      for (const h of r.hits) if (AI_RE.test(h.title)) map.set(h.objectID, h);
    }));
    return [...map.values()].map((h) => ({
      title: h.title,
      url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
      discuss: `https://news.ycombinator.com/item?id=${h.objectID}`,
      date: toDate(h.created_at_i),
      score: h.points,
      comments: h.num_comments,
      metric: `▲ ${h.points} · 💬 ${h.num_comments || 0}`,
      engage: h.points / 80,
    }));
  },

  async showhn() {
    const since = Math.floor(Date.now() / 1000) - 4 * 86400;
    const r = await get(`https://hn.algolia.com/api/v1/search?tags=show_hn&numericFilters=created_at_i>${since},points>8&hitsPerPage=200`, { json: true });
    return r.hits
      .filter((h) => AI_RE.test(h.title + ' ' + (h.story_text || '')))
      .map((h) => ({
        title: h.title.replace(/^Show HN:\s*/i, ''),
        url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
        discuss: `https://news.ycombinator.com/item?id=${h.objectID}`,
        summary: clip(stripHtml(h.story_text || '')),
        date: toDate(h.created_at_i),
        score: h.points,
        metric: `▲ ${h.points} · 💬 ${h.num_comments || 0}`,
        engage: h.points / 40,
      }));
  },

  // Ask HN: insanların aradığı araçlar ve dertleri. Reddit RSS kapanınca (13 Kasım 2026) fikir sinyalini taşır.
  async askhn() {
    const since = Math.floor(Date.now() / 1000) - 5 * 86400;
    const r = await get(`https://hn.algolia.com/api/v1/search?tags=ask_hn&numericFilters=created_at_i>${since},points>15&hitsPerPage=100`, { json: true });
    return r.hits
      .filter((h) => AI_RE.test(h.title + ' ' + (h.story_text || '')))
      .map((h) => ({
        title: h.title,
        url: `https://news.ycombinator.com/item?id=${h.objectID}`,
        discuss: `https://news.ycombinator.com/item?id=${h.objectID}`,
        summary: clip(stripHtml(h.story_text || '')),
        date: toDate(h.created_at_i),
        score: h.points,
        metric: `▲ ${h.points} · 💬 ${h.num_comments || 0}`,
        engage: h.points / 40,
      }));
  },

  async 'hf-papers'(src) {
    const r = await get(src.url, { json: true });
    return r.map((p) => ({
      title: p.title || p.paper?.title,
      url: `https://huggingface.co/papers/${p.paper?.id}`,
      summary: clip((p.paper?.ai_summary || p.paper?.summary || '').replace(/\s+/g, ' ')),
      body: (p.paper?.summary || '').replace(/\s+/g, ' '),
      date: toDate(p.publishedAt || p.paper?.publishedAt),
      image: p.thumbnail || '',
      score: p.paper?.upvotes || 0,
      metric: `▲ ${p.paper?.upvotes || 0} oy`,
      engage: (p.paper?.upvotes || 0) / 15,
    }));
  },

  async 'hf-models'(src) {
    const r = await get(src.url, { json: true });
    return r.map((m) => ({
      title: m.id,
      url: `https://huggingface.co/${m.id}`,
      summary: [m.pipeline_tag && `Görev: ${m.pipeline_tag}`, m.downloads && `${fmtNum(m.downloads)} indirme`].filter(Boolean).join(' · '),
      date: toDate(m.createdAt),
      score: m.likes,
      metric: `♥ ${fmtNum(m.likes || 0)} · trend ${m.trendingScore ?? '–'}`,
      engage: (m.trendingScore || 0) / 40,
    }));
  },

  // Büyük lablerin Hugging Face'e yüklediği en yeni açık ağırlıklı modeller
  async 'hf-authors'(src) {
    const since = Date.now() - 21 * 86400000;
    const lists = await Promise.all(src.authors.map((a) =>
      get(`https://huggingface.co/api/models?author=${encodeURIComponent(a)}&sort=createdAt&direction=-1&limit=6`, { json: true }).catch(() => [])));
    return lists.flat()
      .filter((m) => toDate(m.createdAt) > since && !/(gguf|awq|gptq|mlx|fp8|int4|-4bit|-8bit|onnx)/i.test(m.id))
      .map((m) => ({
        title: m.id,
        url: `https://huggingface.co/${m.id}`,
        summary: [m.pipeline_tag && `Görev: ${m.pipeline_tag}`, `${fmtNum(m.downloads || 0)} indirme`].filter(Boolean).join(' · '),
        date: toDate(m.createdAt),
        metric: `♥ ${fmtNum(m.likes || 0)}`,
        engage: (m.likes || 0) / 100,
      }));
  },

  async 'hf-spaces'(src) {
    const r = await get(src.url, { json: true });
    return r.map((s) => ({
      title: s.id.split('/')[1].replace(/[-_]/g, ' '),
      url: `https://huggingface.co/spaces/${s.id}`,
      summary: [s.id.split('/')[0] + ' tarafından', s.sdk && `SDK: ${s.sdk}`].filter(Boolean).join(' · '),
      date: toDate(s.createdAt),
      score: s.likes,
      metric: `♥ ${fmtNum(s.likes || 0)}`,
      engage: (s.trendingScore || 0) / 40,
    }));
  },

  async 'gh-trending'(src) {
    const html = await get(src.url);
    const rows = html.split('<article class="Box-row">').slice(1);
    return rows.map((row) => {
      const repo = (row.match(/<h2[\s\S]*?href="\/([^"]+)"/) || [])[1] || '';
      const desc = stripHtml((row.match(/<p class="col-9[^"]*">([\s\S]*?)<\/p>/) || [])[1] || '');
      const lang = stripHtml((row.match(/itemprop="programmingLanguage">([^<]*)</) || [])[1] || '');
      const today = Number(((row.match(/([\d,]+) stars today/) || [])[1] || '0').replace(/,/g, ''));
      const total = stripHtml((row.match(/href="\/[^"]+\/stargazers"[^>]*>([\s\S]*?)<\/a>/) || [])[1] || '');
      return {
        title: repo.replace('/', ' / '),
        url: `https://github.com/${repo}`,
        summary: clip(desc),
        score: today,
        metric: `★ +${fmtNum(today)} bugün · ${total} toplam${lang ? ' · ' + lang : ''}`,
        engage: today / 150,
        lang,
      };
    }).filter((r) => r.url !== 'https://github.com/' && AI_RE.test(`${r.title} ${r.summary}`));
  },

  async 'gh-new'(src) {
    const since = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10);
    const headers = { Accept: 'application/vnd.github+json' };
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const map = new Map();
    for (const t of src.topics) {
      if (map.size) await sleep(2500); // GitHub ikincil hız sınırına takılmamak için
      const r = await get(`https://api.github.com/search/repositories?q=topic:${t}+created:>${since}&sort=stars&order=desc&per_page=12`, { json: true, headers });
      for (const it of r.items || []) map.set(it.full_name, it);
    }
    return [...map.values()]
      .sort((a, b) => b.stargazers_count - a.stargazers_count)
      .slice(0, 30)
      .map((it) => ({
        title: it.full_name.replace('/', ' / '),
        url: it.html_url,
        summary: clip(it.description || ''),
        date: toDate(it.created_at),
        score: it.stargazers_count,
        metric: `★ ${fmtNum(it.stargazers_count)} · ${it.language || 'çeşitli'}`,
        engage: it.stargazers_count / 300,
        topics: it.topics,
      }));
  },

  // OpenRouter'a yeni eklenen modeller (API'de kullanıma açılan her yeni model buraya düşer)
  async openrouter(src) {
    const r = await get('https://openrouter.ai/api/v1/models', { json: true });
    const since = Date.now() - 21 * 86400000;
    return r.data
      .filter((m) => m.created * 1000 > since && !/:(batch|free|beta|extended|thinking|online)$/.test(m.id))
      .sort((a, b) => b.created - a.created)
      .slice(0, src.limit || 25)
      .map((m) => {
        const inP = Number(m.pricing?.prompt || 0) * 1e6, outP = Number(m.pricing?.completion || 0) * 1e6;
        return {
          title: m.name,
          url: `https://openrouter.ai/${m.id}`,
          summary: clip((m.description || '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')),
          date: toDate(m.created),
          metric: `${inP ? `$${+inP.toFixed(2)}/$${+outP.toFixed(2)} per 1M` : 'ücretsiz'} · ${Math.round((m.context_length || 0) / 1000)}K bağlam`,
        };
      });
  },

  // Reddit tek IP'den sık istekte 429 veriyor; tüm subredditler tek istekte çekilir.
  async reddit(src) {
    if (!redditBatch) redditBatch = fetchRedditAll();
    const all = await redditBatch;
    const subs = new Set(src.subs.map((s) => s.toLowerCase()));
    return all.filter((i) => subs.has((i.cats[0] || '').toLowerCase()));
  },
};

let redditBatch = null;
async function fetchRedditAll() {
  const subs = SOURCES.filter((s) => s.type === 'reddit').flatMap((s) => s.subs);
  const path = `/r/${subs.join('+')}/top/.rss?t=day&limit=100`;
  let xml;
  for (const [i, host] of ['https://www.reddit.com', 'https://old.reddit.com', 'https://www.reddit.com'].entries()) {
    try {
      xml = await get(host + path, { headers: { Accept: 'application/atom+xml' } });
      break;
    } catch (e) {
      if (e.status && e.status < 500 && e.status !== 429 && e.status !== 403 && e.status !== 404) throw e;
      await sleep(10000 * (i + 1));
    }
  }
  if (!xml) throw new Error('Reddit hız sınırı (429) — önceki veriler korunuyor');
  return parseFeed(xml).map((i) => ({
    ...i,
    summary: clip(i.summary.replace(/submitted by .*$/i, '').replace(/\[link\]\s*\[comments\]/gi, '')),
    metric: i.cats[0] ? `r/${i.cats[0]}` : '',
    image: /thumbs\.redditmedia|preview\.redd/.test(i.image) ? i.image : '',
  }));
}

// ─── Çeviri ─────────────────────────────────────────────────────────────
// Google Çeviri'nin anahtarsız uç noktası; tek istekte çok metin çevirir.
const crypto = require('crypto');
const TRANSLATE_URL = 'https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=';
const hashText = (s) => crypto.createHash('sha1').update(s).digest('base64').slice(0, 16);

async function translateBatch(texts, lang) {
  const out = [];
  let chunk = [], size = 0;
  const flush = async () => {
    if (!chunk.length) return;
    const body = chunk.map((t) => 'q=' + encodeURIComponent(t)).join('&');
    const res = await fetch(TRANSLATE_URL + lang, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
      body,
    });
    if (!res.ok) throw new Error(`Çeviri HTTP ${res.status}`);
    const json = await res.json();
    // Tek metinde ["çeviri","en"], çok metinde [["çeviri","en"], ...] döner
    const rows = chunk.length === 1 ? [json] : json;
    rows.forEach((r) => out.push(Array.isArray(r) ? { text: r[0], src: r[1] } : { text: r, src: '' }));
    chunk = [];
    size = 0;
    await sleep(300);
  };
  for (const t of texts) {
    if (size + t.length > 4500 || chunk.length >= 50) await flush();
    chunk.push(t);
    size += t.length;
  }
  await flush();
  return out;
}

// Tüm başlık ve özetleri hedef dile çevirir; sonuçları state.tr'de saklar.
// Başlığı bir tanımlayıcı olan kaynaklar (repo/model adı) — başlık çevrilmez
const ID_TITLE_TYPES = new Set(['gh-trending', 'gh-new', 'hf-models', 'hf-spaces', 'hf-authors']);
const ID_TITLE_SOURCES = new Set(SOURCES.filter((s) => ID_TITLE_TYPES.has(s.type)).map((s) => s.id));
// Makine çevirisinin bozduğu özel adlar
const FIXUPS = [[/Antropik/g, 'Anthropic'], [/İkizler/g, 'Gemini'], [/Kucaklayan Yüz/gi, 'Hugging Face'], [/\bLama\b/g, 'Llama'], [/İmleç/g, 'Cursor'], [/Claude Kodu/g, 'Claude Code']];
const fixup = (t) => FIXUPS.reduce((acc, [re, rep]) => acc.replace(re, rep), t);

async function translateItems(items, lang = 'tr') {
  const cache = (state.tr[lang] ||= {});
  const todo = new Set();
  for (const it of items) {
    if (it.cat === 'tr' || it.lang === 'tr') continue;
    const texts = ID_TITLE_SOURCES.has(it.sourceId) ? [it.summary] : [it.title, it.summary];
    for (const s of texts) if (s && !cache[hashText(s)]) todo.add(s);
  }
  const list = [...todo];
  try {
    const res = await translateBatch(list, lang);
    res.forEach((r, i) => (cache[hashText(list[i])] = r.src === lang ? '=' : lang === 'tr' ? fixup(r.text) : r.text));
  } catch (e) {
    log('Çeviri hatası:', e.message);
  }
  // Kullanılmayan çevirileri temizle
  const used = new Set(items.flatMap((it) => [it.title, it.summary].filter(Boolean).map(hashText)));
  for (const k of Object.keys(cache)) if (!used.has(k)) delete cache[k];
  log(`Çeviri (${lang}): ${list.length} yeni metin`);
}

// ─── Model sıralaması (LMArena resmi veri seti, Hugging Face üzerinden) ──
const ARENAS = [['text', 'Metin'], ['webdev', 'Web geliştirme'], ['vision', 'Görsel anlama'], ['text_to_image', 'Görsel üretim'], ['text_to_video', 'Video üretim']];
async function fetchLeaderboards() {
  const out = {};
  for (const [cfg, label] of ARENAS) {
    try {
      const r = await get(`https://datasets-server.huggingface.co/rows?dataset=lmarena-ai/leaderboard-dataset&config=${cfg}&split=latest&offset=0&length=100`, { json: true });
      const rows = r.rows.map((x) => x.row).filter((x) => x.category === 'overall').sort((a, b) => a.rank - b.rank).slice(0, 10);
      if (rows.length) out[cfg] = {
        label,
        date: rows[0].leaderboard_publish_date,
        rows: rows.map((x) => ({ rank: x.rank, model: x.model_name, org: x.organization, score: Math.round(x.rating), votes: x.vote_count, open: !/proprietary/i.test(x.license || '') })),
      };
    } catch (e) {
      log('Sıralama alınamadı:', cfg, e.message);
    }
  }
  if (Object.keys(out).length) state.leaderboards = out;
}

function fmtNum(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.0', '').replace('.', ',') + ' mn';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace('.0', '').replace('.', ',') + ' bin';
  return String(n);
}

// ─── Etiketleme ──────────────────────────────────────────────────────────
const EDUCATION_TAG = /\b(educational?|education|edtech|teachers?|students?|classrooms?|schools?|tutors?|tutoring|homework|curricul(?:um|a)|k[-– ]?12)\b|(?:^|[^\p{L}\p{N}_])(?:eğitim|öğretmen|öğrenci|okul|sınav|müfredat|ders)\p{L}*/iu;
function educationContext(text) {
  return String(text || '').replace(/İ/g, 'I').toLowerCase()
    // Teknik öğretmen/öğrenci ve model eğitimi insan öğrenmesi değildir.
    .replace(/\b(?:[\w-]*distill\w*|teachers?[-– ]+students?|(?:teachers?|students?)(?:[-– ]+(?:language|neural|foundation|ai|llm))*[-– ]+models?|curriculum[-– ]+learning)\b/g, ' ')
    .replace(/(?:^|[^\p{L}])(?:model\p{L}*|llm\p{L}*|yapay zek[aâ] model\p{L}*)\s+(?:ön\s+)?eğitim\p{L}*|(?:^|[^\p{L}])(?:ön eğitim|eğitim veri|eğitilmiş|eğitirken|eğitilirken)\p{L}*/gu, ' ')
    // Bülten ve video açıklamalarındaki sabit kurs reklamları kanıt sayılmaz.
    .replace(/\b(?:maker school|skool\.com\S*|course resources|(?:the neuron )?academy|education innovation)\b/g, ' ');
}
function isEducationItem(item) {
  const title = educationContext(item.title);
  // Kurumsal dokümantasyon için kullanılan "education", okul/kurs haberi değildir.
  const corporateDocs = /\b(?:documentation|developer docs|education at .*(?:labs|inc|corp))\b/.test(title);
  const technical = /distill|teacher[-– ]student|student (?:language )?model|teacher model|curriculum learning/i.test(item.title || '');
  if (/\b(?:edtech|classrooms?|schools?|school districts?|k[-– ]?12|tutors?|tutoring|homework|curricul(?:um|a))\b|(?:^|[^\p{L}])(?:öğretmen|okul|müfredat|meb|eba)\p{L}*/u.test(title)) return true;
  if (!corporateDocs && /\b(?:educational?|education)\b/.test(title)) return true;
  if (/\bteachers?\b/.test(title) && (!technical || /\b(?:lessons?|courses?|grades?|teaching)\b/.test(title))) return true;
  if (/\b(?:students?|professors?)\b|(?:^|[^\p{L}])öğrenci\p{L}*/u.test(title) && /\b(?:lessons?|exams?|courses?|grades?|grading|study|studying|teaching|math)\b|(?:^|[^\p{L}])(?:ders|sınav|öğren)\p{L}*/u.test(title)) return true;
  const personLearning = /(?:^|[^\p{L}])(?:öğrenci|öğretmen|okul|eğitimde|kurs|akademi|meb)\p{L}*|yapay zek[aâ]\s+eğitim\p{L}*/u.test(title);
  if (personLearning && /(?:^|[^\p{L}])eğitim\p{L}*/u.test(title)) return true;
  // Eğitim kategorisinden gelen tek başına teknik ML başlıklarını da doğrula.
  if (corporateDocs || item.cat === 'video' || item.type === 'video' || /(?:youtube\.com|youtu\.be)/i.test(item.url || item.link || '')) return false;
  let summary = educationContext(item.summary);
  if (/distill|curriculum learning/i.test(item.summary || '') && !/\b(?:schools?|classrooms?|lessons?|homework|exams?|courses?|k[-– ]?12)\b/.test(summary)) summary = summary.replace(/\b(?:teachers?|students?)\b/g, ' ');
  const schooling = [
    /\bteachers?\b|(?:^|[^\p{L}])öğretmen\p{L}*/u,
    /\bclassrooms?\b|(?:^|[^\p{L}])sınıf\p{L}*/u,
    /\b(?:schools?|school districts?)\b|(?:^|[^\p{L}])okul\p{L}*/u,
    /\bk[-– ]?12\b/,
    /\bstudents?\b|(?:^|[^\p{L}])öğrenci\p{L}*/u,
    /(?:^|[^\p{L}])(?:meb|eba)(?:$|[^\p{L}])/u,
    /\blessons?\b|(?:^|[^\p{L}])ders\p{L}*/u,
  ];
  // Tek başına "students" bir pazarlama kitlesi olabilir; ikinci okul kanıtı gerekir.
  return schooling.filter((re) => re.test(summary)).length >= 2;
}
const TAGS = [
  ['Eğitim', EDUCATION_TAG],
  ['OpenAI', /\b(openai|chatgpt|gpt-?\d|sora|codex|o\d-?(mini|pro)?)\b/i],
  ['Claude', /\b(claude|anthropic)\b/i],
  ['Gemini', /\b(gemini|deepmind|gemma|veo|imagen|notebooklm)\b/i],
  ['Llama/Meta', /\b(llama|meta ai)\b/i],
  ['Qwen', /\bqwen/i],
  ['DeepSeek', /\bdeepseek/i],
  ['Mistral', /\bmistral|\bmagistral/i],
  ['Grok/xAI', /\b(grok|xai)\b/i],
  ['Ajanlar', /\b(agents?|agentic|ajan)\b/i],
  ['MCP', /\b(mcp|model context protocol)\b/i],
  ['Türkiye', /(türkiye|\btürk\b|turkish|turkey)/i],
  ['Kodlama', /\b(coding|code|copilot|cursor|claude code|vibe ?cod\w*|ide|developer)\b/i],
  ['Açık kaynak', /\b(open[- ]?source|open[- ]?weights?|açık kaynak)\b/i],
  ['Görsel', /\b(image|images|diffusion|flux|midjourney|photo)\b/i],
  ['Video', /\b(video|sora|veo|kling|runway)\b/i],
  ['Ses', /\b(voice|speech|audio|tts|music|whisper)\b/i],
  ['Robotik', /\b(robot\w*|humanoid)\b/i],
  ['Donanım', /\b(gpu|chip|nvidia|tpu|datacenter|data center)\b/i],
  ['Güvenlik', /\b(safety|security|jailbreak|alignment|misuse)\b/i],
  ['Yatırım', /\b(raises?|funding|valuation|acquires?|acquisition|ipo|\$\d+\s?(m|b|million|billion))\b/i],
  ['Regülasyon', /\b(regulat\w*|law|lawsuit|eu ai act|policy|congress|court)\b/i],
  ['Yerel LLM', /\b(local ?llm|ollama|llama\.cpp|gguf|on-device|mlx)\b/i],
];
function tagsFor(item) {
  const text = `${item.title} ${item.summary || ''}`;
  return TAGS.filter(([n, re]) => n === 'Eğitim' ? isEducationItem(item) : re.test(text)).map(([n]) => n).slice(0, 4);
}

// ─── Toplama döngüsü ─────────────────────────────────────────────────────
function normUrl(u) {
  try {
    const x = new URL(u);
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'ref', 'source'].forEach((k) => x.searchParams.delete(k));
    return (x.host.replace(/^www\./, '') + x.pathname.replace(/\/$/, '') + x.search).toLowerCase();
  } catch {
    return u;
  }
}

async function runSource(src) {
  const t0 = Date.now();
  const prev = state.sources[src.id];
  try {
    const raw = await fetchers[src.type](src);
    const items = raw.map((i) => {
      const key = normUrl(i.url);
      if (!state.seen[key]) state.seen[key] = Date.now();
      const item = {
        id: key,
        title: i.title,
        url: i.url,
        discuss: i.discuss,
        summary: i.summary || '',
        body: i.body ? i.body.slice(0, 4000) : undefined,
        image: i.image || '',
        date: i.date || state.seen[key],
        dated: Boolean(i.date),
        metric: i.metric || '',
        engage: i.engage || 0,
        source: src.name,
        sourceId: src.id,
        cat: src.cat,
        lang: src.lang || (src.cat === 'tr' ? 'tr' : 'en'),
        topic: src.topic,
        weight: src.weight,
      };
      item.tags = tagsFor(item);
      return item;
    });
    state.sources[src.id] = { items, status: { ok: true, count: items.length, ms: Date.now() - t0, at: Date.now(), lastOk: Date.now() } };
  } catch (e) {
    state.sources[src.id] = {
      items: prev?.items || [],
      status: { ok: false, error: e.name === 'AbortError' ? 'Zaman aşımı' : e.message, count: prev?.items?.length || 0, at: Date.now(), lastOk: prev?.status?.lastOk || 0 },
    };
  }
}

async function refreshAll(reason = 'zamanlayıcı') {
  if (state.refreshing) return;
  state.refreshing = true;
  log(`Yenileme başladı (${reason})`);
  const t0 = Date.now();
  const normal = SOURCES.filter((s) => s.type !== 'reddit');
  const reddit = SOURCES.filter((s) => s.type === 'reddit');

  // Eşzamanlılık sınırı: 10
  const queue = [...normal];
  await Promise.all(Array.from({ length: 10 }, async () => {
    while (queue.length) await runSource(queue.shift());
  }));
  redditBatch = null;
  for (const src of reddit) await runSource(src);

  // Listeden çıkarılmış kaynakların verilerini ve eski "görüldü" kayıtlarını temizle
  const ids = new Set(SOURCES.map((s) => s.id));
  for (const k of Object.keys(state.sources)) if (!ids.has(k)) delete state.sources[k];
  const cutoff = Date.now() - 45 * 86400000;
  for (const k of Object.keys(state.seen)) if (state.seen[k] < cutoff) delete state.seen[k];

  await fetchLeaderboards();
  await translateItems(collectItems(), 'tr');
  await buildDetails(collectItems(), state);

  state.updatedAt = Date.now();
  state.nextAt = Date.now() + REFRESH_MS;
  state.refreshing = false;
  const ok = Object.values(state.sources).filter((s) => s.status.ok).length;
  log(`Yenileme bitti: ${ok}/${SOURCES.length} kaynak, ${((Date.now() - t0) / 1000).toFixed(1)} sn`);
  saveCache();
}

const createDetails = require('./details');
const buildDetails = createDetails({ get, stripHtml, decode, clip, translateBatch, fixup, log, PUBLIC });

function collectItems() {
  const minDate = Date.now() - MAX_AGE_DAYS * 86400000;
  const byKey = new Map();
  for (const src of SOURCES) {
    for (const it of state.sources[src.id]?.items || []) {
      if (it.date < minDate) continue;
      const titleKey = it.title.toLowerCase().replace(/[^a-z0-9ğüşıöç]+/g, '').slice(0, 60);
      const existing = byKey.get(it.id) || byKey.get(titleKey);
      if (existing) {
        existing.also = [...new Set([...(existing.also || []), it.source])].filter((s) => s !== existing.source);
        existing.engage += it.engage * 0.5;
        continue;
      }
      const copy = { ...it };
      byKey.set(it.id, copy);
      byKey.set(titleKey, copy);
    }
  }
  return [...new Set(byKey.values())];
}

function buildPayload() {
  const items = collectItems();
  const now = Date.now();
  const trCache = state.tr.tr || {};
  for (const it of items) {
    it.tags = tagsFor(it);
    delete it.body;
    const det = state.details?.[it.id];
    if (det) {
      it.aid = createDetails.aidOf(it.id);
      if (!it.image && det.image) it.image = det.image;
      // Uygulama ve fikir kartlarında "ne işe yarar" açıklaması gösterilir
      if (['apps', 'ideas'].includes(it.cat)) {
        const ex = (it.lang !== 'tr' && det.tr?.lead) || det.lead;
        if (ex && ex !== it.summary) it.ex = clip(ex, 240);
      }
    }
    const t = !ID_TITLE_SOURCES.has(it.sourceId) && trCache[hashText(it.title)], s = it.summary && trCache[hashText(it.summary)];
    if ((t && t !== '=') || (s && s !== '=')) it.i18n = { tr: { t: t && t !== '=' ? fixup(t) : undefined, s: s && s !== '=' ? fixup(s) : undefined } };
  }
  for (const it of items) {
    const ageH = Math.max(it.dated ? 0 : 8, (now - it.date) / 3600000);
    const engage = 1.5 * Math.log10(1 + it.engage * 10) + (it.also?.length || 0) * 0.8;
    const lowSignal = it.metric && it.engage < 0.5 ? 0.7 : 1; // etkileşimi düşük topluluk/repo öğeleri
    it.hot = Number((((1 + engage) * it.weight * lowSignal * 100) / Math.pow(ageH + 6, 1.05)).toFixed(2));
  }
  items.sort((a, b) => b.date - a.date);

  const trendCount = {};
  for (const it of items) {
    if (now - it.date > 48 * 3600000) continue;
    for (const t of it.tags) trendCount[t] = (trendCount[t] || 0) + 1;
  }
  const trends = Object.entries(trendCount).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([name, count]) => ({ name, count }));

  return {
    updatedAt: state.updatedAt,
    nextAt: state.nextAt,
    refreshing: state.refreshing,
    trends,
    leaderboards: state.leaderboards || {},
    sources: SOURCES.map((s) => ({ id: s.id, name: s.name, cat: s.cat, url: s.url || null, lang: s.lang, topic: s.topic, handle: s.handle, why: s.why, ...(state.sources[s.id]?.status || { ok: null }) })),
    items,
  };
}

function saveCache() {
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  const { refreshing, ...rest } = state;
  fs.writeFileSync(CACHE_FILE, JSON.stringify(rest));
}
function loadCache() {
  try {
    Object.assign(state, JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')), { refreshing: false });
    log(`Önbellek yüklendi (${new Date(state.updatedAt).toLocaleString('tr-TR')})`);
  } catch {
    log('Önbellek yok, ilk tarama yapılacak');
  }
}

// ─── Eğitim Atlası ──────────────────────────────────────────────────────
const ATLAS_FILE = path.join(ROOT, 'atlas', 'edu.json');
const ATLAS_OUT = path.join(PUBLIC, 'data', 'edu-atlas.json');
const ATLAS_REFRESH_MS = 24 * 60 * 60 * 1000;
let atlasBuild = null;
let atlasLastRequest = 0;

function buildAtlas({ force = false } = {}) {
  if (atlasBuild) return atlasBuild;
  atlasBuild = buildAtlasData(force).finally(() => { atlasBuild = null; });
  return atlasBuild;
}

async function buildAtlasData(force) {
  let previous = Array.isArray(state.atlas?.categories) ? state.atlas : null;
  try {
    const saved = JSON.parse(fs.readFileSync(ATLAS_OUT, 'utf8'));
    if (Array.isArray(saved.categories) && (!previous || Number(saved.builtAt || 0) > Number(previous.builtAt || 0))) previous = saved;
  } catch {}
  if (previous && !fs.existsSync(ATLAS_OUT)) {
    fs.mkdirSync(path.dirname(ATLAS_OUT), { recursive: true });
    fs.writeFileSync(ATLAS_OUT, JSON.stringify(previous));
  }
  if (!force && previous?.builtAt > Date.now() - ATLAS_REFRESH_MS) {
    state.atlas = previous;
    return previous;
  }

  let atlas;
  try {
    atlas = JSON.parse(fs.readFileSync(ATLAS_FILE, 'utf8'));
    if (!Array.isArray(atlas.categories) || !atlas.categories.length) throw new Error('Atlas kategorileri eksik');
  } catch (e) {
    log('Eğitim Atlası okunamadı:', e.message);
    if (previous) { state.atlas = previous; return previous; }
    throw e;
  }
  const { normalizeLicense } = require('./public/lab-engine');
  const names = [...new Set(atlas.categories.flatMap((c) => (c.repos || []).map((r) => String(r.name || '').toLowerCase())))]
    .filter((n) => /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(n) && n.length + 5 <= 240);
  const batches = [];
  for (const name of names) {
    const term = 'repo:' + name;
    if (!batches.length || (batches[batches.length - 1].join(' ') + ' ' + term).trim().length > 240) batches.push([]);
    batches[batches.length - 1].push(term);
  }
  const oldRepos = new Map((previous?.categories || []).flatMap((c) => (c.repos || []).map((r) => [r.name.toLowerCase(), r])));
  const repos = new Map();
  const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  const token = process.env.GITHUB_TOKEN?.trim();
  if (token) headers.Authorization = 'Bearer ' + token;
  let failures = 0, blocked = false;
  for (const terms of batches) {
    try {
      if (blocked) throw new Error('GitHub arama sınırı veya yetkilendirme hatası');
      // Anahtarsız arama sınırı 10/dk; anahtarla da arama istekleri aralıklı gider.
      const wait = atlasLastRequest + (token ? 2100 : 6500) - Date.now();
      if (wait > 0) await sleep(wait);
      atlasLastRequest = Date.now();
      const data = await get('https://api.github.com/search/repositories?q=' + encodeURIComponent(terms.join(' ')) + '&per_page=100', { json: true, headers });
      if (!Array.isArray(data.items) || data.incomplete_results) throw new Error('GitHub eksik arama yanıtı');
      const requested = new Set(terms.map((t) => t.slice(5)));
      for (const r of data.items) {
        if (!requested.has(String(r.full_name || '').toLowerCase())) continue;
        repos.set(r.full_name.toLowerCase(), {
          name: r.full_name, url: 'https://github.com/' + r.full_name,
          desc: r.description || '', stars: Number(r.stargazers_count) || 0, forks: Number(r.forks_count) || 0,
          pushed: Date.parse(r.pushed_at) || 0, lang: r.language || '', topics: Array.isArray(r.topics) ? r.topics : [],
          license: normalizeLicense(r.license), archived: Boolean(r.archived),
        });
      }
    } catch (e) {
      failures++;
      if ([401, 403, 429].includes(e.status)) blocked = true;
      log('Atlas GitHub sorgusu yenilenemedi; önceki veriler korunuyor:', e.message);
      for (const term of terms) {
        const name = term.slice(5);
        if (oldRepos.has(name)) repos.set(name, oldRepos.get(name));
      }
    }
  }
  if (failures && failures === batches.length) {
    if (previous) { state.atlas = previous; return previous; }
    throw new Error('Eğitim Atlası için GitHub verisi alınamadı; mevcut dosya değiştirilmedi');
  }
  const built = {
    ...atlas,
    categories: atlas.categories.map((c) => ({ ...c, repos: (c.repos || []).flatMap((r) => {
      const meta = repos.get(String(r.name || '').toLowerCase());
      return meta ? [{ ...meta, why: r.why || '' }] : [];
    }) })),
    builtAt: failures ? previous?.builtAt || 0 : Date.now(),
  };
  fs.mkdirSync(path.dirname(ATLAS_OUT), { recursive: true });
  const temp = ATLAS_OUT + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(built));
  fs.renameSync(temp, ATLAS_OUT);
  state.atlas = built;
  log('Eğitim Atlası yazıldı: ' + built.categories.length + ' kategori, ' + repos.size + ' proje' + (failures ? ' (kısmi yenileme)' : ''));
  return built;
}

// ─── HTTP ────────────────────────────────────────────────────────────────
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/news') return send(res, 200, buildPayload());
  if (url.pathname === '/api/refresh' && req.method === 'POST') {
    const wait = lastManual + MANUAL_COOLDOWN_MS - Date.now();
    if (state.refreshing) return send(res, 202, { ok: true, message: 'Zaten yenileniyor' });
    if (wait > 0) return send(res, 429, { ok: false, message: `${Math.ceil(wait / 1000)} sn sonra tekrar dene` });
    lastManual = Date.now();
    refreshAll('elle').then(scheduleNext);
    return send(res, 202, { ok: true, message: 'Yenileme başladı' });
  }
  let file = path.normalize(path.join(PUBLIC, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)));
  if (!file.startsWith(PUBLIC)) return send(res, 403, 'Yasak', 'text/plain');
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, 'Bulunamadı', 'text/plain; charset=utf-8');
    send(res, 200, buf, MIME[path.extname(file)] || 'application/octet-stream');
  });
});

// Saat başı yenileme: bir sonraki tam saate hizalanır
let timer;
function scheduleNext() {
  clearTimeout(timer);
  const next = new Date();
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  state.nextAt = next.getTime();
  timer = setTimeout(() => refreshAll().then(scheduleNext), next - Date.now());
}

module.exports = { tagsFor };

if (require.main === module) {
  loadCache();
  state.tr ||= {};

  // --build: bir kez tara, public/data/news.json yaz ve çık (GitHub Actions / statik barındırma için)
  if (process.argv.includes('--atlas')) {
    buildAtlas({ force: true }).then(saveCache).catch((e) => { log(e.message); process.exitCode = 1; });
  } else if (process.argv.includes('--build')) {
    Promise.all([refreshAll('build'), buildAtlas().catch((e) => log('Atlas derlenemedi:', e.message))]).then(() => {
      const out = path.join(PUBLIC, 'data', 'news.json');
      fs.mkdirSync(path.dirname(out), { recursive: true });
      const payload = buildPayload();
      payload.static = true;
      payload.nextAt = Date.now() + REFRESH_MS;
      fs.writeFileSync(out, JSON.stringify(payload));
      saveCache();
      log(`Statik veri yazıldı: ${out} (${payload.items.length} öğe)`);
    });
  } else server.listen(PORT, () => {
    log(`YZ Radar çalışıyor → http://localhost:${PORT}`);
    buildAtlas().then(saveCache).catch((e) => log('Atlas derlenemedi:', e.message));
    const stale = Date.now() - state.updatedAt > 20 * 60 * 1000;
    (stale ? refreshAll('başlangıç') : Promise.resolve()).then(scheduleNext);
  });
}
