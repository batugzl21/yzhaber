// YZ Radar ön yüzü
const TABS = [
  { id: 'all', name: 'Gündem', color: 'var(--accent)' },
  { id: 'models', name: 'Modeller', color: 'var(--c-models)' },
  { id: 'news', name: 'Haberler', color: 'var(--c-news)', cats: ['news', 'community'] },
  { id: 'apps', name: 'Uygulamalar', color: 'var(--c-apps)' },
  { id: 'ideas', name: 'Fikirler', color: 'var(--c-ideas)' },
  { id: 'learn', name: 'Öğren', color: 'var(--c-learn)', cats: ['learn', 'research'] },
  { id: 'video', name: 'Videolar', color: 'var(--c-video)' },
  { id: 'tr', name: 'Türkçe', color: 'var(--c-tr)' },
];
const CAT_NAME = { models: 'Modeller', news: 'Haber', community: 'Topluluk', apps: 'Uygulama', ideas: 'Fikir', learn: 'Öğren', research: 'Araştırma', video: 'Video', tr: 'Türkçe' };
const PAGE = 24;

const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem('yzr.' + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('yzr.' + k, JSON.stringify(v)); } catch {} },
};

const S = {
  data: null,
  static: location.hostname.endsWith('github.io'), // bulutta sunucu yok, doğrudan data/news.json okunur
  view: 'feed', // feed | saved | guide
  tab: store.get('tab', 'all'),
  range: store.get('range', 72),
  sort: store.get('sort', 'hot'),
  vlang: store.get('vlang', ''),
  lang: store.get('lang', 'tr'),
  arena: store.get('arena', 'text'),
  q: '',
  limit: PAGE,
  saved: store.get('saved', {}),
  read: new Set(store.get('read', [])),
  lastVisit: store.get('lastVisit', Date.now() - 6 * 3600000),
  labIdx: 0,
  labItem: null,
  details: new Map(),
  openKey: null,
};
if (!TABS.some((t) => t.id === S.tab)) S.tab = 'all';
// "Ziyaret": 30 dk'dan uzun aradan sonra açılış
const lastSeen = store.get('lastSeen', 0);
if (lastSeen && Date.now() - lastSeen > 30 * 60000) {
  S.lastVisit = lastSeen;
  store.set('lastVisit', lastSeen);
}
store.set('lastSeen', Date.now());
setInterval(() => store.set('lastSeen', Date.now()), 60000);

