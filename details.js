// Haber detay sayfası içeriği: her haber için kaynağından kısa bir özet, öne çıkan
// birkaç cümle, görsel/video bilgisi çıkarır ve Türkçeye çevirir.
// Sonuçlar public/data/a/<aid>.json dosyalarına yazılır; site bunları istek üzerine okur.
// Not: Makalenin tamamı kopyalanmaz — kısa alıntı + kaynağa bağlantı.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const VERSION = 4;
const MAX_PER_RUN = 700; // bir taramada en fazla bu kadar yeni sayfa çekilir
const DETAIL_DAYS = 10;

const aidOf = (id) => crypto.createHash('sha1').update(id).digest('hex').slice(0, 14);

const STOP = new Set(('the a an and or but of to in on for with by at from as is are was were be been it its this that these those ' +
  'has have had will would can could should may might not no so if than then into about over after before more most also just ' +
  'their they them there here what which who whom when where why how all any some such our your you we he she his her i me my ' +
  've bir ve ile için bu da de ki çok daha gibi olan olarak ise ancak veya hem her şu o').split(' '));
const JUNK = /(cookie|subscribe|sign up|newsletter|advertis|all rights reserved|©|javascript|log in|create an account|related:|read more|click here|follow us|share this|this article|©|privacy policy|terms of service|bültenimize|abone ol|çerez|posts from this|email digest|homepage feed|sign in|getty images|image credits|photo by|editor’s note|editor's note|we may earn|affiliate)/i;
const BYLINE = /(\b\d{1,2}:\d{2}\s?(am|pm|pdt|pst|edt|est|utc|gmt)\b|\bupdated\b.*\b20\d\d\b|^by [A-Z])/i;

function sentences(text) {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=["“'(]?[A-ZÇĞİÖŞÜ0-9])/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 50 && s.length <= 280 && !JUNK.test(s) && !BYLINE.test(s) && !/[:,;]$/.test(s));
}

// Basit çıkarımsal özet: metinde en sık geçen anlamlı kelimeleri taşıyan cümleler
function keySentences(text, n, exclude = '') {
  const sents = sentences(text);
  if (!sents.length) return [];
  const freq = {};
  for (const w of text.toLowerCase().match(/[a-zçğıöşü0-9]{4,}/g) || []) if (!STOP.has(w)) freq[w] = (freq[w] || 0) + 1;
  const ex = exclude.toLowerCase().slice(0, 80);
  const scored = sents.map((s, i) => {
    const words = s.toLowerCase().match(/[a-zçğıöşü0-9]{4,}/g) || [];
    const score = words.reduce((a, w) => a + (freq[w] || 0), 0) / Math.sqrt(words.length + 1);
    return { s, i, score: score * (i < 4 ? 1.25 : 1) };
  }).filter((x) => !ex || !x.s.toLowerCase().startsWith(ex.slice(0, 40)));
  const top = scored.sort((a, b) => b.score - a.score).slice(0, n).sort((a, b) => a.i - b.i);
  const out = [];
  let total = 0;
  for (const t of top) {
    if (total + t.s.length > 950) break;
    out.push(t.s);
    total += t.s.length;
  }
  return out;
}

function mdToText(md) {
  return md
    .replace(/^---[\s\S]*?---/, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#+\s*(.*)$/gm, '$1.')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/[*_`>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = function createDetails({ get, stripHtml, decode, clip, translateBatch, fixup, log, PUBLIC }) {
  const outDir = path.join(PUBLIC, 'data', 'a');

  async function extract(it) {
    const url = it.url;
    const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]{11})/);
    if (yt) {
      const body = it.body || it.summary || '';
      const lead = clip(body, 320);
      // Öne çıkanlar, özette zaten görünen kısmın devamından seçilir
      return { kind: 'video', video: yt[1], lead, points: keySentences(body.slice(Math.max(0, lead.length - 1)), 3) };
    }
    const u = new URL(url);
    const host = u.host.replace(/^www\./, '');
    const parts = u.pathname.split('/').filter(Boolean);

    if (host === 'github.com' && parts.length === 2) {
      const md = await get(`https://raw.githubusercontent.com/${parts[0]}/${parts[1]}/HEAD/README.md`, { timeout: 10000 }).catch(() => '');
      const text = mdToText(md);
      return { kind: 'repo', lead: it.summary || clip(text, 300), points: keySentences(text.slice(0, 6000), 4, it.summary) };
    }
    if (host === 'huggingface.co' && parts[0] === 'papers') {
      const text = it.body || it.summary;
      const s = sentences(text);
      return { kind: 'paper', lead: s.slice(0, 2).join(' ') || it.summary, points: keySentences(s.slice(2).join(' '), 3) };
    }
    if (host === 'huggingface.co' && parts.length >= 2) {
      const id = parts[0] === 'spaces' ? parts.slice(0, 3).join('/') : parts.slice(0, 2).join('/');
      const md = await get(`https://huggingface.co/${id}/raw/main/README.md`, { timeout: 10000 }).catch(() => '');
      const text = mdToText(md);
      return { kind: 'model', lead: clip(sentences(text).slice(0, 2).join(' ') || it.summary, 320), points: keySentences(text.slice(0, 6000), 3) };
    }
    if (host === 'news.google.com') return { kind: 'link', lead: '', points: [] };
    if (host.endsWith('reddit.com') || host === 'news.ycombinator.com' || host === 'openrouter.ai') {
      const text = it.body || it.summary || '';
      return { kind: 'post', lead: clip(text, 320), points: keySentences(text, 3) };
    }

    // Genel makale sayfası
    const html = await get(url, { timeout: 10000 });
    const meta = (name) => {
      const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i'))
        || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${name}["']`, 'i'));
      return m ? decode(m[1]).trim() : '';
    };
    const region = (html.match(/<article[\s\S]*?<\/article>/i) || [html])[0];
    const paras = [...region.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
      .map((m) => stripHtml(m[1]))
      .filter((p) => p.length > 60 && p.length < 1500 && !JUNK.test(p));
    const text = paras.slice(0, 30).join(' ');
    const desc = meta('og:description') || meta('description') || meta('twitter:description');
    const lead = clip(desc.length > 40 ? desc : it.summary || paras[0] || '', 340);
    let image = meta('og:image') || meta('twitter:image');
    if (image && !/^https?:/.test(image)) image = '';
    return { kind: 'article', lead, points: keySentences(text, 4, lead), image, words: text.split(' ').length };
  }

  // Tüm güncel haberler için detayları hazırlar ve dosyaları yazar
  return async function buildDetails(items, state, lang = 'tr') {
    state.details ||= {};
    const minDate = Date.now() - DETAIL_DAYS * 86400000;
    const todo = items.filter((it) => it.date > minDate && state.details[it.id]?.v !== VERSION)
      .sort((a, b) => b.date - a.date)
      .slice(0, MAX_PER_RUN);

    let ok = 0;
    const queue = [...todo];
    await Promise.all(Array.from({ length: 8 }, async () => {
      while (queue.length) {
        const it = queue.shift();
        let d;
        try {
          d = await extract(it);
          ok++;
        } catch {
          d = { kind: 'article', lead: it.summary || '', points: [], fail: true };
        }
        state.details[it.id] = { v: VERSION, at: Date.now(), ...d };
      }
    }));

    // Türkçe çeviri (kaynak dili Türkçe olmayanlar)
    const need = [];
    for (const it of items) {
      const d = state.details[it.id];
      if (!d || d.tr || it.lang === 'tr' || it.cat === 'tr') continue;
      need.push([it.id, [d.lead || '', ...(d.points || [])]]);
    }
    const flat = need.flatMap(([, t]) => t).map((t) => t || ' ');
    if (flat.length) {
      try {
        const res = await translateBatch(flat, lang);
        let k = 0;
        for (const [id, texts] of need) {
          const tr = res.slice(k, k + texts.length).map((r) => r.text);
          k += texts.length;
          state.details[id].tr = { lead: fixup(tr[0]), points: tr.slice(1).map(fixup) };
        }
      } catch (e) {
        log('Detay çevirisi başarısız:', e.message);
      }
    }

    // Dosyaları yaz, eskileri temizle
    fs.mkdirSync(outDir, { recursive: true });
    const keep = new Set();
    for (const it of items) {
      const d = state.details[it.id];
      if (!d) continue;
      const aid = aidOf(it.id);
      keep.add(aid + '.json');
      const { v, at, ...pub } = d;
      fs.writeFileSync(path.join(outDir, aid + '.json'), JSON.stringify(pub));
    }
    for (const f of fs.readdirSync(outDir)) if (!keep.has(f)) fs.unlinkSync(path.join(outDir, f));
    const live = new Set(items.map((i) => i.id));
    for (const id of Object.keys(state.details)) if (!live.has(id)) delete state.details[id];
    log(`Detaylar: ${todo.length} yeni sayfa (${ok} başarılı), ${need.length} çeviri, ${keep.size} dosya`);
  };
};

module.exports.aidOf = aidOf;
