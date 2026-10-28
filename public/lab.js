// Fikir Lab arayüzü: tek kutu, tek düğme; sonuçlar yukarıdan aşağıya bir cevap gibi okunur.
// Arama mantığı lab-engine.js içinde. Burada yalnızca çizim ve etkileşim var.
// app.js globalleri (S, $, esc, store, toast, copy, ago…) bu dosyadan sonra yüklenir; yalnızca fonksiyon içinde kullanılır.
const L = { run: null, ctrl: null, err: null, draft: '', raf: 0, http: null, httpT: 0, mode: null, atlas: null, atlasTask: null, atlasState: '', category: '', level: '' };

const LAB_EX = [
  'Kuaförler için WhatsApp’tan randevu alan bir asistan',
  'LGS’ye hazırlanan öğrenciler için yanlış soruları tekrar ettiren uygulama',
  'Öğretmenler için kazanıma uygun ders planı ve rubrik hazırlayan asistan',
  'Küçük esnaf için fatura ve stok takibi',
  'Toplantı kayıtlarını özetleyen Chrome eklentisi',
];
const LAB_STEPS = [['plan', 'Fikir anlaşılıyor'], ['github', 'GitHub taranıyor'], ['hn', 'Tartışmalar okunuyor'], ['rank', 'Sıralanıyor']];
const labSvg = (p) => `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const LAB_KINDS = {
  fork: { t: 'Hazır bir temel var', i: labSvg('<circle cx="6" cy="5" r="2.2"/><circle cx="18" cy="5" r="2.2"/><circle cx="12" cy="19" r="2.2"/><path d="M6 7.2v2.3c0 1 .8 1.8 1.8 1.8h8.4c1 0 1.8-.8 1.8-1.8V7.2M12 11.3v5.5"/>') },
  build: { t: 'Parçalar hazır', i: labSvg('<rect x="3.5" y="13" width="7" height="7" rx="1.6"/><rect x="13.5" y="13" width="7" height="7" rx="1.6"/><rect x="8.5" y="4" width="7" height="7" rx="1.6"/>') },
  crowded: { t: 'Kalabalık bir alan', i: labSvg('<circle cx="9" cy="8" r="3"/><path d="M3.5 19c.5-3 2.7-5 5.5-5s5 2 5.5 5"/><circle cx="17" cy="9" r="2.4"/><path d="M16.5 14.2c2.4.2 4 1.9 4.5 4.3"/>') },
  gap: { t: 'Boşluk olabilir', i: labSvg('<path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/>') },
};

// ─── Yardımcılar ────────────────────────────────────────────────────────
const labUrl = (u) => (/^https:\/\//i.test(u || '') ? u : '');
const labTs = (x) => (typeof x === 'number' ? (x < 1e12 ? x * 1000 : x) : Date.parse(x) || 0);
const labBold = (t) => esc(t || '').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
const labClip = (t, n) => (t.length <= n ? t : t.slice(0, n).replace(/\s+\S*$/, '') + '…');
function labNum(n) {
  n = Number(n) || 0;
  const f = (v) => v.toFixed(1).replace('.', ',').replace(/,0$/, '');
  if (n >= 1e6) return f(n / 1e6) + ' milyon';
  if (n >= 1e4) return Math.round(n / 1e3) + ' bin';
  if (n >= 1e3) return f(n / 1e3) + ' bin';
  return String(n);
}
function labDate(d) {
  const t = labTs(d);
  return t ? new Date(t).toLocaleDateString('tr-TR', { month: 'short', year: 'numeric' }) : '';
}
function labFresh(pushed) {
  const t = labTs(pushed);
  if (!t) return null;
  const d = Math.floor((Date.now() - t) / 864e5);
  if (d < 1) return { t: 'bugün güncellendi', c: 'good' };
  if (d < 30) return { t: `${d} gün önce güncellendi`, c: d <= 14 ? 'good' : '' };
  if (d < 365) return { t: `${Math.floor(d / 30)} ay önce güncellendi`, c: d <= 90 ? 'good' : '' };
  return { t: `${Math.floor(d / 365)} yıldır durgun`, c: 'dim' };
}
function labLicense(l) {
  const id = l?.id && l.id !== 'NOASSERTION' ? l.id : '';
  const k = l?.kind;
  if (k === 'permissive') return { t: `Serbest${id ? ` (${id})` : ''}`, c: 'good', tip: 'Ticari kullanıma izin veren lisans' };
  if (k === 'copyleft') return { t: `Dikkat: ${id || 'GPL'}`, c: 'warn', tip: 'Kodunu açman gerekebilir' };
  if (k === 'none') return { t: 'Lisans yok', c: 'bad', tip: 'Lisans belirtilmemiş; izinsiz kullanılamaz' };
  return { t: id ? `Lisans: ${id}` : 'Lisansı kontrol et', c: '', tip: '' };
}
const labSlug = (s) => String(s).toLocaleLowerCase('tr').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'arastirma';
function labWait(at) {
  if (!at) return 'biraz sonra';
  const s = Math.ceil((labTs(at) - Date.now()) / 1000);
  if (s <= 5) return 'birkaç saniye sonra';
  return s < 90 ? `${s} sn sonra` : `${Math.ceil(s / 60)} dk sonra`;
}
function labLink(url, html, cls = '') {
  const u = labUrl(url);
  return u ? `<a class="${cls}" href="${esc(u)}">${html}</a>` : `<span class="${cls}">${html}</span>`;
}

// ─── Saklama ────────────────────────────────────────────────────────────
function labPersist(key, val) {
  try { localStorage.setItem('yzr.' + key, JSON.stringify(val)); return true; } catch { return false; }
}
const labSavedList = () => { const a = store.get('lab.saved', []); return Array.isArray(a) ? a.filter((x) => x && typeof x === 'object' && x.id && x.idea) : []; };
function labWriteSaved(list) {
  list = list.slice(0, 30);
  if (!labPersist('lab.saved', list)) { try { localStorage.removeItem('yzr.lab.http'); L.http = {}; } catch {} }
  while (list.length && !labPersist('lab.saved', list)) list.pop(); // kota dolarsa en eskiyi at
  return list;
}
// Motorun HTTP önbelleği: en fazla 80 kayıt, eskiden yeniye
function labHttp() { return L.http || (L.http = store.get('lab.http', {})); }
function labHttpSave() {
  const m = labHttp();
  let ks = Object.keys(m);
  while (ks.length && !labPersist('lab.http', m)) {
    ks.slice(0, Math.ceil(ks.length / 2)).forEach((k) => delete m[k]);
    ks = Object.keys(m);
  }
}
const labCache = () => ({
  get: (k) => labHttp()[k],
  set(k, v) {
    const m = labHttp();
    delete m[k];
    m[k] = v;
    const ks = Object.keys(m);
    ks.slice(0, Math.max(0, ks.length - 80)).forEach((x) => delete m[x]);
    // Boyut sınırı: localStorage sitenin geri kalanıyla paylaşılıyor
    for (const x of Object.keys(m)) { if (JSON.stringify(m).length < 1.2e6) break; delete m[x]; }
    clearTimeout(L.httpT);
    L.httpT = setTimeout(labHttpSave, 600);
  },
});

// ─── Araştırmayı çalıştır ───────────────────────────────────────────────
async function labRun(idea, o = {}) {
  idea = String(idea || '').replace(/\s+/g, ' ').trim();
  if (idea.length < 3) {
    toast('Önce fikrini kısaca yaz');
    return $('#labIdea')?.focus();
  }
  labSetMode('research');
  L.category = '';
  L.ctrl?.abort();
  const run = (L.run = { idea, done: new Set(), partial: null });
  const ctrl = (L.ctrl = new AbortController());
  L.err = null;
  L.draft = idea;
  S.labRes = null;
  if (S.openKey) location.hash = '';
  if (S.view !== 'lab') setView('lab');
  else renderLabOut();
  const ta = $('#labIdea');
  if (ta) { ta.value = idea; labGrow(ta); }
  renderLabTeaser();
  labReveal();
  if (!window.LabEngine) {
    L.run = null;
    L.err = { msg: 'Araştırma motoru yüklenemedi. Sayfayı yenileyip tekrar dene.', idea };
    return renderLabOut();
  }
  const day = 21 * 864e5;
  const localItems = (S.data?.items || []).filter((i) => Date.now() - i.date < day).map((i) => ({
    key: i.key, title: i.title, summary: i.summary, title_tr: i.i18n?.tr?.t || i.title, summary_tr: i.i18n?.tr?.s || i.summary,
    url: i.url, source: i.source, cat: i.cat, date: i.date,
  }));
  try {
    const atlas = await labLoadAtlas();
    if (run !== L.run || ctrl.signal.aborted) return;
    const res = await LabEngine.research(idea, {
      atlas: atlas || undefined,
      signal: ctrl.signal,
      localItems,
      cache: labCache(),
      claudeKey: store.get('lab.claudeKey', '') || undefined,
      githubToken: store.get('lab.ghToken', '') || undefined,
      en: o.query || undefined,
      onUpdate: (stage, partial) => {
        if (run !== L.run) return;
        run.done.add(stage);
        if (partial) run.partial = partial;
        if (!L.raf) L.raf = requestAnimationFrame(() => { L.raf = 0; renderLabOut(); });
      },
    });
    if (run !== L.run) return;
    S.labRes = res;
    L.run = null;
  } catch (e) {
    if (run !== L.run || e?.name === 'AbortError') return;
    console.warn('Fikir Lab', e);
    L.run = null;
    L.err = { msg: 'Araştırma tamamlanamadı. Bağlantını kontrol edip tekrar dene.', idea };
  }
  renderLabOut();
  renderLabTeaser();
}

function labFromItem(key) {
  const it = findByKey(key);
  if (!it) return;
  const desc = (tr1(it, 'ex') || tr1(it, 'summary') || '').replace(/\s+/g, ' ').trim();
  labRun(`${appName(it)}${desc ? ': ' + labClip(desc, 180) : ''}`);
}

function labOpen(id) {
  const r = labSavedList().find((x) => x.id === id);
  if (!r) return;
  L.ctrl?.abort();
  L.run = null;
  L.err = null;
  labSetMode('research');
  L.category = '';
  L.draft = r.idea;
  S.labRes = r;
  if (S.openKey) location.hash = '';
  if (S.view !== 'lab') setView('lab');
  else renderLabOut();
  const ta = $('#labIdea');
  if (ta) { ta.value = r.idea; labGrow(ta); }
  renderLabTeaser();
  labReveal();
}

// Sonuç ekranın altında kaldıysa sakince oraya kaydır
function labReveal() {
  requestAnimationFrame(() => {
    const out = $('#labOut');
    if (out && out.getBoundingClientRect().top > innerHeight * 0.6) out.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}
function labGrow(ta) {
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 240) + 'px';
}

// ─── Sayfa ──────────────────────────────────────────────────────────────
function renderLab() {
  if (!$('#labRoot')) {
    const key = !!store.get('lab.claudeKey', '');
    $('#page').innerHTML = `
    <div id="labRoot" class="lab-page">
      <header class="lab-head">
        <span class="lab-eyebrow">Fikir Lab</span>
        <h2>Fikrini yaz, en iyi başlangıç noktasını bulalım</h2>
        <p>Aklındaki fikri yaz; GitHub’da ve toplulukta kimin ne yaptığını bulup sana en iyi başlangıç noktasını önerelim.</p>
      </header>
      <div class="lab-box">
        <label class="sr-only" for="labIdea">Fikrin</label>
        <textarea id="labIdea" rows="2" maxlength="400" enterkeyhint="search" placeholder="Örn: Kuaförler için WhatsApp’tan randevu alan bir asistan">${esc(L.draft)}</textarea>
        <div class="lab-bar">
          <span class="lab-kbd">Ctrl / ⌘ + Enter ile de başlatabilirsin</span>
          <button class="btn primary lab-go" data-lab-go>Araştır</button>
        </div>
      </div>
      <div id="labModes"></div>
      <div class="lab-ex" aria-label="Örnek fikirler">${LAB_EX.map((t, i) => `<button class="lab-chip" data-lab-chip="${i}">${esc(t)}</button>`).join('')}</div>
      <div class="lab-set-row">
        <button class="link-btn lab-set-toggle" data-lab-settings aria-expanded="false" aria-controls="labSet">⚙ Daha isabetli sonuçlar</button>
        <span class="lab-pill" id="labPill" ${key ? '' : 'hidden'}>Akıllı mod açık</span>
      </div>
      <div class="lab-set" id="labSet" hidden>
        <label>Claude API anahtarı <em>opsiyonel</em>
          <input type="password" id="labKeyClaude" value="${esc(store.get('lab.claudeKey', ''))}" placeholder="sk-ant-…" autocomplete="off" spellcheck="false">
          <small>Akıllı mod: fikrini anlayıp sorguları ve sıralamayı Claude yapar.</small>
        </label>
        <label>GitHub token <em>opsiyonel</em>
          <input type="password" id="labKeyGh" value="${esc(store.get('lab.ghToken', ''))}" placeholder="ghp_…" autocomplete="off" spellcheck="false">
          <small>GitHub arama sınırını artırır.</small>
        </label>
        <p class="note">Anahtarlar yalnızca bu tarayıcıda saklanır ve sadece ilgili servise (Anthropic, GitHub) gönderilir.</p>
        <div class="lab-set-btns"><button class="btn primary" data-lab-savekeys>Kaydet</button><button class="btn" data-lab-clearkeys>Temizle</button></div>
      </div>
      <div id="labOut" class="lab-out"></div>
    </div>`;
    const ta = $('#labIdea');
    if (ta) labGrow(ta);
  }
  labLoadAtlas();
  renderLabOut();
}

// Bölümleri tek tek yamalar: değişmeyen kısım yeniden çizilmez, animasyon yalnızca yeni bölümde oynar
function labPatch(out, parts) {
  const want = parts.filter((p) => p.html);
  [...out.children].forEach((c) => { if (!want.some((p) => p.id === c.dataset.p)) c.remove(); });
  want.forEach((p, i) => {
    let el = [...out.children].find((c) => c.dataset.p === p.id);
    if (!el) { el = document.createElement('div'); el.dataset.p = p.id; el.className = 'lab-part'; }
    if (el._h !== p.html) { el.innerHTML = p.html; el._h = p.html; }
    if (out.children[i] !== el) out.insertBefore(el, out.children[i] || null);
  });
}

function renderLabOut() {
  const out = $('#labOut');
  if (!out) return;
  labRenderModes();
  if (labMode() === 'atlas' && L.atlasState !== 'error') return labPatch(out, [{ id: 'atlas', html: labAtlasHtml() }]);
  if (L.run) return labPatch(out, labResultParts(L.run.partial || {}, L.run));
  if (L.err) {
    return labPatch(out, [{ id: 'err', html: `<div class="lab-note lab-err"><p>${esc(L.err.msg)}</p><button class="btn" data-lab-retry>Tekrar dene</button></div>` }]);
  }
  if (S.labRes) return labPatch(out, labResultParts(S.labRes, null));
  labPatch(out, [{ id: 'saved', html: labSavedHtml() }, { id: 'insp', html: labInspHtml() }]);
}

function labResultParts(r, run) {
  const parts = [];
  if (run) parts.push({ id: 'progress', html: labProgress(run) });
  if (r.verdict) parts.push({ id: 'verdict', html: labVerdict(r) });
  if (r.edu) parts.push({ id: 'edu', html: labEduNotes(r) });
  if (!run && Date.now() - labTs(r.at) < 15 * 60000) parts.push({ id: 'notes', html: labNotes(r) });
  parts.push({ id: 'repos', html: labRepos(r, run) });
  parts.push({ id: 'blocks', html: labBlocks(r) });
  parts.push({ id: 'products', html: labProducts(r) });
  parts.push({ id: 'needs', html: labNeeds(r) });
  if (run) parts.push({ id: 'skel', html: '<div class="lab-skels" aria-hidden="true"><div class="lab-skel"></div><div class="lab-skel"></div></div>' });
  else parts.push({ id: 'next', html: labNext(r) });
  return parts;
}

function labProgress(run) {
  const has = (id) => run.done.has('done') || (id !== 'rank' && run.done.has(id)); // çeviri bitene kadar "Sıralanıyor" sürer
  const act = LAB_STEPS.findIndex(([id]) => !has(id));
  return `<div class="lab-progress" role="status" aria-live="polite">
    <p class="lp-t">“${esc(labClip(run.idea, 90))}” için araştırıyoruz…</p>
    <ol class="lab-steps">${LAB_STEPS.map(([id, t], i) => {
      const st = act === -1 || i < act || has(id) ? 'ok' : i === act ? 'on' : '';
      return `<li class="${st}"><i aria-hidden="true"></i>${t}</li>`;
    }).join('')}</ol>
  </div>`;
}

function labVerdict(r) {
  const v = r.verdict;
  const k = LAB_KINDS[v.kind] || LAB_KINDS.build;
  const s = r.stats || {};
  const stats = [[s.repos, 'proje'], [s.products, 'ürün'], [s.needs, 'talep işareti']].filter((x) => x[0]);
  const terms = (r.terms || []).filter(Boolean);
  return `<section class="lab-verdict" data-kind="${esc(v.kind || '')}" aria-label="Özet">
    <div class="lv-ico" aria-hidden="true">${k.i}</div>
    <div class="lv-main">
      <div class="lv-kind">${k.t}${r.smart ? '<span class="lab-pill">Akıllı mod</span>' : ''}</div>
      <p class="lv-text">${labBold(v.text)}</p>
      ${r.summary ? `<p class="lv-sum">Anladığımız: ${esc(r.summary)}</p>` : ''}
      ${stats.length ? `<div class="lv-stats">${stats.map(([n, l]) => `<span><b>${esc(n)}</b> ${l}</span>`).join('')}</div>` : ''}
      ${terms.length ? `<div class="lv-terms"><span>Şunları aradık:</span>${terms.map((t) => `<em class="term">${esc(t.replace(/^topic:/, '').replace(/-/g, ' '))}</em>`).join('')}<button class="link-btn" data-lab-terms aria-expanded="false" aria-controls="labTermsForm">Düzenle</button></div>
      <div class="lv-edit" id="labTermsForm" hidden>
        <label class="sr-only" for="labTermsIn">İngilizce arama terimleri</label>
        <input id="labTermsIn" value="${esc(terms.join(', '))}" autocomplete="off" spellcheck="false">
        <button class="btn" data-lab-rerun>Yeniden ara</button>
      </div>` : ''}
    </div>
  </section>`;
}

function labNotes(r) {
  const gear = '<button class="link-btn" data-lab-settings>⚙ ayarlardan</button>';
  const msg = [];
  for (const s of r.sources || []) {
    if (s.ok) continue;
    if (s.id === 'github') {
      msg.push(s.kind === 'rate' ? `GitHub arama sınırına ulaşıldı; ${labWait(s.resetAt)} tekrar dene ya da ${gear} GitHub token ekle.`
        : s.kind === 'auth' ? `GitHub token’ı kabul edilmedi; ${gear} kontrol et.`
        : (r.repos || []).length ? 'GitHub aramalarının bir kısmı tamamlanamadı; sonuçlar eksik olabilir.' : 'GitHub’a ulaşılamadı; bağlantını kontrol edip tekrar dene.');
    } else if (s.id === 'hn') msg.push('Hacker News’e ulaşılamadı; ürün ve talep bölümleri eksik olabilir.');
    else if (s.id === 'claude') msg.push(s.kind === 'auth' ? `Claude anahtarı kabul edilmedi; temel modda devam ettik. ${gear} kontrol et.` : 'Akıllı mod bu sefer çalışmadı; temel modda devam ettik.');
    else if (s.id === 'stackexchange') msg.push('Eğitimci sorularına bu kez ulaşılamadı; diğer kaynaklarla devam ettik.');
    else if (s.id === 'translate') msg.push('Çeviri yapılamadı; bazı metinler İngilizce kalmış olabilir.');
  }
  return msg.length ? `<div class="lab-notes">${msg.map((m) => `<p class="lab-note">${m}</p>`).join('')}</div>` : '';
}

const labSec = (title, sub, body) => `<section class="lab-sec"><div class="lab-sec-h"><h3>${title}</h3><p>${sub}</p></div>${body}</section>`;

function labRepos(r, run) {
  const list = r.repos || [];
  if (!list.length) {
    const ghFail = (r.sources || []).some((s) => s.id === 'github' && !s.ok);
    return run || ghFail || !r.verdict ? '' : '<p class="lab-gentle">Bu fikre çok yakın açık kaynak proje bulamadık. Üstteki terimleri “Düzenle” ile değiştirip tekrar deneyebilirsin.</p>';
  }
  return labSec('Başlangıç noktaları', 'Sıfırdan yazmak yerine fork’layıp uyarlayabileceğin açık kaynak projeler.', `<div class="lab-repos">${list.map(labRepoCard).join('')}</div>`);
}

function labRepoCard(p) {
  const [own, nm] = String(p.name).split('/');
  const fr = labFresh(p.pushed);
  const lic = labLicense(p.license);
  const why = (Array.isArray(p.why) ? p.why : p.why ? [p.why] : []).slice(0, 3);
  return `<article class="lab-repo ${p.best ? 'best' : ''}">
    ${p.best ? '<span class="lab-ribbon">En iyi temel</span>' : ''}
    <h4 class="lr-name">${labLink(p.url, nm ? `<span>${esc(own)}/</span>${esc(nm)}` : esc(p.name))}</h4>
    ${p.desc || p.desc_tr ? `<p class="lr-desc" title="${esc(p.desc || '')}">${esc(p.desc_tr || p.desc)}</p>` : ''}
    <div class="lr-badges">
      ${p.curated ? '<span class="bd edu-badge">Atlas</span>' : ''}
      <span class="bd" title="GitHub yıldızı">⭐ ${labNum(p.stars)}</span>
      ${p.archived ? '<span class="bd bad">Arşivlenmiş</span>' : fr ? `<span class="bd ${fr.c}">${fr.t}</span>` : ''}
      <span class="bd ${lic.c}" ${lic.tip ? `title="${esc(lic.tip)}"` : ''}>${esc(lic.t)}</span>
      ${p.lang ? `<span class="bd">${esc(p.lang)}</span>` : ''}
    </div>
    ${why.length ? `<div class="lr-why"><h5>Neden önerdik</h5><ul>${why.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>` : ''}
    ${labUrl(p.url) ? `<a class="btn lr-open" href="${esc(p.url)}">GitHub’da aç ↗</a>` : ''}
  </article>`;
}

function labBlocks(r) {
  const list = r.blocks || [];
  if (!list.length) return '';
  return labSec('Yapı taşları', 'Fikrinin bir parçasını hazır çözen popüler kütüphaneler.', `<ul class="lab-rows">${list.map((b) => {
    const lic = labLicense(b.license);
    return `<li class="lab-row">
      <div class="lrow-main">
        ${labLink(b.url, esc(b.name), 'lrow-t')}
        ${b.purpose_tr ? `<span class="lrow-p">${esc(b.purpose_tr)}</span>` : ''}
        ${b.desc_tr || b.desc ? `<p title="${esc(b.desc || '')}">${esc(b.desc_tr || b.desc)}</p>` : ''}
      </div>
      <div class="lrow-side"><span class="bd">⭐ ${labNum(b.stars)}</span><span class="bd ${lic.c}">${esc(lic.t)}</span></div>
    </li>`;
  }).join('')}</ul>`);
}

function labProducts(r) {
  const prods = r.products || [];
  const radar = r.radar || [];
  if (!prods.length && !radar.length) return '';
  const rows = prods.map((p) => {
    const meta = [p.kind || 'HN', p.points ? `▲ ${p.points}` : '', p.comments ? `${p.comments} yorum` : '', labDate(p.date)].filter(Boolean).join(' · ');
    const disc = p.hn && p.url && p.hn !== p.url && labUrl(p.hn) ? `<a class="lrow-disc" href="${esc(p.hn)}">tartışma ↗</a>` : '';
    return `<li class="lrow-li">${labLink(p.url || p.hn, `<span class="lrow-t">${esc(p.title_tr || p.title)}</span><span class="lrow-m">${esc(meta)}</span>`, 'lab-row lab-row-a')}${disc}</li>`;
  }).join('');
  const rd = radar.map((x) => `<li><button class="lab-row lab-row-a" data-open="${esc(x.key)}"><span class="lrow-t">${esc(x.title_tr)}</span><span class="lrow-m">YZ Radar · ${esc(x.source)}${x.date ? ' · ' + esc(labDate(x.date)) : ''}</span></button></li>`).join('');
  return labSec('Benzer ürünler', 'Aynı alanda daha önce denenmiş ürünler ve konuşulanlar.',
    `${rows ? `<ul class="lab-rows">${rows}</ul>` : ''}${rd ? `<h4 class="lab-sub">Radar’da da geçiyor</h4><ul class="lab-rows">${rd}</ul>` : ''}`);
}

function labNeeds(r) {
  const list = r.needs || [];
  if (!list.length) return '';
  return labSec('İnsanlar ne istiyor', 'Topluluk yorumları, eğitimci soruları ve açık geliştirme istekleri.', `<div class="lab-quotes">${list.map((n) => {
    const gh = n.source === 'GitHub isteği';
    const meta = [n.source, (gh || n.source === 'Eğitimci sorusu') && n.where ? n.where : '', labDate(n.date), n.votes ? `${gh ? '👍' : '▲'} ${n.votes}` : ''].filter(Boolean).join(' · ');
    const orig = n.text && n.text_tr && n.text !== n.text_tr;
    return `<figure class="lab-quote">
      <blockquote>${esc(n.text_tr || n.text)}</blockquote>
      ${orig ? `<details><summary>Orijinali</summary><p lang="en">${esc(n.text)}</p></details>` : ''}
      <figcaption><span>${esc(meta)}</span>${labLink(n.url, 'Kaynağa git ↗', 'lq-link')}</figcaption>
    </figure>`;
  }).join('')}</div>`);
}

function labNext(r) {
  if (!r.verdict) return '';
  const saved = labSavedList().some((x) => x.id === r.id);
  return `<section class="lab-next">
    <h3>Sonraki adım</h3>
    <p>Bulduğumuz her şeyi içeren hazır bir istemi Claude’a yapıştır; MVP planını, riskleri ve bu hafta deneyebileceğin küçük testleri çıkarsın.</p>
    <div class="ln-btns">
      <button class="btn primary" data-lab-claude>Claude ile planı çıkar</button>
      <button class="btn" data-lab-save>${saved ? '★ Kaydedildi' : '★ Kaydet'}</button>
      <button class="btn" data-lab-md>Markdown indir</button>
    </div>
    <a class="ln-open" id="labClaudeLink" href="https://claude.ai/new" ${L.copied === r.id ? '' : 'hidden'}>İstem kopyalandı. claude.ai’yi aç ↗</a>
    <p class="note">Sonuçlar ${r.edu ? 'GitHub, Hacker News ve eğitimci topluluklarından' : 'GitHub ve Hacker News’ten'} otomatik toplandı; karar vermeden önce kaynakları kontrol et.</p>
  </section>`;
}

// Boş durum: kayıtlı araştırmalar ve ilham
function labSavedHtml() {
  const list = labSavedList();
  if (!list.length) return '';
  return `<section class="lab-sec"><div class="lab-sec-h"><h3>Araştırmaların</h3></div><ul class="lab-saved">${list.map((r) => `
    <li><button class="ls-main" data-lab-open="${esc(r.id)}"><span class="ls-t">${esc(r.idea)}</span><span class="ls-m">${esc((LAB_KINDS[r.verdict?.kind] || LAB_KINDS.build).t)} · ${ago(labTs(r.at))}</span></button><button class="ls-del" data-lab-del="${esc(r.id)}" aria-label="Araştırmayı sil" title="Sil">✕</button></li>`).join('')}</ul></section>`;
}

function labInspire() {
  if (!S.data) return [];
  const pool = S.data.items
    .filter((i) => ['apps', 'ideas'].includes(i.cat) && i.sourceId !== 'hfmodels' && Date.now() - i.date < 7 * 864e5 && (i.ex || i.summary))
    .sort((a, b) => b.hot - a.hot);
  const used = {}, out = [];
  for (const it of pool) {
    if ((used[it.sourceId] || 0) >= 2) continue;
    used[it.sourceId] = (used[it.sourceId] || 0) + 1;
    out.push(it);
    if (out.length === 6) break;
  }
  return out;
}
function labInspHtml() {
  const list = labInspire();
  if (!list.length) return '';
  return labSec('İlham al', 'Bu hafta ilgi gören projelerden birini seç; benzerlerini ve insanların ne istediğini bulalım.',
    `<div class="lab-insp">${list.map((it) => `
    <button class="lab-ic" data-lab-from="${esc(it.key)}">
      <h4>${esc(appName(it))}</h4>
      <p>${esc(tr1(it, 'ex') || tr1(it, 'summary') || '')}</p>
      <span>Benzerini araştır →</span>
    </button>`).join('')}</div>`);
}

// ─── Kenar çubuğu ───────────────────────────────────────────────────────
function renderLabTeaser() {
  const box = $('#labBody');
  if (!box) return;
  if (!$('#tzIn')) {
    box.innerHTML = `
    <p class="tz-copy">Aklındaki fikri yaz; en iyi açık kaynak başlangıç noktasını bulalım.</p>
    <label class="sr-only" for="tzIn">Fikrin</label>
    <input id="tzIn" class="tz-in" maxlength="300" placeholder="Örn: Kuaförler için randevu asistanı" autocomplete="off" enterkeyhint="search">
    <button class="btn primary full" data-lab-tz>Araştır</button>
    <button class="link-btn tz-atlas" data-lab-atlas>🎓 Eğitimde YZ Atlası →</button>
    <div class="tz-last" id="tzLast"></div>`;
  }
  const last = labSavedList()[0];
  $('#tzLast').innerHTML = last ? `<span>Son araştırma</span><button class="link-btn" data-lab-open="${esc(last.id)}">${esc(labClip(last.idea, 70))}</button>` : '';
}


// ─── Eğitim Atlası ──────────────────────────────────────────────────────
const LAB_LEVELS = [['', 'Hepsi'], ['ilkokul', 'İlkokul'], ['ortaokul', 'Ortaokul'], ['lise', 'Lise'], ['üniversite', 'Üniversite'], ['öğretmen', 'Öğretmen']];
const labLevelName = (id) => LAB_LEVELS.find(([k]) => k === id)?.[1] || (id === 'yetişkin' ? 'Yetişkin' : id);
function labMode() {
  if (!L.mode) {
    const saved = store.get('lab.mode', '');
    L.mode = ['research', 'atlas'].includes(saved) ? saved : S.labRes || labSavedList().length ? 'research' : 'atlas';
  }
  return L.mode;
}
function labSetMode(mode) {
  L.mode = mode === 'atlas' ? 'atlas' : 'research';
  store.set('lab.mode', L.mode);
}
function labLoadAtlas() {
  if (!L.atlasTask) {
    L.atlasState = 'loading';
    L.atlasTask = (async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12000);
      try {
        const response = await fetch('data/edu-atlas.json', { signal: ctrl.signal });
        if (!response.ok) throw new Error('Atlas');
        const atlas = await response.json();
        if (!Array.isArray(atlas?.categories) || !atlas.categories.length) throw new Error('Atlas');
        L.atlas = atlas;
        L.atlasState = 'ready';
        return atlas;
      } catch {
        L.atlasState = 'error';
        return null;
      } finally {
        clearTimeout(timer);
        if (S.view === 'lab') renderLabOut();
      }
    })();
  }
  return L.atlasTask;
}
function labRenderModes() {
  const box = $('#labModes');
  if (!box) return;
  const mode = labMode();
  const html = L.atlasState === 'error'
    ? '<p class="note atlas-unavailable" role="status">Eğitim Atlası şu an yüklenemedi. Fikrini yazarak araştırmaya devam edebilirsin.</p>'
    : '<div class="lab-modes" role="group" aria-label="Fikir Lab görünümü">' + [['research', 'Fikrini araştır'], ['atlas', '🎓 Eğitimde YZ Atlası']].map(([id, title]) => '<button data-lab-mode="' + id + '" aria-pressed="' + (mode === id) + '" class="' + (mode === id ? 'on' : '') + '">' + title + '</button>').join('') + '</div>';
  if (box._h !== html) { box.innerHTML = html; box._h = html; }
}
function labEvidence(list) {
  return '<div class="atlas-evidence">' + (list || []).map((e) => '<article><div class="atlas-meta">' + (e.kind ? '<span class="bd edu-badge">' + esc(e.kind) + '</span>' : '') + (e.year ? '<span>' + esc(e.year) + '</span>' : '') + '</div><h4>' + labLink(e.url, esc(e.title)) + '</h4><p>' + esc(e.finding || '') + '</p>' + (labUrl(e.url) ? labLink(e.url, 'Araştırmayı oku ↗', 'link-btn') : '') + '</article>').join('') + '</div>';
}
function labAtlasIdeas(cat, limit = Infinity) {
  return '<div class="atlas-ideas">' + (cat.ideas || []).slice(0, limit).map((idea, index) => {
    const difficulty = Math.max(1, Math.min(3, Number(idea.difficulty) || 1));
    const starter = /^[\w.-]+\/[\w.-]+$/.test(idea.starter || '') ? 'https://github.com/' + idea.starter : '';
    return '<article class="atlas-idea"><div class="atlas-meta"><span>' + esc(idea.for || '') + '</span><span class="atlas-difficulty" aria-label="Zorluk: ' + difficulty + ' / 3" title="Zorluk: ' + difficulty + ' / 3">' + '●'.repeat(difficulty) + '<span aria-hidden="true">' + '○'.repeat(3 - difficulty) + '</span></span></div><h4>' + esc(idea.title) + '</h4><p><b>İhtiyaç:</b> ' + esc(idea.problem || '') + '</p><p><b>Çözüm:</b> ' + esc(idea.solution || '') + '</p>' + (idea.mvp?.length ? '<details><summary>İlk sürümde neler olsun?</summary><ol>' + idea.mvp.map((step) => '<li>' + esc(step) + '</li>').join('') + '</ol></details>' : '') + (starter ? '<p class="atlas-starter">Başlangıç: ' + labLink(starter, esc(idea.starter), 'link-btn') + '</p>' : '') + '<button class="btn primary" data-lab-idea="' + esc(cat.id) + '" data-idea-index="' + index + '">Bu fikri araştır</button></article>';
  }).join('') + '</div>';
}
function labAtlasNews(cat) {
  const norm = (s) => String(s || '').toLocaleLowerCase('tr').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i');
  const terms = [...(cat.keywords || []), ...(cat.tr_keywords || [])].map(norm).filter(Boolean);
  const now = Date.now();
  const list = (S.data?.items || []).filter((it) => {
    const age = now - labTs(it.date);
    const text = norm([it.title, it.summary, it.i18n?.tr?.t, it.i18n?.tr?.s].filter(Boolean).join(' '));
    return age >= 0 && age < 21 * 864e5 && terms.some((word) => text.includes(word));
  }).sort((a, b) => labTs(b.date) - labTs(a.date)).slice(0, 5);
  return labSec('Radar’da son haberler', 'Bu alanla ilgili son 21 gündeki başlıklar.', list.length ? '<ul class="lab-rows">' + list.map((it) => '<li><button class="lab-row lab-row-a" data-open="' + esc(it.key) + '"><span class="lrow-t">' + esc(it.i18n?.tr?.t || it.title) + '</span><span class="lrow-m">' + esc(it.source) + ' · ' + esc(ago(labTs(it.date))) + '</span></button></li>').join('') + '</ul>' : '<p class="lab-note">Bu başlıkta henüz yeni haber yok. Diğer eğitim haberlerine Eğitim sekmesinden bakabilirsin.</p>');
}
function labAtlasHtml() {
  if (!L.atlas) return '<p class="lab-note" role="status">Eğitim Atlası yükleniyor…</p>';
  const cat = L.atlas.categories.find((c) => c.id === L.category);
  if (cat) {
    const repos = (cat.repos || []).map((r) => ({ ...r, curated: true }));
    const products = (cat.products || []).map((p) => '<li class="lab-row"><div class="lrow-main">' + labLink(p.url, esc(p.name), 'lrow-t') + '<p>' + esc(p.what || '') + '</p></div><span class="bd">' + esc(p.price || '') + '</span></li>').join('');
    return '<div class="atlas-detail"><button class="link-btn atlas-back" data-lab-atlas>← Atlas</button><header class="atlas-head"><span class="atlas-icon" aria-hidden="true">' + esc(cat.icon) + '</span><h3 tabindex="-1" data-atlas-heading>' + esc(cat.title) + '</h3><p>' + esc(cat.why) + '</p><div class="atlas-meta">' + (cat.levels || []).map((l) => '<span class="bd">' + esc(labLevelName(l)) + '</span>').join('') + '</div></header>'
      + labSec('Araştırmalar ne diyor', 'Bulguyu, çalışma türünü ve kaynağını birlikte incele.', labEvidence(cat.evidence))
      + labSec('Hazır projeler', 'Kodunu inceleyip kendi ihtiyacına uyarlayabileceğin başlangıçlar.', repos.length ? '<div class="lab-repos">' + repos.map(labRepoCard).join('') + '</div>' : '<p class="lab-note">Bu kategori için doğrulanmış proje henüz eklenmedi.</p>')
      + (products ? labSec('Kullanılan ürünler', 'Mevcut araçları inceleyerek ihtiyacını ve farkını netleştir.', '<ul class="lab-rows">' + products + '</ul>') : '')
      + labSec('Bunu sen yap: fikirler', 'Küçük bir ilk sürümle başlayabileceğin somut fikirler.', labAtlasIdeas(cat))
      + labSec('Türkiye’ye uyarlarken', '', '<p class="atlas-context">' + esc(cat.tr || '') + '</p>')
      + labSec('Dikkat edilecekler', '', '<ul class="atlas-risks">' + (cat.risks || []).map((risk) => '<li>' + esc(risk) + '</li>').join('') + '</ul>')
      + labAtlasNews(cat) + '</div>';
  }
  const cats = L.atlas.categories.filter((c) => !L.level || (c.levels || []).includes(L.level));
  return '<section class="atlas-home"><header class="atlas-head"><h3 tabindex="-1" data-atlas-heading>🎓 Eğitimde YZ Atlası</h3><p>' + esc(L.atlas.intro || '') + '</p></header><div class="atlas-filters" role="group" aria-label="Eğitim düzeyi">' + LAB_LEVELS.map(([id, title]) => '<button class="lab-chip" data-lab-level="' + esc(id) + '" aria-pressed="' + (id === L.level) + '">' + esc(title) + '</button>').join('') + '</div><div class="atlas-grid">' + cats.map((c) => '<button class="atlas-card" data-lab-category="' + esc(c.id) + '"><span class="atlas-icon" aria-hidden="true">' + esc(c.icon) + '</span><h4>' + esc(c.title) + '</h4><p>' + esc(c.short) + '</p><span class="atlas-count">' + (c.repos || []).length + ' proje · ' + (c.ideas || []).length + ' fikir <span aria-hidden="true">→</span></span></button>').join('') + '</div>' + (!cats.length ? '<p class="lab-note">Bu düzeyde henüz kategori yok. Hepsi ile diğer alanlara bakabilirsin.</p>' : '') + '</section>';
}
function labEduNotes(r) {
  const cats = (r.edu.cats || []).map((match) => L.atlas?.categories.find((c) => c.id === match.id)).filter(Boolean);
  const evidence = r.edu.evidence?.length ? r.edu.evidence : cats.flatMap((c) => c.evidence || []).filter((e, i, a) => a.findIndex((x) => x.url === e.url) === i).slice(0, 4);
  const chips = (r.edu.cats || []).map((c) => L.atlas?.categories.some((x) => x.id === c.id) ? '<button class="lab-chip" data-lab-category="' + esc(c.id) + '">' + esc(c.title) + ' →</button>' : '<span class="bd">' + esc(c.title) + '</span>').join('');
  const risks = [...new Set(cats.flatMap((c) => c.risks || []))].slice(0, 5);
  let remaining = 3;
  const ideas = cats.map((cat) => { const n = Math.min(remaining, cat.ideas?.length || 0); remaining -= n; return n ? labAtlasIdeas(cat, n) : ''; }).join('');
  return labSec('🎓 Eğitim notları', r.edu.level ? 'Hedef düzey: ' + esc(labLevelName(r.edu.level)) : 'Fikrini pedagojik dayanak ve sınıfın koşullarıyla birlikte değerlendir.', '<div class="edu-notes"><div class="atlas-meta">' + chips + '</div>' + (evidence?.length ? labEvidence(evidence) : '') + (cats.length ? '<h4>Türkiye’ye uyarlarken</h4>' + cats.map((c) => '<p><b>' + esc(c.title) + ':</b> ' + esc(c.tr || '') + '</p>').join('') : '<p>MEB kazanım uyumunu ve öğretmen iş yükünü birlikte değerlendir; 1–2 öğretmenle iki haftalık bir sınıf pilotu planla.</p>') + (risks.length ? '<h4>Dikkat edilecekler</h4><ul class="atlas-risks">' + risks.map((risk) => '<li>' + esc(risk) + '</li>').join('') + '</ul>' : '<p>Çocuk verisi, KVKK, veli onayı ve üretilen içeriğin doğruluğunu pilot öncesinde ele al.</p>') + (ideas ? '<h4>Bu alanda deneyebileceğin fikirler</h4>' + ideas : '') + '</div>');
}

// ─── Olaylar ────────────────────────────────────────────────────────────
document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-lab-mode],[data-lab-atlas],[data-lab-category],[data-lab-level],[data-lab-idea],[data-lab-go],[data-lab-chip],[data-lab-settings],[data-lab-savekeys],[data-lab-clearkeys],[data-lab-terms],[data-lab-rerun],[data-lab-claude],[data-lab-save],[data-lab-md],[data-lab-open],[data-lab-del],[data-lab-tz],[data-lab-retry]');
  if (!t) return;
  const d = t.dataset;
  const res = S.labRes;
  if (d.labMode !== undefined) {
    labSetMode(d.labMode);
    renderLabOut();
    document.querySelectorAll('[data-lab-mode]').forEach((b) => { if (b.dataset.labMode === L.mode) b.focus({ preventScroll: true }); });
    return;
  }
  if (d.labAtlas !== undefined || d.labCategory !== undefined) {
    L.category = d.labCategory || '';
    labSetMode('atlas');
    if (S.view !== 'lab') setView('lab');
    else renderLabOut();
    labLoadAtlas();
    requestAnimationFrame(() => {
      const heading = $('#labOut [data-atlas-heading]');
      heading?.focus({ preventScroll: true });
      $('#labOut')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return;
  }
  if (d.labLevel !== undefined) {
    L.level = d.labLevel;
    renderLabOut();
    document.querySelectorAll('[data-lab-level]').forEach((b) => { if (b.dataset.labLevel === L.level) b.focus({ preventScroll: true }); });
    return;
  }
  if (d.labIdea !== undefined) {
    const cat = L.atlas?.categories.find((c) => c.id === d.labIdea);
    const idea = cat?.ideas?.[Number(d.ideaIndex)];
    if (idea?.query) return labRun(idea.query);
    return;
  }
  if (d.labGo !== undefined) return labRun($('#labIdea').value);
  if (d.labChip !== undefined) return labRun(LAB_EX[d.labChip]);
  if (d.labTz !== undefined) return labRun($('#tzIn').value);
  if (d.labRetry !== undefined) return labRun($('#labIdea')?.value || L.err?.idea || L.draft);
  if (d.labDel !== undefined) {
    labWriteSaved(labSavedList().filter((x) => x.id !== d.labDel));
    renderLabOut();
    return renderLabTeaser();
  }
  if (d.labOpen !== undefined) return labOpen(d.labOpen);
  if (d.labSettings !== undefined) {
    // Başka bir görünümdeysek (ör. sonuç notundaki bağlantı) ayarlar kutusunu aç ve yukarı çık
    const box = $('#labSet');
    if (!box) return;
    const open = t.classList.contains('lab-set-toggle') ? box.hidden : true;
    box.hidden = !open;
    $('.lab-set-toggle')?.setAttribute('aria-expanded', String(open));
    if (open) { $('#labKeyClaude')?.focus({ preventScroll: true }); box.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    return;
  }
  if (d.labSavekeys !== undefined) {
    const c = $('#labKeyClaude').value.trim(), g = $('#labKeyGh').value.trim();
    labPersist('lab.claudeKey', c);
    labPersist('lab.ghToken', g);
    $('#labPill').hidden = !c;
    return toast(c || g ? 'Ayarlar kaydedildi' : 'Anahtarlar temizlendi');
  }
  if (d.labClearkeys !== undefined) {
    $('#labKeyClaude').value = '';
    $('#labKeyGh').value = '';
    labPersist('lab.claudeKey', '');
    labPersist('lab.ghToken', '');
    $('#labPill').hidden = true;
    return toast('Anahtarlar temizlendi');
  }
  if (d.labTerms !== undefined) {
    const f = $('#labTermsForm');
    f.hidden = !f.hidden;
    t.setAttribute('aria-expanded', String(!f.hidden));
    if (!f.hidden) $('#labTermsIn').focus();
    return;
  }
  if (d.labRerun !== undefined) return labRerun();
  if (!res) return;
  if (d.labClaude !== undefined) {
    await copy(LabEngine.buildPrompt(res), 'İstem kopyalandı — Claude’a yapıştırabilirsin');
    L.copied = res.id;
    const a = $('#labClaudeLink');
    if (a) a.hidden = false;
    return;
  }
  if (d.labSave !== undefined) {
    const list = labSavedList();
    const was = list.some((x) => x.id === res.id);
    const next = was ? list.filter((x) => x.id !== res.id) : [res, ...list];
    const kept = labWriteSaved(next);
    toast(was ? 'Kayıttan çıkarıldı' : kept.some((x) => x.id === res.id) ? 'Araştırma kaydedildi' : 'Kaydedilemedi: tarayıcı depolaması dolu');
    renderLabOut();
    return renderLabTeaser();
  }
  if (d.labMd !== undefined) {
    const url = URL.createObjectURL(new Blob([LabEngine.toMarkdown(res)], { type: 'text/markdown;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `fikir-${labSlug(res.idea)}.md` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('Markdown indirildi');
  }
});

function labRerun() {
  const terms = ($('#labTermsIn')?.value || '').split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
  const idea = S.labRes?.idea || L.draft;
  if (!terms.length) return toast('En az bir arama terimi yaz');
  labRun(idea, { query: terms.join(' ') });
}

document.addEventListener('keydown', (e) => {
  const el = e.target;
  if (e.isComposing) return;
  if (el.id === 'labIdea' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); return labRun(el.value); }
  if (el.id === 'tzIn' && e.key === 'Enter') { e.preventDefault(); return labRun(el.value); }
  if (el.id === 'labTermsIn' && e.key === 'Enter') { e.preventDefault(); return labRerun(); }
  if (el.matches?.('[data-lab-open][tabindex]') && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); labOpen(el.dataset.labOpen); }
});

document.addEventListener('input', (e) => {
  if (e.target.id === 'labIdea') {
    L.draft = e.target.value;
    labGrow(e.target);
  }
});