const $ = (s) => document.querySelector(s);
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function ago(t) {
  const s = Math.max(1, (Date.now() - t) / 1000);
  if (s < 60) return 'şimdi';
  if (s < 3600) return `${Math.floor(s / 60)} dk önce`;
  if (s < 86400) return `${Math.floor(s / 3600)} sa önce`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} gün önce`;
  return new Date(t).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 2400);
}
const hostOf = (u) => { try { return new URL(u).host.replace(/^www\./, ''); } catch { return u; } };

// ─── Çeviri ─────────────────────────────────────────────────────────────
// Türkçe çeviriler sunucudan hazır gelir. Diğer diller tarayıcıda, Google Çeviri'nin
// anahtarsız uç noktasıyla ekranda görünen metinler için anında çevrilir ve saklanır.
const LANGS = [
  ['tr', 'Türkçe'], ['orig', 'Orijinal'], ['en', 'English'], ['de', 'Deutsch'], ['fr', 'Français'],
  ['es', 'Español'], ['it', 'Italiano'], ['pt', 'Português'], ['nl', 'Nederlands'], ['ru', 'Русский'],
  ['ar', 'العربية'], ['az', 'Azərbaycanca'], ['ja', '日本語'], ['ko', '한국어'], ['zh-CN', '中文'],
];
const TX = { cache: {}, pending: new Set(), timer: 0 };
const hash = (str) => {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + str.length.toString(36);
};
function txCache(lang) {
  if (!TX.cache[lang]) TX.cache[lang] = store.get('tx.' + lang, {});
  return TX.cache[lang];
}
const ID_TITLE = new Set(['ghtrending', 'ghnew', 'hfmodels', 'hfspaces', 'hforgs']);
const srcLang = (it) => (it.cat === 'tr' || it.lang === 'tr' ? 'tr' : it.lang || 'en');

// pre: sunucunun Türkçe çevirisi. undefined = bilinmiyor, null = "zaten aynı dilde"
function tx(text, pre, from) {
  if (!text || S.lang === 'orig' || from === S.lang.split('-')[0]) return text;
  if (S.lang === 'tr' && pre !== undefined) return pre || text;
  const c = txCache(S.lang)[hash(text)];
  if (c) return c === '=' ? text : c;
  TX.pending.add(text);
  clearTimeout(TX.timer);
  TX.timer = setTimeout(runTx, 120);
  return text;
}
function tr1(it, field) {
  if (field === 'title' && ID_TITLE.has(it.sourceId)) return it.title;
  const pre = it.i18n ? it.i18n.tr?.[field === 'title' ? 't' : 's'] ?? null : undefined;
  return tx(it[field], pre, srcLang(it));
}
async function runTx() {
  const lang = S.lang;
  const list = [...TX.pending].slice(0, 120);
  if (!list.length || lang === 'orig') return;
  list.forEach((t) => TX.pending.delete(t));
  const cache = txCache(lang);
  try {
    for (let i = 0; i < list.length; i += 40) {
      const part = list.slice(i, i + 40);
      const res = await fetch(`https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=${lang}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: part.map((t) => 'q=' + encodeURIComponent(t)).join('&'),
      });
      const json = await res.json();
      const rows = part.length === 1 ? [json] : json;
      rows.forEach((r, j) => {
        const [text, src] = Array.isArray(r) ? r : [r, ''];
        cache[hash(part[j])] = src === lang.split('-')[0] ? '=' : text;
      });
    }
    const keys = Object.keys(cache);
    if (keys.length > 4000) keys.slice(0, keys.length - 4000).forEach((k) => delete cache[k]);
    store.set('tx.' + lang, cache);
  } catch (e) {
    console.warn('Çeviri başarısız', e);
    return;
  }
  if (lang === S.lang) {
    const y = scrollY;
    renderMain();
    renderLab();
    if (S.openKey) renderDetail();
    scrollTo(0, y);
  }
  if (TX.pending.size) runTx();
}

// ─── Veri ───────────────────────────────────────────────────────────────
async function load(silent) {
  try {
    let data;
    if (!S.static) {
      try {
        const res = await fetch('api/news', { cache: 'no-store' });
        if (!res.ok) throw new Error(res.status);
        data = await res.json();
      } catch {
        S.static = true; // sunucu yok → statik barındırma (GitHub Pages)
      }
    }
    if (S.static) data = await fetch('data/news.json?t=' + Date.now(), { cache: 'no-store' }).then((r) => r.json());
    const changed = !S.data || data.updatedAt !== S.data.updatedAt;
    const first = !S.data;
    S.data = data;
    for (const it of data.items) it.key = it.aid || hash(it.id);
    if (changed) {
      renderAll();
      if (!first && silent) {
        toast('Yeni haberler geldi');
        window.Globe?.pulse();
      }
    }
    if (first) route();
    renderSub();
  } catch {
    $('#sub').textContent = 'Veriler yüklenemedi. Biraz sonra tekrar dene.';
  }
}

function itemsForTab() {
  const tab = TABS.find((t) => t.id === S.tab);
  let items = S.data.items;
  if (S.tab !== 'all') items = items.filter((i) => (tab.cats || [tab.id]).includes(i.cat));
  if (S.range) items = items.filter((i) => Date.now() - i.date < S.range * 3600000);
  if (S.vlang && ['video', 'all', 'learn'].includes(S.tab)) items = items.filter((i) => (srcLang(i) === 'tr') === (S.vlang === 'tr'));
  if (S.q) {
    const words = S.q.toLocaleLowerCase('tr').split(/\s+/).filter(Boolean);
    items = S.data.items.filter((i) => {
      const hay = `${i.title} ${i.summary} ${tr1(i, 'title')} ${tr1(i, 'summary')} ${i.source}`.toLocaleLowerCase('tr');
      return words.every((w) => hay.includes(w));
    });
  }
  return [...items].sort(S.sort === 'hot' && !S.q ? (a, b) => b.hot - a.hot : (a, b) => b.date - a.date);
}

// ─── Çizim ──────────────────────────────────────────────────────────────
function renderAll() {
  $('#langSel').innerHTML = LANGS.map(([id, n]) => `<option value="${id}" ${S.lang === id ? 'selected' : ''}>${n}</option>`).join('');
  renderTabs();
  renderMain();
  renderBoard();
  renderLab();
}

function renderSub() {
  const d = S.data;
  if (!d) return;
  const ok = d.sources.filter((s) => s.ok).length;
  const fresh = d.items.filter((i) => i.date > S.lastVisit && i.dated !== false).length;
  $('#sub').innerHTML = `<span class="dot"></span>${ok} kaynak · ${ago(d.updatedAt)} güncellendi${fresh ? ` · son ziyaretinden beri <b>${fresh}</b> yeni` : ''}`;
}

function renderTabs() {
  $('#tabs').innerHTML = TABS.map((t) =>
    `<button class="tab ${S.view === 'feed' && S.tab === t.id ? 'on' : ''}" data-tab="${t.id}" style="--tc:${t.color}">${t.name}</button>`).join('');
  document.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('on', S.view === b.dataset.view));
}

function cardHTML(it) {
  const isNew = it.date > S.lastVisit && it.dated !== false;
  const thumb = it.cat === 'video' && it.image ? `<img class="thumb" src="${esc(it.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : '';
  const summary = it.cat === 'video' ? '' : tr1(it, 'summary');
  return `
  <article class="card ${S.read.has(it.id) ? 'read' : ''}" data-cat="${it.cat}" data-open="${esc(it.key)}" tabindex="0" role="link">
    ${thumb}
    <div class="meta">${isNew ? '<span class="new" title="Yeni"></span>' : ''}<span class="src">${esc(it.source)}</span><span>· ${it.dated === false ? 'bugün' : ago(it.date)}</span></div>
    <h3 class="title">${esc(tr1(it, 'title'))}</h3>
    ${summary ? `<p class="summary">${esc(summary)}</p>` : ''}
  </article>`;
}

function renderMain() {
  if (!S.data) return;
  const feedView = S.view === 'feed';
  $('.layout').classList.toggle('wide', !feedView);
  $('#controls').hidden = !feedView;
  $('#feed').hidden = !feedView && S.view !== 'saved';
  $('#page').hidden = feedView;
  $('#brief').innerHTML = '';
  $('#more').hidden = true;

  if (S.view === 'guide') {
    $('#feed').hidden = true;
    return renderGuide();
  }
  if (S.view === 'saved') {
    const list = Object.values(S.saved).sort((a, b) => b.savedAt - a.savedAt);
    $('#page').innerHTML = `<div class="page-head"><h2>Kaydedilenler</h2><p>${list.length ? `${list.length} haber` : 'Bir haberin sayfasındaki “Kaydet” ile buraya ekleyebilirsin.'}</p></div>`;
    $('#feed').hidden = !list.length;
    $('#feed').innerHTML = list.map(cardHTML).join('');
    return;
  }

  document.querySelectorAll('#range button').forEach((b) => b.classList.toggle('on', Number(b.dataset.range) === S.range));
  document.querySelectorAll('#sort button').forEach((b) => b.classList.toggle('on', b.dataset.sort === S.sort));
  document.querySelectorAll('#vlang button').forEach((b) => b.classList.toggle('on', b.dataset.vlang === S.vlang));
  $('#vlang').hidden = !['video', 'learn'].includes(S.tab);

  let items = itemsForTab();
  if (S.tab === 'all' && !S.q) {
    const brief = renderBrief();
    items = items.filter((i) => !brief.has(i.id));
  }
  const page = items.slice(0, S.limit);
  $('#feed').innerHTML = (S.tab === 'all' && !S.q ? '<h2 class="section-title" style="grid-column:1/-1;margin-bottom:0">Diğer haberler</h2>' : '') +
    (page.length ? page.map(cardHTML).join('') : `<div class="empty">${S.q ? 'Aramana uygun haber bulunamadı.' : 'Bu aralıkta haber yok. “Hafta”yı seçmeyi dene.'}</div>`);
  $('#more').hidden = items.length <= S.limit;
}

// Gündem sekmesinin başı: her kategoriden son 24 saatin en önemli haberi
function renderBrief() {
  const used = new Set();
  const rows = [];
  for (const t of TABS.slice(1)) {
    const cats = t.cats || [t.id];
    const pool = S.data.items.filter((i) => cats.includes(i.cat) && i.dated !== false);
    const best = pool.filter((i) => Date.now() - i.date < 86400000).sort((a, b) => b.hot - a.hot)[0]
      || pool.filter((i) => Date.now() - i.date < 3 * 86400000).sort((a, b) => b.hot - a.hot)[0];
    if (best) {
      rows.push([t, best]);
      used.add(best.id);
    }
  }
  $('#brief').innerHTML = `
    <section class="brief">
      <h2>Günün özeti · ${new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}</h2>
      <ol class="brief-list">${rows.map(([t, it]) => `
        <li><button data-open="${esc(it.key)}" style="--cc:${t.color}">
          <span class="cat">${t.name}</span>
          <span class="t">${esc(tr1(it, 'title'))}<span class="s">${esc(it.source)} · ${ago(it.date)}</span></span>
        </button></li>`).join('')}
      </ol>
    </section>`;
  return used;
}

function renderGuide() {
  const st = Object.fromEntries(S.data.sources.map((s) => [s.id, s]));
  const ok = S.data.sources.filter((s) => s.ok).length;
  const ch = S.data.sources.filter((s) => s.handle);
  const mk = (tr) => ch.filter((s) => (s.lang === 'tr') === tr).map((s) => ({ id: s.id, name: s.name + (s.topic ? ` · ${s.topic}` : ''), url: `https://www.youtube.com/@${s.handle}`, why: s.why || '' }));
  const sections = [
    ...window.GUIDE,
    { title: 'YouTube · Türkçe kanallar', desc: 'Her kanal canlı doğrulandı. Son videolar “Videolar” sekmesinde.', items: mk(true) },
    { title: 'YouTube · Yabancı kanallar', desc: 'Haber, araç, yapım, araştırma ve röportaj kanalları.', items: mk(false) },
  ];
  $('#page').innerHTML = `
    <div class="page-head"><h2>Kaynak rehberi</h2>
    <p>Haberler nereden geliyor, neyi neden takip etmelisin? Şu an ${ok}/${S.data.sources.length} kaynak sorunsuz çalışıyor. <span class="glist"><span class="st ok"></span></span>çalışıyor · <span class="glist"><span class="st bad"></span></span>son denemede hata</p></div>` +
    sections.map((sec, i) => `
    <details class="gsec" ${i === 0 ? 'open' : ''}>
      <summary><h3>${esc(sec.title)}</h3><span>${sec.items.length}</span></summary>
      <p class="gdesc">${esc(sec.desc)}</p>
      <ul class="glist">${sec.items.map((it) => {
        const s = it.id && st[it.id];
        const dot = s ? `<span class="st ${s.ok ? 'ok' : 'bad'}"></span>` : '';
        const name = it.url ? `<a href="${esc(it.url)}">${dot}<b>${esc(it.name)}</b></a>` : `${dot}<b>${esc(it.name)}</b>`;
        return `<li>${name}<span class="why">${esc(it.why)}</span></li>`;
      }).join('')}</ul>
    </details>`).join('');
}

function renderBoard() {
  const lb = S.data.leaderboards || {};
  const keys = Object.keys(lb);
  if (!keys.length) return ($('#board').innerHTML = '<li>Veri bekleniyor</li>');
  if (!lb[S.arena]) S.arena = keys[0];
  $('#arenaSel').innerHTML = keys.map((k) => `<option value="${k}" ${k === S.arena ? 'selected' : ''}>${esc(lb[k].label)}</option>`).join('');
  const b = lb[S.arena];
  $('#board').innerHTML = b.rows.slice(0, 8).map((r) => `
    <li><span class="rk">${r.rank}</span><span class="mn">${esc(r.model)}${r.open ? '<small>açık</small>' : ''}</span><span class="sc">${r.score}</span></li>`).join('');
  $('#boardNote').innerHTML = `LMArena · insan oylarıyla puan · ${esc(b.date || '')}`;
}

// ─── Fikir Laboratuvarı ─────────────────────────────────────────────────
const NICHES = ['diş klinikleri', 'emlak danışmanları', 'YKS/LGS öğrencileri', 'kafe ve restoranlar', 'mali müşavirler', 'içerik üreticileri', 'avukatlar', 'spor salonları', 'veteriner klinikleri', 'mahalle esnafı', 'e-ticaret satıcıları', 'freelance tasarımcılar', 'öğretmenler', 'küçük oteller', 'İK ekipleri', 'güzellik salonları'];
const FORMS = ['WhatsApp botu', 'Chrome eklentisi', 'Telegram botu', 'web uygulaması', 'mobil uygulama', 'Claude skill’i / MCP sunucusu', 'masaüstü uygulaması', 'Türkçe sesli asistan'];
const MODELS = ['aylık abonelik', 'ücretsiz + premium', 'kullanım başına kredi', 'tek seferlik lisans', 'ajanslara beyaz etiket'];
const pick = (arr, seed) => arr[Math.abs(seed) % arr.length];

function ideaFor(it, salt = 0) {
  const seed = [...it.id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7) + salt * 13;
  const niche = pick(NICHES, seed), form = pick(FORMS, seed >> 3), model = pick(MODELS, seed >> 6);
  const title = tr1(it, 'title');
  const prompt = `Şu projeden ilham alarak bir uygulama fikri geliştirmek istiyorum:\n\n"${title}" (${it.source}) — ${it.url}\n\nBunu ${niche} için bir ${form} olarak uyarlamak istiyorum, gelir modeli: ${model}.\n\n1) Bağlantıdaki projenin ne yaptığını kısaca açıkla.\n2) Bu hedef kitlenin en büyük 3 problemini ve uygulamanın çözümünü yaz.\n3) Bir hafta sonunda yapılabilecek MVP planı çıkar (teknoloji, ekranlar, hangi YZ modeli/API).\n4) İlk 10 müşteriyi nasıl bulacağımı ve fiyatı öner.\n5) Rakipleri ve beni farklı kılacak 2 özelliği söyle.`;
  return { niche, form, model, title, prompt };
}
function renderLab() {
  if (!S.data) return;
  const list = S.data.items.filter((i) => ['apps', 'ideas', 'video'].includes(i.cat) && Date.now() - i.date < 7 * 86400000).sort((a, b) => b.hot - a.hot).slice(0, 50);
  if (!list.length) return ($('#labBody').innerHTML = '<p class="note">Henüz veri yok.</p>');
  const it = S.labItem || list[S.labIdx % list.length];
  const idea = ideaFor(it, S.labIdx);
  S.labPrompt = idea.prompt;
  $('#labBody').innerHTML = `
    <p class="lab-from">İlham: <a href="#/h/${esc(it.key)}">${esc(idea.title.slice(0, 60))}</a></p>
    <h4>Bunu <em>${esc(idea.niche)}</em> için uyarla</h4>
    <dl><dt>Biçim</dt><dd>${esc(idea.form)}</dd><dt>Gelir</dt><dd>${esc(idea.model)}</dd></dl>
    <button class="btn primary full" data-copy="lab">Claude için prompt'u kopyala</button>`;
}

// ─── Haber detay sayfası ────────────────────────────────────────────────
function findByKey(key) {
  return S.data?.items.find((i) => i.key === key) || Object.values(S.saved).find((i) => i.key === key);
}
async function loadDetail(it) {
  if (!it.aid || S.details.has(it.aid)) return;
  S.details.set(it.aid, null);
  try {
    const d = await fetch(`data/a/${it.aid}.json`).then((r) => (r.ok ? r.json() : null));
    S.details.set(it.aid, d || {});
  } catch {
    S.details.set(it.aid, {});
  }
  if (S.openKey === it.key) renderDetail();
}

function renderDetail() {
  const it = findByKey(S.openKey);
  const box = $('#detailBody');
  if (!it) {
    box.innerHTML = `<button class="back" data-back>← Geri</button><p>Bu haber artık listede değil.</p>`;
    return;
  }
  const d = it.aid ? S.details.get(it.aid) : {};
  if (d === undefined) loadDetail(it);
  const loading = d === undefined || d === null;
  const from = srcLang(it);
  const title = tr1(it, 'title');
  const lead = d?.lead ? tx(d.lead, d.tr ? d.tr.lead : undefined, from) : tr1(it, 'summary');
  const points = (d?.points || []).map((p, i) => tx(p, d.tr ? d.tr.points?.[i] : undefined, from)).filter((p) => p && p !== lead);
  const tab = TABS.find((t) => (t.cats || [t.id]).includes(it.cat)) || TABS[0];
  const img = d?.image || it.image;
  const media = d?.video
    ? `<iframe class="d-media" src="https://www.youtube-nocookie.com/embed/${esc(d.video)}" title="Video" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`
    : img ? `<img class="d-media" src="${esc(img)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : '';
  const facts = [it.metric, ...(it.tags || []).map((t) => '#' + t), it.also?.length ? `${it.also.length + 1} kaynakta geçiyor` : ''].filter(Boolean);
  const saved = !!S.saved[it.id];
  const foreign = from !== 'tr' && !/youtube\.com/.test(it.url);
  const readLang = S.lang === 'orig' ? 'tr' : S.lang;
  const related = S.data.items
    .filter((x) => x.id !== it.id && (x.tags || []).some((t) => (it.tags || []).includes(t)) && Date.now() - x.date < 7 * 86400000)
    .sort((a, b) => b.hot - a.hot).slice(0, 5);
  const showIdea = ['apps', 'ideas', 'video'].includes(it.cat);
  const idea = showIdea ? ideaFor(it) : null;
  if (idea) S.detailPrompt = idea.prompt;

  box.style.setProperty('--cc', tab.color);
  box.innerHTML = `
    <button class="back" data-back>← Geri</button>
    <div class="d-meta"><span class="d-cat">${CAT_NAME[it.cat] || ''}</span><span>·</span><span>${esc(it.source)}</span><span>·</span><span>${it.dated === false ? 'bugün listede' : ago(it.date)}</span></div>
    <h1 class="d-title">${esc(title)}</h1>
    ${title !== it.title ? `<p class="d-orig">Orijinal başlık: ${esc(it.title)}</p>` : '<div style="height:18px"></div>'}
    ${media}
    ${loading ? '<div class="loading-line"></div><div class="loading-line" style="width:80%"></div><div class="loading-line" style="width:60%"></div>' : `
      ${lead ? `<p class="d-lead">${esc(lead)}</p>` : '<p class="d-lead" style="color:var(--muted)">Bu haber için özet çıkarılamadı. Ayrıntılar kaynakta.</p>'}
      ${points.length ? `<h3 class="d-h">Öne çıkanlar</h3><ul class="d-points">${points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}`}
    ${facts.length ? `<div class="d-facts">${facts.map((f) => `<span>${esc(f)}</span>`).join('')}</div>` : ''}
    <div class="d-actions">
      <p>Daha derinlemesine okumak ister misin?</p>
      <a class="btn primary" href="${esc(it.url)}">Kaynakta oku ↗</a>
      ${foreign && readLang !== 'en' ? `<a class="btn" href="https://translate.google.com/translate?sl=auto&tl=${readLang}&u=${encodeURIComponent(it.url)}">Çeviriyle oku ↗</a>` : ''}
      ${it.discuss ? `<a class="btn" href="${esc(it.discuss)}">Tartışma ↗</a>` : ''}
      <button class="btn" data-save>${saved ? '★ Kaydedildi' : '☆ Kaydet'}</button>
    </div>
    <p class="d-note">Bu özet ${esc(hostOf(it.url))} sayfasından otomatik çıkarıldı${from !== 'tr' && S.lang === 'tr' ? ' ve Türkçeye çevrildi' : ''}. Kesin bilgi için kaynağı oku.</p>
    ${idea ? `<div class="d-idea"><h4>Bundan bir fikir çıkar</h4><p>Bunu <b>${esc(idea.niche)}</b> için bir <b>${esc(idea.form)}</b> olarak uyarlamak üzere hazır bir prompt.</p><button class="btn" data-copy="detail">Claude için prompt'u kopyala</button></div>` : ''}
    ${related.length ? `<h3 class="d-h">Benzer haberler</h3><ul class="related">${related.map((r) => `<li><button data-open="${esc(r.key)}"><span class="t">${esc(tr1(r, 'title'))}</span><span class="s">${esc(r.source)} · ${ago(r.date)}</span></button></li>`).join('')}</ul>` : ''}`;
}

function openDetail(key) {
  location.hash = '#/h/' + key;
}
function route() {
  const m = location.hash.match(/^#\/h\/(.+)$/);
  if (m && S.data) {
    S.openKey = decodeURIComponent(m[1]);
    const it = findByKey(S.openKey);
    if (it) {
      S.read.add(it.id);
      store.set('read', [...S.read].slice(-1000));
    }
    renderDetail();
    $('#detail').hidden = false;
    $('#detail').scrollTop = 0;
    document.body.classList.add('locked');
  } else {
    S.openKey = null;
    $('#detail').hidden = true;
    document.body.classList.remove('locked');
  }
}
addEventListener('hashchange', () => {
  const wasOpen = S.openKey;
  route();
  if (wasOpen && !S.openKey) renderMain(); // okundu işaretlerini güncelle
});

// ─── Dış bağlantı onayı ─────────────────────────────────────────────────
let pendingUrl = null;
function askLeave(url) {
  pendingUrl = url;
  $('#leaveHost').textContent = hostOf(url);
  $('#leave').hidden = false;
  $('#leaveYes').focus();
}
function closeLeave() {
  $('#leave').hidden = true;
  pendingUrl = null;
}
$('#leaveYes').addEventListener('click', () => {
  if (pendingUrl) window.open(pendingUrl, '_blank', 'noopener');
  closeLeave();
});
$('#leaveNo').addEventListener('click', closeLeave);
$('#leave').addEventListener('click', (e) => e.target.id === 'leave' && closeLeave());

// ─── Olaylar ────────────────────────────────────────────────────────────
function setView(view) {
  S.view = S.view === view && view !== 'feed' ? 'feed' : view;
  S.limit = PAGE;
  renderTabs();
  renderMain();
  window.scrollTo({ top: Math.min(scrollY, $('#hero').offsetHeight), behavior: 'smooth' });
}

document.addEventListener('click', async (e) => {
  // Harici bağlantılar her zaman onay ister
  const a = e.target.closest('a[href]');
  if (a && /^https?:/.test(a.getAttribute('href')) && new URL(a.href).host !== location.host) {
    e.preventDefault();
    return askLeave(a.href);
  }
  const t = e.target.closest('[data-open],[data-tab],[data-view],[data-home],[data-range],[data-sort],[data-vlang],[data-back],[data-save],[data-copy],#more,#labShuffle');
  if (!t) return;
  if (t.dataset.open) return openDetail(t.dataset.open);
  if (t.dataset.home !== undefined) { e.preventDefault(); S.tab = 'all'; return setView('feed'); }
  if (t.dataset.tab) { S.tab = t.dataset.tab; store.set('tab', S.tab); return setView('feed'); }
  if (t.dataset.view) return setView(t.dataset.view);
  if (t.dataset.range) { S.range = Number(t.dataset.range); store.set('range', S.range); S.limit = PAGE; return renderMain(); }
  if (t.dataset.sort) { S.sort = t.dataset.sort; store.set('sort', S.sort); return renderMain(); }
  if (t.dataset.vlang !== undefined) { S.vlang = t.dataset.vlang; store.set('vlang', S.vlang); S.limit = PAGE; return renderMain(); }
  if (t.dataset.back !== undefined) return history.length > 1 ? history.back() : (location.hash = '');
  if (t.id === 'more') { S.limit += PAGE; return renderMain(); }
  if (t.id === 'labShuffle') { S.labIdx++; S.labItem = null; return renderLab(); }
  if (t.dataset.copy) {
    const text = t.dataset.copy === 'lab' ? S.labPrompt : S.detailPrompt;
    await navigator.clipboard.writeText(text).catch(() => {});
    return toast('Kopyalandı — Claude’a yapıştırabilirsin');
  }
  if (t.dataset.save !== undefined) {
    const it = findByKey(S.openKey);
    if (!it) return;
    if (S.saved[it.id]) delete S.saved[it.id];
    else S.saved[it.id] = { ...it, savedAt: Date.now() };
    store.set('saved', S.saved);
    toast(S.saved[it.id] ? 'Kaydedildi' : 'Kayıttan çıkarıldı');
    renderDetail();
  }
});

$('#langSel').addEventListener('change', (e) => {
  S.lang = e.target.value;
  store.set('lang', S.lang);
  TX.pending.clear();
  renderMain();
  renderLab();
  if (S.openKey) renderDetail();
});
$('#arenaSel').addEventListener('change', (e) => { S.arena = e.target.value; store.set('arena', S.arena); renderBoard(); });

let qT;
$('#q').addEventListener('input', (e) => {
  clearTimeout(qT);
  qT = setTimeout(() => {
    S.q = e.target.value.trim();
    S.limit = PAGE;
    if (S.view !== 'feed') S.view = 'feed';
    renderTabs();
    renderMain();
  }, 150);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!$('#leave').hidden) return closeLeave();
    if (S.openKey) return history.back();
  }
  if (e.key === 'Enter' && e.target.matches('.card[data-open]')) return openDetail(e.target.dataset.open);
  if (e.target.matches('input, select, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === '/') { e.preventDefault(); $('#q').focus(); }
});

// ─── Başlat ─────────────────────────────────────────────────────────────
$('#feed').innerHTML = Array.from({ length: 6 }, () => '<div class="skel"></div>').join('');
load();
setInterval(renderSub, 60000);
setInterval(() => load(true), 5 * 60 * 1000);
document.addEventListener('visibilitychange', () => !document.hidden && load(true));
