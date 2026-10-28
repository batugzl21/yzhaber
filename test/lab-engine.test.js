// Fikir Lab motoru: ağ kullanmayan testler.
// Çalıştır: node --test "test/*.test.js"   (Node 24 "test/" yolunu dosya sanar; desen kullan)
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../public/lab-engine.js');

const DAY = 864e5;
const iso = (daysAgo) => new Date(Date.now() - daysAgo * DAY).toISOString();
const IDEAS = [
  ['Kuaförler için WhatsApp\'tan randevu alan bir asistan', 'An assistant who makes appointments for hairdressers via WhatsApp'],
  ['Mali müşavirlerin e-fatura ve fişleri otomatik okuyup muhasebeye işleyen araç', 'A tool used by financial advisors to automatically read e-invoices and receipts and process them into accounting.'],
  ['YKS öğrencileri için yapay zeka destekli soru çözüm ve tekrar uygulaması', 'Artificial intelligence supported question solution and repetition application for YKS students'],
  ['Toplantıları kaydedip Türkçe özet çıkaran Chrome eklentisi', 'Chrome extension that records meetings and summarizes them in Turkish'],
  ['Emlakçılar için ilan açıklaması yazan ve portföy yöneten CRM', 'CRM that writes listing descriptions and manages portfolios for real estate agents'],
  ['Diyetisyenler için danışan takibi ve kişiye özel beslenme planı hazırlayan uygulama', 'Application for dietitians to monitor clients and prepare personalized nutrition plans'],
  ['Veteriner klinikleri için aşı hatırlatma ve hasta kaydı sistemi', 'Vaccination reminder and patient registration system for veterinary clinics'],
  ['Freelancerlar için teklif ve sözleşme hazırlayan araç', 'Tool to prepare offers and contracts for freelancers'],
  ['Kitap kulüpleri için okuma takibi ve tartışma uygulaması', 'Reading tracking and discussion app for book clubs'],
  ['Site yöneticileri için aidat takibi ve duyuru uygulaması', 'Dues tracking and announcement application for site managers'],
  ['Podcast bölümlerinden otomatik kısa video klip çıkaran araç', 'Tool that automatically extracts short video clips from podcast episodes'],
  ['Küçük işletmeler için Google yorumlarına otomatik yanıt yazan bot', 'Bot that automatically responds to Google reviews for small businesses'],
];
const plans = IDEAS.map(([tr, en]) => L.planQueries(en, tr));
const role = (p, r) => p.concepts.filter((c) => c.role === r).map((c) => c.t);
const main = (p) => p.concepts.find((c) => c.main)?.t;
const aud = (p) => role(p, 'aud')[0];
const chs = (p) => p.channel.map((c) => c.t);
const qs = (p) => p.queries.repos.map((q) => q.replace(/ in:name,description,topics.*/, ''));

// ─── Fikir çözümleme ────────────────────────────────────────────────────
test('çözümleme: kitle "for X" öbeğinden, nesne en seçici öbekten çıkar', () => {
  const want = [
    [0, 'salon', 'appointment'], [1, 'accounting', 'invoice'], [4, 'real estate', 'crm'], [5, 'dietitian', 'nutrition plan'],
    [6, 'veterinary clinic', 'vaccination reminder'], [7, 'freelancer', 'proposal'], [8, 'book club', 'reading tracking'],
    [9, 'hoa management', 'maintenance fee tracking'], [11, 'small business', 'google review'],
  ];
  for (const [i, a, m] of want) {
    assert.equal(aud(plans[i]), a, `kitle #${i + 1}`);
    assert.equal(main(plans[i]), m, `ana nesne #${i + 1}`);
  }
  assert.equal(aud(plans[10]), undefined, '"from podcast episodes" kitle değildir');
  assert.equal(main(plans[10]), 'video clip');
  assert.equal(main(plans[2]), 'question solving');
});
test('çözümleme: genel fiil ve sıfatlar terim olmaz, eylemler kavrama dönüşür', () => {
  const p = plans[5];
  for (const w of ['monitor', 'prepare', 'personalized', 'application', 'diet']) assert.ok(!p.terms.includes(w), w);
  assert.deepEqual(role(p, 'act'), ['client tracking']);
  assert.deepEqual(role(plans[11], 'act'), ['review reply']);
  assert.ok(role(plans[3], 'act').includes('meeting summary'), '"summarizes them" önceki öbeğe bağlanır');
  assert.ok(!plans[11].concepts.find((c) => c.role === 'aud').core, 'küçük işletme zayıf kitledir');
});
test('çözümleme: belirsiz fiiller bağlama göre', () => {
  const a = L._.parseIdea('Tool that records meetings', '');
  assert.deepEqual(a.nps.map((n) => n.items.map((x) => x.w).join(' ')), ['meeting']);
  assert.deepEqual(a.nps[0].acts, ['recording']);
  const b = L._.parseIdea('Clinic app for patient records and book clubs', '');
  assert.ok(b.nps.some((n) => n.items.map((x) => x.w).join(' ') === 'patient record'));
  assert.ok(b.nps.some((n) => n.items.map((x) => x.w).join(' ') === 'book club'));
});
test('çözümleme: Türkçeye göre çeviri düzeltmeleri', () => {
  assert.ok(!plans[1].terms.some((t) => /financial|advisor/.test(t)));
  assert.ok(role(plans[7], 'obj').includes('proposal') && !plans[7].terms.includes('offer'), 'teklif → proposal');
  assert.equal(aud(plans[9]), 'hoa management', 'site yöneticisi → HOA/apartman yönetimi');
  assert.ok(!plans[4].terms.includes('agent'));
});
test('plan: sorgular kitle+nesne ve nesne öbeklerinden kurulur', () => {
  assert.deepEqual(qs(plans[5]).slice(0, 3), ['dietitian nutrition', 'nutrition plan', 'dietitian']);
  assert.deepEqual(qs(plans[0]).slice(0, 2), ['salon appointment whatsapp', 'salon booking']);
  assert.ok(qs(plans[0]).includes('appointment scheduling'), 'kanıtlanmış geniş sorgu');
  assert.ok(qs(plans[1]).includes('invoice ocr') && qs(plans[1]).includes('e-fatura'));
  assert.deepEqual(qs(plans[11]).slice(0, 1), ['google review reply']);
  assert.ok(qs(plans[10]).includes('podcast clip'), 'kitlesiz fikirde çapraz kombinasyon');
  assert.ok(qs(plans[2]).some((q) => q === '"yks sınav" OR "yks exam"'), 'YKS yalnızca sınavla eşlenmiş ayrı OR sorgusunda aranır');
  assert.match(plans[0].queries.blocks[0], /^whatsapp api/);
  assert.match(plans[3].queries.blocks[0], /^extension framework/);
  for (const p of plans) {
    assert.ok(p.repoQ.length >= 1 && p.repoQ.length <= 3);
    assert.ok(p.hnQ.length >= 1 && p.needQ.length >= 1);
    assert.ok(p.repoQ.every((q) => q.terms.length <= 3));
  }
  assert.deepEqual(chs(plans[1]), ['ocr']);
  assert.ok(chs(plans[2]).includes('ai'));
});
test('plan: Türkçe olmadan ve düzenlenmiş terimlerle çalışır', () => {
  const p = L.planQueries('Telegram bot for restaurant orders');
  assert.equal(chs(p)[0], 'telegram');
  assert.equal(aud(p), undefined, '"restaurant orders" kitle değil');
  assert.equal(main(p), 'restaurant order');
  const e = L.planQueries('barber booking telegram', IDEAS[0][0], true);
  assert.equal(main(e), 'barber booking');
});
test('tekilleştirme, kök ve durak kelimeler', () => {
  const s = L._.singular;
  assert.equal(s('companies'), 'company');
  assert.equal(s('invoices'), 'invoice');
  assert.equal(s('boxes'), 'box');
  for (const w of ['status', 'business', 'analysis', 'news', 'sms', 'whatsapp', 'bus', 'dues']) assert.equal(s(w), w);
  assert.equal(L._.stem('vaccination'), L._.stem('vaccines'));
  assert.equal(L._.stem('announcements'), L._.stem('announce'));
  const p = L.planQueries('A simple AI-powered app, tool and platform for invoices');
  assert.deepEqual(role(p, 'obj'), ['invoice']);
});
test('sözlük yedeği Türkçe eklerle eşleşir', () => {
  const en = L._.enFromDict(IDEAS[0][0]);
  for (const w of ['salon', 'appointment', 'whatsapp']) assert.ok(en.includes(w), en);
  assert.ok(L._.enFromDict('Mali müşavirlerin e-fatura ve fişleri').includes('accountant'));
  assert.ok(!L._.enFromDict('noterlik işleri').includes('notes'), '3 harfli anahtar önek olarak eşleşmemeli');
});

// ─── Sıralama ───────────────────────────────────────────────────────────
const repo = (o) => ({
  full_name: o.n, html_url: o.url ?? `https://github.com/${o.n}`, description: o.d ?? '', stargazers_count: o.s ?? 0, forks_count: 0,
  pushed_at: iso(o.age ?? 10), created_at: iso(900), language: 'JavaScript', topics: o.t || [], license: o.lic === undefined ? { spdx_id: 'MIT' } : o.lic && { spdx_id: o.lic },
  archived: !!o.arch, fork: !!o.fork, homepage: '',
});
test('rankRepos: tek genel kelimeyle eşleşen proje elenir, kapsama işaretlenir', () => {
  const p = plans[5];
  const out = L.rankRepos([
    repo({ n: 'cn/mcd-nutrition-expert', d: 'McDonald\'s menu MCP with nutrition facts', s: 900, t: ['mcp', 'nutrition'] }),
    repo({ n: 'm/mealie', d: 'Self hosted recipe manager and meal planner', s: 9000, t: ['meal-planner', 'recipes'] }),
    repo({ n: 'd/dietitian-crm', d: 'Dietitian client tracking app with nutrition plans', s: 150, t: ['dietitian', 'nutrition'] }),
  ], p);
  assert.ok(!out.some((r) => r.name === 'cn/mcd-nutrition-expert'), 'yalnızca "nutrition" geçen proje elenmeli');
  const d = out.find((r) => r.name === 'd/dietitian-crm'), m = out.find((r) => r.name === 'm/mealie');
  assert.deepEqual(d.miss, []);
  assert.ok(m.mainOk && m.miss.includes('diyetisyen'), JSON.stringify(m.miss));
  assert.equal(out[0].best, true);
  assert.equal(out.filter((r) => r.best).length, 1);
});
test('rankRepos: sıralama, nedenler (Türkçe karşılıklı), lisans', () => {
  const p = plans[0];
  const out = L.rankRepos([
    repo({ n: 'a/salon-booking', d: 'Salon appointment booking with WhatsApp reminders', s: 900, t: ['salon', 'booking'] }),
    repo({ n: 'b/tiny-salon-appointment', d: 'salon website', s: 0, age: 1200, lic: null }),
    repo({ n: 'c/weather', d: 'Weather forecast app', s: 5000 }),
    repo({ n: 'd/easyappointments', d: 'Self hosted appointment scheduler', s: 4000, lic: 'GPL-3.0' }),
    repo({ n: 'a/salon-booking', d: 'dup', s: 1 }),
  ], p);
  assert.equal(out[0].name, 'a/salon-booking');
  assert.ok(!out.some((r) => r.name === 'c/weather'));
  assert.equal(out.filter((r) => r.name === 'a/salon-booking').length, 1);
  assert.ok(out[0].best);
  const ea = out.find((r) => r.name === 'd/easyappointments');
  assert.ok(ea.why[0].includes('“appointment” (randevu)'), ea.why[0]);
  assert.equal(ea.license.kind, 'copyleft');
  assert.ok(ea.why.some((w) => /GPL-3\.0: kodunu açman gerekebilir/.test(w)));
  assert.ok(ea.miss.includes('kuaför') && ea.mainOk);
  const tiny = out.find((r) => r.name === 'b/tiny-salon-appointment');
  assert.ok(tiny.score < ea.score, 'yıldızsız deneme kanıtlanmış projenin önüne geçmemeli');
  assert.ok(tiny.why.some((w) => w.startsWith('Lisans belirtilmemiş')));
  for (const r of out) { assert.ok(r.score >= 0 && r.score <= 1); assert.equal(typeof r.pushed, 'number'); assert.ok(r.why.length >= 2 && r.why.length <= 3); }
});
test('rankRepos: en iyi temel dizinin başına alınır', () => {
  const p = plans[0];
  const out = L.rankRepos([
    repo({ n: 'w/whatsapp-salon-bot', d: 'WhatsApp bot for salon owners', s: 4, t: ['whatsapp', 'salon'] }), // ana nesne (randevu) yok
    repo({ n: 'o/salon-appointments', d: 'Salon appointment booking', s: 400, t: ['salon', 'appointment'] }),
  ], p);
  assert.equal(out[0].name, 'o/salon-appointments');
  assert.ok(out[0].best && !out[1].best);
});
test('rankRepos: arşiv ve fork cezaları, güvenli URL, en fazla 8', () => {
  const p = plans[0];
  const base = { d: 'Salon appointment booking system', s: 300, t: ['salon'] };
  const out = L.rankRepos([
    repo({ ...base, n: 'x/live' }), repo({ ...base, n: 'x/old', arch: true }),
    repo({ ...base, n: 'x/smallfork', s: 10, fork: true }), repo({ ...base, n: 'x/bigfork', s: 300, fork: true }),
    repo({ ...base, n: 'x/evil', url: 'javascript:alert(1)' }), repo({ ...base, n: 'x/plain', url: 'http://github.com/x/plain' }),
  ], p);
  const by = Object.fromEntries(out.map((r) => [r.name, r]));
  assert.ok(by['x/old'].score < by['x/live'].score);
  assert.ok(by['x/old'].why.includes('Arşivlenmiş: artık geliştirilmiyor'));
  assert.ok(!by['x/smallfork']);
  assert.ok(by['x/bigfork'].score < by['x/live'].score);
  assert.ok(!by['x/evil'] && !by['x/plain']);
  assert.equal(L.rankRepos(Array.from({ length: 20 }, (_, i) => repo({ ...base, n: `m/salon-${i}`, s: 100 + i })), p).length, 8);
});
test('rankRepos: derlenmiş listeler en iyi temel sayılmaz; yerel projeler yer bulur', () => {
  const out = L.rankRepos([repo({ n: 'e/awesome-real-estate', d: 'A curated list of awesome real estate CRM resources', s: 2000, t: ['real-estate', 'crm'] })], plans[4]);
  assert.equal(out[0].best, false);
  assert.equal(out[0].list, true);
  const strong = Array.from({ length: 10 }, (_, i) => repo({ n: `g/invoice-ocr-${i}`, d: 'Invoice and receipt OCR for accounting', s: 2000 + i, t: ['invoice', 'ocr', 'accounting'] }));
  const r = L.rankRepos([...strong, repo({ n: 'tr/efatura', d: 'eArşiv üzerinden Fatura Oluşturucu', s: 400, t: ['e-fatura', 'efatura'] })], plans[1]);
  const hit = r.find((x) => x.name === 'tr/efatura');
  assert.ok(hit && hit.why[0].startsWith('Türkiye’ye özgü'));
});
test('pickTopic: iki kavramı karşılayan projelerdeki ortak konu seçilir', () => {
  const p = plans[5];
  const items = [
    repo({ n: 'a/x', d: 'Dietitian app for nutrition plans', t: ['meal-planner', 'nutrition', 'react', 'dietitian'] }),
    repo({ n: 'b/y', d: 'Nutrition plan builder for dietitians', t: ['meal-planner', 'nutrition', 'hacktoberfest'] }),
    repo({ n: 'c/z', d: 'Random nutrition facts', t: ['nutrition', 'mcdonalds'] }),
  ];
  assert.equal(L._.pickTopic(items, p), 'meal-planner', '"nutrition" zaten arandı, "react" genel');
  assert.equal(L._.pickTopic([repo({ n: 'q/q', d: 'weather', t: ['weather'] })], p), null);
});

test('licenseKind', () => {
  for (const s of ['MIT', 'Apache-2.0', 'BSD-3-Clause', 'ISC', 'Unlicense', '0BSD', 'mit']) assert.equal(L.licenseKind(s), 'permissive', s);
  for (const s of ['GPL-3.0', 'AGPL-3.0', 'LGPL-2.1', 'MPL-2.0', 'GPL-2.0-only']) assert.equal(L.licenseKind(s), 'copyleft', s);
  for (const s of ['', null, undefined]) assert.equal(L.licenseKind(s), 'none');
  assert.equal(L.licenseKind('NOASSERTION'), 'other');
});

// ─── İstek cümleleri ────────────────────────────────────────────────────
const hit = (id, html, d = 5) => ({ objectID: String(id), comment_text: html, created_at: iso(d) });
test('extractNeeds: HTML, pencere, alan kavramı alıntının içinde, yenilik', () => {
  const p = plans[0];
  const long = 'Some unrelated context about my week and the weather and many other things. '.repeat(5);
  const out = L.extractNeeds([
    hit(1, `${long}<p>I wish there was a salon booking app that sent WhatsApp reminders &amp; didn&#x27;t cost &quot;a fortune&quot;. ${long}`),
    hit(2, 'I wish there was a good weather app for hikers, honestly it would change everything.'),
    hit(3, 'We&#x27;re hiring! Looking for a senior engineer to build our salon appointment booking platform. Full-time, remote ok.'),
    hit(4, 'I wish you luck with the salon appointment thing, sounds great!'),
    hit(6, `${long}<p>I wish there was a salon booking app that sent WhatsApp reminders &amp; didn&#x27;t cost &quot;a fortune&quot;. ${long}`),
    hit(7, 'My barber would happily pay for an appointment booking tool that works over WhatsApp without an app install.', 1),
    hit(8, 'Even a simple TODO list/alerts/meeting scheduling app with calendar integration was very complicated. I am sure lots of people would pay for it, though.', 4000),
    hit(9, `Salon owners are great people. ${long} Anyway, I wish there was a better weather app that I could use on hikes.`),
    hit(10, 'How I wish my city would have an open appointment booking system. Instead I email and wait for months.', 4500),
  ], p);
  const ids = out.map((n) => n.url.split('=')[1]).sort();
  assert.deepEqual(ids, ['1', '7'], JSON.stringify(out.map((n) => n.text)));
  const a = out.find((n) => n.url.endsWith('id=1'));
  assert.ok(a.text.startsWith('I wish there was a salon booking app'));
  assert.ok(a.text.includes('& didn\'t cost "a fortune"'));
  assert.ok(!/<|&amp;|&#x27;/.test(a.text));
  assert.ok(a.text.length <= 262);
  assert.equal(a.source, 'HN yorumu');
  assert.equal(typeof a.date, 'number');
});

// ─── Karar ──────────────────────────────────────────────────────────────
const R = (o) => ({ repos: [], products: [], needs: [], ...o });
const rr = (o) => ({ name: 'o/r', rel: 0.7, stars: 500, license: { id: 'MIT', kind: 'permissive' }, pushed: Date.now() - 10 * DAY, archived: false, mainOk: true, cov: ['randevu'], miss: [], ...o });
test('verdict: fork yalnızca tam kapsamada; kısmi kapsamada dürüst cümle', () => {
  let v = L.verdict(R({ repos: [rr({ name: 'cal/com' })] }));
  assert.equal(v.kind, 'fork');
  assert.ok(v.text.includes('**cal/com**'));
  assert.equal(v.repo, 'cal/com');
  v = L.verdict(R({ repos: [rr({ name: 'm/mealie', miss: ['diyetisyen'], cov: ['beslenme planı'] })] }));
  assert.equal(v.kind, 'build');
  assert.ok(v.text.startsWith('Tam karşılığı yok ama parçaları var: **m/mealie** beslenme planı için'), v.text);
  assert.ok(v.text.includes('diyetisyen kısmını kendin eklemelisin'));
  assert.equal(L.verdict(R({ repos: [rr({ mainOk: false, miss: ['beslenme planı'], cov: [] })], products: [{}] })).kind, 'gap', 'ana nesneyi karşılamayan proje güven vermez');
  assert.equal(L.verdict(R({ repos: [rr({ fit: 2 })] })).kind, 'gap', 'Claude’un düşük puan verdiği proje önerilmez');
  v = L.verdict(R({ repos: [rr({ license: { id: 'GPL-3.0', kind: 'copyleft' } })], products: [{}, {}, {}, {}] }));
  assert.equal(v.kind, 'crowded');
  assert.equal(L.verdict(R({ repos: [rr({ stars: 5 }), rr({ stars: 5 }), rr({ stars: 5 })], products: [{}, {}] })).kind, 'build');
  assert.equal(L.verdict(R({ repos: [rr({ pushed: Date.now() - 900 * DAY })] })).kind, 'gap');
  v = L.verdict(R({ sources: [{ id: 'github', ok: false, kind: 'network' }] }));
  assert.ok(v.kind !== 'gap' && /GitHub taraması yarım kaldı/.test(v.text));
  assert.ok(L.verdict(R({ needs: [{}, {}, {}] })).text.endsWith('İnsanların bunu istediğine dair 3 işaret var.'));
});

// ─── Çıktılar ───────────────────────────────────────────────────────────
const sample = {
  v: 1, id: 'x', idea: 'Kuaför randevu asistanı', en: 'Salon appointment assistant', at: Date.now(), smart: false, summary: null, terms: ['salon', 'appointment'],
  queries: { repos: [], blocks: [], hn: [], needs: [] },
  repos: [{ name: 'a/salon', url: 'https://github.com/a/salon', desc: 'Salon booking', desc_tr: 'Kuaför rezervasyonu', stars: 900, pushed: Date.now(), license: { id: 'MIT', kind: 'permissive' }, why: ['Adında “salon” geçiyor'], best: true, miss: [] }],
  blocks: [{ name: 'w/wa', url: 'https://github.com/w/wa', desc: 'WhatsApp lib', desc_tr: 'WhatsApp kütüphanesi', stars: 20000, license: { id: 'Apache-2.0', kind: 'permissive' }, purpose_tr: 'WhatsApp bağlantısı için' }],
  products: [{ title: 'Oint', title_tr: 'Oint', url: 'https://oint.app', hn: 'https://news.ycombinator.com/item?id=9', points: 3, comments: 1, date: Date.now(), kind: 'Show HN' },
    { title: 'Evil [x]', title_tr: 'Evil [x]', url: 'https://evil.example/a)[click](javascript:alert(1))', hn: 'https://news.ycombinator.com/item?id=10', points: 1, comments: 0, date: Date.now(), kind: 'HN' }],
  radar: [{ key: 'k1', title_tr: 'Radar haberi', source: 'HN', date: Date.now() }],
  needs: [{ text: 'I wish there was a salon app', text_tr: 'Keşke bir kuaför uygulaması olsa', url: 'https://news.ycombinator.com/item?id=5', source: 'HN yorumu', date: Date.now(), votes: 0 }],
  verdict: { kind: 'fork', text: 'Sıfırdan başlama: **a/salon** sağlam bir temel.' }, stats: { repos: 1, products: 2, needs: 1 },
  sources: [{ id: 'github', ok: false, kind: 'rate', error: 'GitHub arama sınırına ulaşıldı' }, { id: 'hn', ok: true, partial: true, error: '1/7 HN araması başarısız' }],
};
test('buildPrompt kanıtları ve talimatları içerir', () => {
  const t = L.buildPrompt(sample);
  for (const s of ['https://github.com/a/salon', 'https://github.com/w/wa', 'https://oint.app', 'https://news.ycombinator.com/item?id=5', 'Kuaför rezervasyonu', 'MIT', 'Keşke bir kuaför uygulaması olsa']) assert.ok(t.includes(s), s);
  assert.ok(t.includes('Yalnızca aşağıdaki kanıtlara dayan; emin olmadığın yerde bunu söyle.'));
  assert.ok(/2 haftalık MVP/.test(t) && /KVKK/.test(t) && /3 küçük deney/.test(t));
  assert.ok(!t.includes('**'));
});
test('toMarkdown: okunur rapor, bağlantı enjeksiyonu yok', () => {
  const md = L.toMarkdown(sample);
  assert.ok(md.startsWith('# Fikir Lab: Kuaför randevu asistanı'));
  for (const s of ['[a/salon](https://github.com/a/salon)', '(https://oint.app/)', '(https://news.ycombinator.com/item?id=5)', '## Yapı taşları', '## İnsanlar ne istiyor', '## Notlar', '1/7 HN']) assert.ok(md.includes(s), s);
  assert.ok(!md.includes('](javascript'), 'javascript: bağlantısı oluşmamalı');
  assert.ok(md.includes('%29%5Bclick%5D%28javascript'), 'parantezler kodlanmalı');
  assert.ok(md.includes('Evil \\[x\\]'), 'bağlantı metnindeki köşeli parantezler kaçışlı');
});
test('parseLoose ve validPlan', () => {
  assert.deepEqual(L._.parseLoose('İşte: {"a": "x}y", "b": [1,2]} bitti', '{'), { a: 'x}y', b: [1, 2] });
  assert.deepEqual(L._.parseLoose('```json\n[{"name":"a/b","fit":8}]\n```', '['), [{ name: 'a/b', fit: 8 }]);
  assert.equal(L._.parseLoose('{bozuk', '{'), null);
  const v = L._.validPlan({ summary_tr: 'Özet', repo_queries: ['Salon Booking WhatsApp stars:>10', 42, 'appointment scheduling system tool extra'], hn_queries: 'x' });
  assert.deepEqual(v.repos, ['salon booking whatsapp', 'appointment scheduling system tool']);
  assert.equal(L._.validPlan({ repo_queries: [] }), null);
});

// ─── research() sahte ağ ile ────────────────────────────────────────────
const IDEA = IDEAS[0][0];
const GH_REPOS = { total_count: 4, items: [
  { ...repo({ n: 'open/salon-booking', d: 'Open-source salon appointment booking with WhatsApp reminders', s: 1200, t: ['salon', 'booking', 'whatsapp', 'appointment-booking'] }), owner: { login: 'open' }, node_id: 'x' },
  repo({ n: 'alex/easyappointments', d: 'Self hosted appointment scheduler', s: 4400, lic: 'GPL-3.0', t: ['scheduler'] }),
  repo({ n: 'x/salon-site', d: 'Salon appointment website', s: 12, t: ['appointment-booking', 'salon'] }),
  repo({ n: 'bad/link', d: 'salon booking', s: 50, url: 'http://insecure.example/x' }),
] };
const GH_BLOCK = { total_count: 2, items: [repo({ n: 'wwebjs/whatsapp-web.js', d: 'WhatsApp client library for NodeJS', s: 22000, lic: 'Apache-2.0', t: ['whatsapp'] }), repo({ n: 'x/awesome-whatsapp', d: 'list', s: 9000, t: ['whatsapp'] })] };
const issue = (n, title, plus, pr) => ({ title, html_url: `https://github.com/open/salon-booking/issues/${n}`, created_at: iso(30), repository_url: 'https://api.github.com/repos/open/salon-booking', reactions: { '+1': plus }, ...(pr ? { pull_request: {} } : {}) });
const GH_ISSUES = { items: [issue(1, 'Docker image is broken on ARM', 20), issue(2, 'Credit card payments during booking', 8), issue(3, 'Small thing', 1), issue(4, 'A PR about booking', 9, true), issue(5, 'Feature request: WhatsApp booking reminders', 5)] };
const HN_SHOW = { hits: [
  { objectID: '101', title: 'Show HN: Oint, a free booking app for salons', url: 'https://oint.app', points: 12, num_comments: 4, created_at: iso(200), _tags: ['story', 'show_hn'] },
  { objectID: '102', title: 'Show HN: My weather station', url: 'https://w.example', points: 50, num_comments: 4, created_at: iso(20), _tags: ['story', 'show_hn'] },
  { objectID: '103', title: 'Show HN: Barber appointment booking over WhatsApp', url: 'javascript:alert(1)', points: 3, num_comments: 0, created_at: iso(20), _tags: ['story', 'show_hn'] },
] };
const HN_CMT = { hits: [hit(201, 'I wish there was a salon booking app that sent WhatsApp reminders, seriously. ' + 'x'.repeat(3000)), hit(202, 'My barber would happily pay for an appointment booking tool that works over WhatsApp.')] };
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } });
function mockNet(over = {}) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url, init });
    if (init.signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    for (const [k, fn] of Object.entries(over)) if (url.includes(k)) { const r = await fn(url, init, calls); if (r) return r; }
    if (url.includes('translate_a')) {
      const qs = new URLSearchParams(init.body).getAll('q');
      if (url.endsWith('tl=en')) return json([['An assistant who makes appointments for hairdressers via WhatsApp', 'tr']]);
      return json(qs.map((q) => ['TR: ' + q, 'en']));
    }
    if (url.includes('api.github.com/search/issues')) return json(GH_ISSUES, 200, { 'x-ratelimit-remaining': '5' });
    if (url.includes('api.github.com/search/repositories')) return json(/whatsapp%20api/.test(url) ? GH_BLOCK : GH_REPOS, 200, { 'x-ratelimit-remaining': '8', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 60) });
    if (url.includes('hn.algolia.com')) return json(/tags=comment/.test(url) ? HN_CMT : /tags=show_hn/.test(url) ? HN_SHOW : { hits: [] });
    if (url.includes('api.anthropic.com')) return json({ error: 'no mock' }, 500);
    throw new Error('beklenmeyen URL ' + url);
  };
  return { fetch, calls, gh: () => calls.filter((c) => c.url.includes('api.github.com')) };
}
const httpsOnly = (r) => {
  for (const u of [...r.repos.map((x) => x.url), ...r.blocks.map((x) => x.url), ...r.products.flatMap((x) => [x.url, x.hn]), ...r.needs.map((x) => x.url)]) assert.ok(u.startsWith('https://'), u);
};

test('research: mutlu yol', async () => {
  const net = mockNet();
  const stages = [];
  const r = await L.research(IDEA, { fetch: net.fetch, githubToken: 'tok', onUpdate: (s, part) => { stages.push(s); assert.equal(part.v, 1); }, localItems: [
    { key: 'k1', title: 'New WhatsApp booking assistant for salons', summary: 'appointment bot', title_tr: 'Kuaförler için WhatsApp randevu asistanı', summary_tr: '', url: 'https://x.example', source: 'HN', cat: 'apps', date: Date.now() },
    { key: 'k2', title: 'GPU prices', summary: 'chips', title_tr: 'GPU fiyatları', summary_tr: '', url: 'https://y.example', source: 'HN', cat: 'news', date: Date.now() },
  ] });
  assert.deepEqual(stages.filter((s) => s !== 'github' && s !== 'hn'), ['translate', 'plan', 'rank', 'done']);
  assert.equal(stages[stages.length - 1], 'done');
  assert.ok(stages.includes('github') && stages.includes('hn'));
  assert.equal(r.idea, IDEA);
  assert.equal(typeof r.at, 'number');
  assert.equal(r.repos[0].name, 'open/salon-booking');
  assert.ok(r.repos[0].best && r.verdict.kind === 'fork' && r.verdict.text.includes('**open/salon-booking**'));
  assert.ok(r.repos[0].desc_tr.startsWith('TR: '));
  assert.ok(!r.repos.some((x) => x.name === 'bad/link'));
  assert.deepEqual(r.blocks.map((b) => b.name), ['wwebjs/whatsapp-web.js']);
  assert.ok(net.gh().some((c) => c.url.includes('topic%3Aappointment-booking')), 'konu geri beslemesi sorgusu');
  assert.ok(r.terms.includes('topic:appointment-booking'));
  // HN ön eki çeviriden önce atılır
  const oint = r.products.find((p) => p.hn.endsWith('=101'));
  assert.equal(oint.title, 'Oint, a free booking app for salons');
  assert.equal(oint.title_tr, 'TR: Oint, a free booking app for salons');
  assert.equal(oint.kind, 'Show HN');
  const bad = r.products.find((p) => p.hn.endsWith('=103'));
  assert.equal(bad.url, bad.hn);
  const gi = r.needs.filter((n) => n.source === 'GitHub isteği').map((n) => n.text);
  assert.ok(gi.includes('Credit card payments during booking') && gi.includes('Feature request: WhatsApp booking reminders'));
  assert.ok(!gi.some((t) => /Docker|Small|PR/.test(t)), 'alakasız ve PR istekleri elenir');
  assert.ok(r.needs.some((n) => n.source === 'HN yorumu'));
  assert.deepEqual(r.radar.map((x) => x.key), ['k1']);
  assert.ok(r.sources.every((s) => s.ok && !s.partial), JSON.stringify(r.sources));
  for (const x of [...r.repos.map((p) => p.pushed), ...r.products.map((p) => p.date), ...r.needs.map((n) => n.date)]) assert.equal(typeof x, 'number');
  httpsOnly(r);
  assert.ok(net.gh().every((c) => c.init.headers.Authorization === 'Bearer tok'));
  assert.ok(net.gh().some((c) => c.url.includes('sort=reactions-%2B1')));
  assert.ok(JSON.stringify(r).length < 40000);
});
test('research: tokensız en fazla 5 GitHub araması, istek araması her zaman yapılır', async () => {
  const net = mockNet({ 'search/repositories': (u) => (/whatsapp%20api/.test(u) ? null : json({ total_count: 0, items: [] })) });
  await L.research(IDEA, { fetch: net.fetch });
  const gh = net.gh();
  assert.ok(gh.length <= 5, String(gh.length));
  assert.ok(gh.some((c) => c.url.includes('search/issues')), 'boş sonuçlardaki yeniden denemeler istek hakkını yememeli');
  assert.ok(gh.some((c) => c.url.includes('whatsapp%20api')), 'kütüphane araması hakkı korunur');
});
test('research: GitHub 403 → kısmi sonuç, kind:rate', async () => {
  const reset = Math.floor(Date.now() / 1000) + 40;
  const net = mockNet({ 'api.github.com': () => json({ message: 'API rate limit exceeded' }, 403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) }) });
  const r = await L.research(IDEA, { fetch: net.fetch });
  const gh = r.sources.find((s) => s.id === 'github');
  assert.deepEqual([gh.ok, gh.kind, gh.resetAt], [false, 'rate', reset * 1000]);
  assert.equal(net.gh().length, 1);
  assert.ok(r.products.length > 0);
  assert.ok(r.verdict.kind !== 'gap', 'GitHub düşmüşken "az örnek" denmez');
});
test('research: GitHub 500 ve bozuk JSON kaynak hatası sayılır', async () => {
  let n = 0;
  const net = mockNet({ 'search/repositories': () => (n++ === 0 ? json(GH_REPOS) : n === 2 ? new Response('<html>oops', { status: 200 }) : json({ message: 'boom' }, 502)) });
  const r = await L.research(IDEA, { fetch: net.fetch });
  const gh = r.sources.find((s) => s.id === 'github');
  assert.equal(gh.ok, false);
  assert.equal(gh.kind, 'network');
  assert.ok(r.repos.length > 0, 'toplanan sonuçlar korunur');
});
test('research: kalan hak 0 olunca durur', async () => {
  const net = mockNet({ 'search/repositories': () => json(GH_REPOS, 200, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '2000000000' }) });
  const r = await L.research(IDEA, { fetch: net.fetch });
  assert.equal(net.gh().length, 1);
  const gh = r.sources.find((s) => s.id === 'github');
  assert.deepEqual([gh.kind, gh.resetAt], ['rate', 2e12]);
  assert.ok(r.repos.length > 0);
});
test('research: HN kısmi hatası görünür', async () => {
  const net = mockNet({ 'tags=comment': () => json({ message: 'down' }, 500) });
  const r = await L.research(IDEA, { fetch: net.fetch });
  const hn = r.sources.find((s) => s.id === 'hn');
  assert.equal(hn.ok, false, 'UI yalnızca ok:false kaynakları gösterir');
  assert.equal(hn.partial, true);
  assert.match(hn.error, /4\/7 HN araması başarısız/);
  assert.ok(r.products.length > 0);
});
test('research: çeviri çökerse sözlük yedeği', async () => {
  const net = mockNet({ translate_a: () => { throw new TypeError('fetch failed'); } });
  const r = await L.research(IDEA, { fetch: net.fetch });
  const tx = r.sources.find((s) => s.id === 'translate');
  assert.deepEqual([tx.ok, tx.kind], [false, 'network']);
  for (const w of ['salon', 'appointment', 'whatsapp']) assert.ok(r.en.includes(w), r.en);
  assert.ok(r.terms.includes('salon') && r.terms.includes('whatsapp'), r.terms.join());
  assert.ok(r.repos.length > 0);
  assert.equal(r.repos[0].desc_tr, r.repos[0].desc);
});
test('research: kısılmış çeviri (boş metinler) önbelleğe alınmaz', async () => {
  const store = new Map();
  const cache = { get: (k) => store.get(k), set: (k, v) => store.set(k, v) };
  const net = mockNet({ 'tl=tr': (u, init) => json(new URLSearchParams(init.body).getAll('q').map(() => [''])) });
  const r = await L.research(IDEA, { fetch: net.fetch, cache });
  assert.ok(![...store.keys()].some((k) => k.includes('tl=tr')));
  assert.equal(r.repos[0].desc_tr, r.repos[0].desc);
  assert.equal(r.sources.find((s) => s.id === 'translate').ok, false);
});
test('research: opts.en çeviriyi atlar, fikir korunur', async () => {
  const net = mockNet();
  const r = await L.research(IDEA, { fetch: net.fetch, en: 'barber booking telegram' });
  assert.equal(r.idea, IDEA);
  assert.equal(r.en, 'barber booking telegram');
  assert.ok(!net.calls.some((c) => c.url.endsWith('tl=en')));
  assert.ok(r.terms.includes('barber booking') && r.terms.includes('telegram'), r.terms.join());
  assert.match(r.queries.repos[0], /telegram/);
});
test('research: önbellek ağ çağrılarını keser, HN yorumları kırpılır', async () => {
  const store = new Map();
  const cache = { get: (k) => store.get(k), set: (k, v) => store.set(k, v) };
  await L.research(IDEA, { fetch: mockNet().fetch, cache });
  const b = mockNet();
  const r = await L.research(IDEA, { fetch: b.fetch, cache });
  assert.equal(b.calls.length, 0, b.calls.map((c) => c.url).join('\n'));
  assert.ok(r.repos.length > 0);
  const vals = JSON.stringify([...store.values()]);
  assert.ok(!vals.includes('node_id'), 'ham GitHub yükü saklanmamalı');
  for (const [k, v] of store) if (k.includes('tags=comment')) for (const h of v.v.hits) assert.ok(h.comment_text.length <= 1500);
});
test('research: iptal AbortError ile reddedilir', async () => {
  const ctrl = new AbortController();
  const net = mockNet({ 'api.github.com': (u, init) => new Promise((_, no) => init.signal.addEventListener('abort', () => no(Object.assign(new Error('x'), { name: 'AbortError' })))) });
  const p = L.research(IDEA, { fetch: net.fetch, signal: ctrl.signal });
  setTimeout(() => ctrl.abort(), 20);
  await assert.rejects(p, { name: 'AbortError' });
  const pre = new AbortController();
  pre.abort();
  await assert.rejects(L.research(IDEA, { fetch: net.fetch, signal: pre.signal }), { name: 'AbortError' });
});
test('research: boş fikir hata verir', async () => {
  await assert.rejects(L.research('   ', { fetch: mockNet().fetch }), /boş/);
});

// ─── Akıllı mod ─────────────────────────────────────────────────────────
const claudeText = (text, status = 200, extra = {}) => json(status === 200 ? { content: [{ type: 'text', text }], stop_reason: 'end_turn', ...extra } : { error: { type: 'authentication_error' } }, status);
const PLAN_OK = '{"summary_tr":"Kuaförlere WhatsApp randevu asistanı.","repo_queries":["salon booking whatsapp","appointment scheduling"],"block_queries":["whatsapp bot"],"hn_queries":["salon booking"],"need_terms":["salon booking"]}';
const smartNet = (rank) => {
  const bodies = [];
  const net = mockNet({ 'api.anthropic.com': (u, init) => {
    const b = JSON.parse(init.body);
    bodies.push({ b, h: init.headers });
    return b.model === L.MODELS.plan ? claudeText('Tamam:\n' + PLAN_OK) : rank(b);
  } });
  return { net, bodies };
};
test('akıllı mod: geçerli plan ve sıralama', async () => {
  const { net, bodies } = smartNet(() => claudeText('[{"name":"alex/easyappointments","fit":9,"why_tr":"Olgun randevu sistemi."},{"name":"open/salon-booking","fit":7,"why_tr":"Kuaföre özel."}]'));
  const r = await L.research(IDEA, { fetch: net.fetch, claudeKey: 'sk-test' });
  assert.equal(r.smart, true);
  assert.equal(r.summary, 'Kuaförlere WhatsApp randevu asistanı.');
  assert.match(r.queries.repos[0], /^salon booking whatsapp in:name,description,topics/);
  assert.match(r.queries.blocks[0], /^whatsapp bot stars:>/);
  const ea = r.repos.find((x) => x.name === 'alex/easyappointments');
  assert.equal(ea.fit, 9);
  assert.equal(ea.why[0], 'Olgun randevu sistemi.');
  assert.equal(r.repos.filter((x) => x.best).length, 1);
  assert.ok(r.repos[0].best, 'rozetli proje başta');
  if (r.verdict.repo) assert.equal(r.repos[0].name, r.verdict.repo);
  assert.deepEqual(bodies.map((x) => x.b.model), [L.MODELS.plan, L.MODELS.rank]);
  assert.deepEqual(bodies.map((x) => x.b.max_tokens), [600, 2000]);
  const h = bodies[0].h;
  assert.equal(h['x-api-key'], 'sk-test');
  assert.equal(h['anthropic-version'], '2023-06-01');
  assert.equal(h['anthropic-dangerous-direct-browser-access'], 'true');
  assert.equal(r.sources.find((s) => s.id === 'claude').ok, true);
});
test('akıllı mod: düşük puanlı proje fork/rozet almaz', async () => {
  const { net } = smartNet(() => claudeText('[{"name":"alex/easyappointments","fit":1,"why_tr":"x"},{"name":"open/salon-booking","fit":2,"why_tr":"y"},{"name":"x/salon-site","fit":1,"why_tr":"z"}]'));
  const r = await L.research(IDEA, { fetch: net.fetch, claudeKey: 'sk-test' });
  assert.ok(r.repos.length >= 3);
  assert.notEqual(r.verdict.kind, 'fork');
  assert.ok(!r.repos.some((x) => x.best));
});
test('akıllı mod: uydurma adlar reddedilir, kısmi eşleşmede kalanlar korunur', async () => {
  let { net } = smartNet(() => claudeText('[{"name":"ghost/repo","fit":9,"why_tr":"yok"}]'));
  let r = await L.research(IDEA, { fetch: net.fetch, claudeKey: 'sk-test' });
  const c = r.sources.find((s) => s.id === 'claude');
  assert.equal(c.ok, false);
  assert.ok(r.repos.length >= 2 && r.repos.every((x) => x.fit === undefined));
  ({ net } = smartNet(() => claudeText('[{"name":"open/salon-booking","fit":8,"why_tr":"iyi"}]')));
  r = await L.research(IDEA, { fetch: net.fetch, claudeKey: 'sk-test' });
  assert.equal(r.repos[0].name, 'open/salon-booking');
  assert.ok(r.repos.some((x) => x.name === 'alex/easyappointments' && x.fit === undefined), 'puanlanmayan proje düşmez');
});
test('akıllı mod: bozuk JSON, yarıda kesilen yanıt ve 401', async () => {
  let net = mockNet({ 'api.anthropic.com': () => claudeText('Üzgünüm, {şunu "yapamam') });
  let r = await L.research(IDEA, { fetch: net.fetch, claudeKey: 'sk-test' });
  assert.equal(r.smart, false);
  assert.equal(r.summary, null);
  assert.deepEqual(r.queries.repos.slice(0, 2), L.planQueries(r.en, IDEA).queries.repos.slice(0, 2));
  assert.equal(r.sources.find((s) => s.id === 'claude').ok, false);
  net = mockNet({ 'api.anthropic.com': () => claudeText(PLAN_OK.slice(0, 40), 200, { stop_reason: 'max_tokens' }) });
  r = await L.research(IDEA, { fetch: net.fetch, claudeKey: 'sk-test' });
  assert.match(r.sources.find((s) => s.id === 'claude').error, /yarıda/);
  net = mockNet({ 'api.anthropic.com': () => claudeText('', 401) });
  r = await L.research(IDEA, { fetch: net.fetch, claudeKey: 'bad' });
  const c = r.sources.find((s) => s.id === 'claude');
  assert.deepEqual([c.ok, c.kind], [false, 'auth']);
  assert.ok(r.repos.length > 0);
});
test('MODELS ve dışa açılan API', () => {
  assert.deepEqual(L.MODELS, { plan: 'claude-haiku-5-5', rank: 'claude-sonnet-5-5' });
  for (const k of ['research', 'planQueries', 'rankRepos', 'licenseKind', 'extractNeeds', 'verdict', 'buildPrompt', 'toMarkdown']) assert.equal(typeof L[k], 'function', k);
});


// ─── Genelleme ve sınır durumları ────────────────────────────────────────
test('plan: sözlükte olmayan kitleler ve tüm bitişik nesne çiftleri korunur', () => {
  for (const audience of ['nurses', 'a nurse', 'beekeepers', 'museum curators']) {
    const p = L.planQueries('An app for ' + audience + ' to prepare custom collection inventory reports');
    assert.equal(aud(p), audience.replace(/^a /, '').split(' ').map(L._.singular).join(' '));
    assert.ok(role(p, 'obj').includes('collection inventory'));
    assert.ok(role(p, 'obj').includes('inventory report'));
    assert.match(p.queries.repos[0], /collection/);
    assert.ok(p.repoQ.length <= 3);
  }
  const p = L.planQueries('A smart online app for nurses making personalized care plans and generating digital progress reports');
  for (const w of ['make', 'making', 'prepare', 'generate', 'generating', 'personalized', 'smart', 'online', 'digital']) assert.ok(!p.terms.some((t) => t.split(' ').includes(w)), w);
  assert.ok(role(p, 'obj').includes('care plan'));
  assert.ok(role(p, 'obj').includes('progress report'));
});
test('rank/verdict: ikincil işler de kapsanmalı, tek alan kelimesi rozet alamaz', () => {
  const p = plans[5];
  const out = L.rankRepos([
    repo({ n: 'd/planner', d: 'Nutrition plans for dietitians', s: 5000 }),
    repo({ n: 'd/full', d: 'Dietitian nutrition plans with client tracking', s: 500 }),
  ], p);
  const partial = out.find((r) => r.name === 'd/planner');
  assert.ok(partial.miss.some((s) => /takip/.test(s)));
  assert.equal(L.verdict(R({ repos: [partial] })).kind, 'build');
  assert.equal(L.verdict(R({ repos: out })).repo, 'd/full');
  const single = L.rankRepos([repo({ n: 'x/appointment', d: 'Appointment app', s: 10000 })], plans[0]);
  assert.ok(single.length && !single[0].best);
  assert.notEqual(L.verdict(R({ repos: single })).kind, 'fork');
});
test('pickTopic: tek kavramlı ya da tek projelik geri besleme reddedilir; konu puanı etkiler', () => {
  const p = L.planQueries('App for nurses to prepare care plans');
  const weak = [1, 2].map((i) => repo({ n: 'x/weak' + i, d: 'Care plans', t: ['care-planning'] }));
  assert.equal(L._.pickTopic(weak, p), null);
  const good = [1, 2].map((i) => repo({ n: 'x/good' + i, d: 'Care plans for nurses', t: ['care-planning'] }));
  assert.equal(L._.pickTopic(good.slice(0, 1), p), null);
  assert.equal(L._.pickTopic(good, p), 'care-planning');
  const concept = { t: 'care planning', role: 'prf', w: 0.3, bonus: true, alts: [{ s: ['care-planning'], w: 1 }] };
  const base = L._.relevance(good[0], L._.concepts(p)).rel;
  assert.ok(L._.relevance(good[0], [...L._.concepts(p), concept]).rel > base);
});
test('extractNeeds: yaşlı yorumun gücü yalnızca alıntı penceresinde ölçülür', () => {
  const elsewhere = 'Salon appointment WhatsApp scheduling. '.repeat(10);
  const old = hit(301, elsewhere + 'Unrelated context about our city and its residents and some other matters that have nothing to do with software. I wish there was a better salon appointment app for our city and all its residents.', 2200);
  assert.deepEqual(L.extractNeeds([old], plans[0]), []);
  const strong = hit(302, 'I wish there was a salon appointment booking app with WhatsApp reminders and fair pricing.', 2200);
  assert.equal(L.extractNeeds([strong], plans[0]).length, 1);
});
test('research: ağ yeniden denemeleri depo, blok ve istek bütçesini korur', async () => {
  const net = mockNet({ 'search/repositories': () => { throw new Error('offline'); } });
  const r = await L.research(IDEA, { fetch: net.fetch });
  const gh = net.gh();
  assert.ok(gh.length <= 5);
  assert.ok(gh.some((c) => c.url.includes('whatsapp%20api')));
  assert.equal(gh.filter((c) => !c.url.includes('whatsapp%20api') && c.url.includes('search/repositories')).length, 3);
  assert.ok(gh.some((c) => c.url.includes('search/issues')));
  assert.equal(r.sources.find((s) => s.id === 'github').ok, false);
});
test('research: öndeki reponun kanal ve Docker istekleri alan talebi sayılmaz', async () => {
  const net = mockNet({ 'search/issues': () => json({ items: [
    issue(10, 'Add WhatsApp dark mode styling', 100),
    issue(11, 'Add Docker support', 100),
    issue(12, 'Allow recurring salon appointments', 5),
  ] }) });
  const r = await L.research(IDEA, { fetch: net.fetch });
  assert.deepEqual(r.needs.filter((n) => n.source === 'GitHub isteği').map((n) => n.text), ['Allow recurring salon appointments']);
});
test('research: 503 ve yapısal olarak bozuk GitHub JSON başarı sayılmaz', async () => {
  for (const response of [() => json({}, 422), () => json({}, 503), () => json({ items: 'invalid' }), () => json({ items: [{ full_name: 'x/r', topics: 'invalid' }] })]) {
    const net = mockNet({ 'search/repositories': response });
    const r = await L.research(IDEA, { fetch: net.fetch });
    assert.equal(r.sources.find((s) => s.id === 'github').ok, false);
  }
});
test('research: Launch HN başlığı çeviri öncesinde temizlenir; rank ve done nihai sırada', async () => {
  const net = mockNet({ 'tags=show_hn': () => json({ hits: [
    { objectID: '901', title: 'Launch HN: Salon appointment booking app', url: 'https://example.com', created_at: iso(1), points: 20 },
  ] }) });
  const stages = [];
  const r = await L.research(IDEA, { fetch: net.fetch, onUpdate: (s, part) => { stages.push(s); if (s === 'rank') assert.ok(part.verdict); } });
  assert.deepEqual(stages.slice(-2), ['rank', 'done']);
  assert.equal(r.products[0].title_tr, 'TR: Salon appointment booking app');
  const translations = net.calls.filter((c) => c.url.endsWith('tl=tr')).flatMap((c) => new URLSearchParams(c.init.body).getAll('q'));
  assert.ok(!translations.some((s) => /^Launch HN:/.test(s)));
});
test('toMarkdown: bütün bağlantı türlerinde ayraçlar kodlanır ve metin kaçışlıdır', () => {
  const url = 'https://example.com/a()[]<> b';
  const title = '[x](javascript:evil)';
  const r = { idea: 'test', repos: [{ name: title, url, license: {}, why: [] }], blocks: [{ name: title, url }], products: [{ title, url, hn: url + '/hn' }], needs: [{ source: title, url }] };
  const md = L.toMarkdown(r);
  const links = [...md.matchAll(/\]\(([^)\n]*)\)/g)].map((m) => m[1]);
  assert.equal(links.length, 5);
  for (const link of links) {
    assert.ok(!/[()[\]<>\s]/.test(link), link);
    for (const code of ['%28', '%29', '%5B', '%5D', '%3C', '%3E', '%20']) assert.ok(link.includes(code), link);
  }
  assert.ok(md.includes('\\[x\\]'));
  assert.ok(!md.includes('](javascript:'));
});
test('akıllı mod: rank max_tokens hatası havuzu korur ve kısa Türkçe gerekçe istenir', async () => {
  const { net, bodies } = smartNet(() => claudeText('[{"name":"open/salon-booking","fit":9}]', 200, { stop_reason: 'max_tokens' }));
  const r = await L.research(IDEA, { fetch: net.fetch, claudeKey: 'test' });
  assert.ok(r.repos.length >= 2);
  assert.ok(r.repos.every((x) => x.fit === undefined));
  assert.match(r.sources.find((s) => s.id === 'claude').error, /yarıda/);
  assert.match(bodies.find((x) => x.b.model === L.MODELS.rank).b.system, /at most 12 words/);
});
test('akıllı mod: plan hatası başarılı sıralama tarafından gizlenmez', async () => {
  const net = mockNet({ 'api.anthropic.com': (u, init) => JSON.parse(init.body).model === L.MODELS.plan ? claudeText('bad') : claudeText('[{"name":"open/salon-booking","fit":8}]') });
  const r = await L.research(IDEA, { fetch: net.fetch, claudeKey: 'test' });
  const source = r.sources.find((s) => s.id === 'claude');
  assert.equal(source.ok, false);
  assert.match(source.error, /planı okunamadı/);
  assert.equal(source.n, 1);
});

test('research: kararın rozet geçersiz kılması tek genel kelimeyi en iyi yapamaz', async () => {
  const net = mockNet({ 'search/repositories': () => json({ items: [repo({ n: 'x/appointment', d: 'Appointment app', s: 10000 })] }) });
  const r = await L.research(IDEA, { fetch: net.fetch });
  assert.ok(r.repos.length);
  assert.ok(r.repos.every((r) => !r.best));
  assert.notEqual(r.verdict.kind, 'fork');
});
test('akıllı mod: düşük puanlı yedekler de puanlanmayanlardan önce gelir', async () => {
  const net = mockNet({
    'api.anthropic.com': (u, init) => JSON.parse(init.body).model === L.MODELS.plan ? claudeText(PLAN_OK) : claudeText('[{"name":"open/salon-booking","fit":3},{"name":"alex/easyappointments","fit":2}]'),
    'search/repositories': () => json({ items: GH_REPOS.items.map((r) => r.full_name === 'x/salon-site' ? { ...r, archived: true } : r) }),
  });
  const r = await L.research(IDEA, { fetch: net.fetch, claudeKey: 'test' });
  const firstUnscored = r.repos.findIndex((x) => x.fit === undefined);
  assert.ok(firstUnscored > 0);
  assert.ok(r.repos.slice(firstUnscored).every((x) => x.fit === undefined));
  assert.ok(!r.repos.some((x) => x.best));
});

// ─── Okunabilirlik, yerel anlam ve ürün kavramları ─────────────────────────
test('rankRepos: Latin dışı açıklamalar bütün alfabelerde puan ve uygunluk cezası alır', () => {
  const p = plans[5];
  const common = { n: 'x/nutrition-plan-dietitian-client-tracking', s: 500, t: ['nutrition-plan', 'dietitian', 'client-tracking'] };
  const latin = L.rankRepos([repo({ ...common, d: 'Nutrition plans for dietitians with client tracking' })], p)[0];
  assert.ok(latin.best && latin.reviewOk);
  for (const [desc, reason] of [
    ['麦当劳套餐营养搭配与每日饮食计划', /Çince/], ['План питания для клиентов диетолога', /Kiril/],
    ['خطة التغذية ومتابعة العملاء', /Arap/], ['栄養プランを管理するツールです', /Japonca/],
    ['영양 식단 계획과 고객 관리', /Korece/], ['आहार योजना और ग्राहक प्रबंधन', /Latin dışı/],
  ]) {
    const r = L.rankRepos([repo({ ...common, d: desc + ' 123 😀!!!'.repeat(300) })], p)[0];
    assert.equal(r.reviewOk, false, desc);
    assert.equal(r.bestOk, false);
    assert.equal(r.best, false);
    assert.ok(Math.abs(r.score - latin.score * 0.45) <= 0.002, desc + ': ' + r.score);
    assert.match(r.why[0], reason);
    assert.match(r.why[0], /kodu incelemesi zor olabilir/);
    for (const candidate of [r, { ...r, fit: 10 }]) {
      const v = L.verdict(R({ repos: [candidate] }));
      assert.notEqual(v.kind, 'fork');
      assert.equal(v.repo, undefined, 'kısmi temel kararı da dil engelini aşamaz');
    }
  }
});
test('rankRepos: yüzde 40 eşiği yalnızca harflerden hesaplanır, Türkçe Latin sayılır', () => {
  const p = L.planQueries('Nutrition plan');
  const rank = (d) => L.rankRepos([repo({ n: 'x/nutrition-plan', d, s: 500 })], p)[0];
  assert.equal(rank('İğüşöç中文汉字').reviewOk, true, 'tam %40 ceza almaz');
  assert.equal(rank('İğüşö中文汉字汉').reviewOk, false, '%50 ceza alır');
  assert.equal(rank('Diyetisyenler için kişiye özel beslenme planı').reviewOk, true);
  assert.equal(rank('Nutrition plan, 营养').reviewOk, true, 'Latin ağırlıklı iki dilli açıklama korunur');
  assert.equal(rank('a'.repeat(300) + '汉'.repeat(301)).reviewOk, false, 'kırpılmış açıklama yerine tam açıklama ölçülür');
});
test('rankRepos: etiket eşleşmesi boş açıklamalı depoyu en iyi veya fork yapamaz', () => {
  const p = plans[5];
  const base = { n: 'x/project', s: 1000, t: ['nutrition-plan', 'dietitian', 'client-tracking'] };
  const r = L.rankRepos([repo(base)], p)[0];
  assert.ok(r.mainOk && r.rel >= 0.6, 'yüksek etiket alakası korunur');
  assert.equal(r.reviewOk, false);
  assert.equal(r.best, false);
  assert.match(r.why[0], /yalnızca konu etiketlerinde/);
  assert.notEqual(L.verdict(R({ repos: [r] })).kind, 'fork');
  const described = L.rankRepos([repo({ ...base, d: 'Nutrition plans and client tracking for dietitians' })], p)[0];
  assert.ok(r.score < described.score * 0.7);
  assert.equal(L.rankRepos([repo({ ...base, n: 'x/nutrition-plan' })], p)[0].reviewOk, true, 'ad bağımsız kanıttır');
  assert.equal(L.rankRepos([{ ...repo(base), readme: 'Nutrition plan editor for dietitians' }], p)[0].reviewOk, true, 'var olan README kanıtı kullanılabilir');
  assert.equal(L.rankRepos([{ ...repo(base), readme: 'Installation instructions' }], p)[0].reviewOk, false, 'ilgisiz README yeterli değildir');
});
test('rankRepos: okunabilir planlayıcı ve danışan yönetimi Çince isim/etiket eşleşmesini geçer', () => {
  const out = L.rankRepos([
    repo({ n: 'tomsbin/mcd-fit-planner', d: '麦当劳饮食营养搭配助手，根据个人需求制定每日套餐计划', s: 119, t: ['nutrition-plan', 'dietitian', 'client-tracking'] }),
    repo({ n: 'vangelov/calories-in', d: 'Simple meal plan editor', s: 187, t: ['meal-planner'] }),
    repo({ n: 'example/dietitian-clients', d: 'Dietitian client tracking with nutrition plans', s: 150 }),
  ], plans[5]);
  const cn = out.find((r) => r.name === 'tomsbin/mcd-fit-planner');
  assert.ok(cn && !cn.best && !cn.reviewOk);
  assert.ok(out.findIndex((r) => r.name === 'vangelov/calories-in') < out.indexOf(cn));
  assert.ok(out.findIndex((r) => r.name === 'example/dietitian-clients') < out.indexOf(cn));
});
test('plan: site yönetimi ve aidat özgün Türkçeden konut kavramlarına dönüşür', () => {
  const p = plans[9];
  assert.equal(aud(p), 'hoa management');
  assert.equal(main(p), 'maintenance fee tracking');
  assert.ok(p.queries.repos.some((q) => q.startsWith('hoa management')));
  assert.ok(p.queries.repos.some((q) => q.includes('maintenance fee')));
  assert.ok(!p.terms.some((t) => /\b(?:site|website|dues)\b/.test(t)));
  assert.ok(p.concepts.find((c) => c.t === 'hoa management').alts.some((a) => a.s.includes('apartment management')));
  assert.ok(p.concepts.find((c) => c.t === 'hoa management').alts.some((a) => a.s.includes('condo management')));
});
test('plan: apartman, çekimli ve ASCII Türkçe konut terimleri çeviri yanlışını ezer', () => {
  for (const tr of ['Apartman yöneticilerine aidat takibi', 'SİTE YÖNETİMİ için aidat takibi', 'Site yoneticileri icin aidat takibi', 'Siteler için aidat takibi']) {
    const p = L.planQueries('Fee tracking for website managers', tr);
    assert.ok(p.terms.includes('hoa management'), tr + ': ' + p.terms.join());
    assert.ok(!p.terms.some((t) => /\b(?:website|site)\b/.test(t)));
    assert.ok(!chs(p).includes('website'));
  }
  const p = L.planQueries('Dues tracking for property managers', 'Apartman yönetimi için aidat takibi');
  assert.equal(aud(p), 'hoa management', 'genel mülk/otel anlamı da daraltılır');
});
test('plan: yerel kavramlar gerçek web sitesi ve genel servis anlamını değiştirmez', () => {
  for (const tr of ['Web sitesi yöneticileri için duyuru aracı', 'İnternet sitesi yönetimi için araç']) {
    const p = L.planQueries('Announcement app for website managers', tr);
    assert.ok(!p.terms.includes('hoa management'));
    assert.ok(chs(p).includes('website'));
  }
  const service = L.planQueries('Service scheduling app', 'Teknik servis randevu uygulaması');
  assert.ok(!service.terms.some((t) => /school|bus/.test(t)));
  const strict = L.planQueries('Website monitoring', IDEAS[9][0], true);
  assert.ok(chs(strict).includes('website'));
  assert.ok(!strict.terms.includes('hoa management'), 'kullanıcının düzenlediği İngilizce öncelikli');
});
test('plan: yerel yanlış arkadaşlar farklı alanlarda İngilizce anlamı sabitler', () => {
  for (const [tr, en, expected, wrong] of [
    ['Esnaflar için stok takibi', 'Inventory tracking for tradesmen', 'small business', 'tradesman'],
    ['Muhtarlar için duyuru uygulaması', 'Announcement app for headmen', 'neighborhood', 'headman'],
    ['Kargo takibi', 'Cargo tracking', 'shipping', 'cargo'],
    ['Dershaneler için kayıt yönetimi', 'Registration management for classrooms', 'tutoring center', 'classroom'],
    ['Etüt merkezleri için öğrenci takibi', 'Student tracking for study centers', 'tutoring center', 'study center'],
    ['Kırtasiyeler için stok takibi', 'Inventory tracking for stationary shops', 'stationery', 'stationary'],
    ['Halı saha rezervasyon uygulaması', 'Carpet field reservation app', 'football pitch', 'carpet'],
    ['Düğün salonları için rezervasyon', 'Reservation app for wedding salons', 'wedding venue', 'salon'],
    ['Okul servisleri için rota planlama', 'Route planning for school services', 'school bus', 'school service'],
    ['Emlakçılar için müşteri takibi', 'Client tracking for estate agents', 'real estate', 'estate agent'],
    ['Mali müşavirler için belge yönetimi', 'Document management for fiscal consultants', 'accounting', 'fiscal'],
  ]) {
    const p = L.planQueries(en, tr);
    assert.ok(p.terms.some((t) => t.includes(expected)), tr + ': ' + p.terms.join());
    assert.ok(!p.terms.some((t) => t.includes(wrong)), tr + ': ' + p.terms.join());
  }
});
test('plan: e-fatura, e-arşiv ve e-defter yerel teknik sorgu ve doğru kavramı korur', () => {
  for (const [tr, en, term, local] of [
    ['e-faturaları yöneten araç', 'E-invoice management tool', 'invoice', 'e-fatura'],
    ['e-arşivleri yöneten araç', 'Electronic archive management tool', 'invoice', 'e-fatura'],
    ['E ARSIV yonetim araci', 'Archive management tool', 'invoice', 'e-fatura'],
    ['e-defterleri yöneten araç', 'E-book management tool', 'accounting', 'e-defter'],
  ]) {
    const p = L.planQueries(en, tr);
    assert.ok(p.terms.includes(term), p.terms.join());
    assert.ok(p.terms.includes(local), p.terms.join());
    assert.ok(p.queries.repos.some((q) => /e-fatura|efatura|edefter/.test(q)));
    assert.ok(!p.terms.some((t) => /archive|book/.test(t)));
  }
});
test('sözlük yedeği: yerel anlamlar çeviri olmadan da sorgulara taşınır', () => {
  for (const [tr, wanted] of [
    [IDEAS[9][0], ['hoa management', 'maintenance fee']],
    ['Esnaf ve muhtar için duyurular', ['small business', 'neighborhood']],
    ['Dershane ve kırtasiye kayıtları', ['tutoring center', 'stationery']],
    ['Halı saha ve düğün salonu rezervasyonları', ['football pitch', 'wedding venue']],
    ['Okul servisi ve kargo takibi', ['school bus', 'shipping']],
  ]) {
    const en = L._.enFromDict(tr);
    for (const term of wanted) assert.ok(en.includes(term), tr + ': ' + en);
    assert.ok(!/property management|website managers|carpet field/.test(en));
  }
});
test('rankRepos: konut alanı otel PMS ve kişisel finans sonuçlarından ayrılır', () => {
  const out = L.rankRepos([
    repo({ n: 'x/personal-finance', d: 'Personal finance expense and budget tracking with announcements', s: 5000 }),
    repo({ n: 'x/hotel-pms', d: 'Hotel property management and booking system', s: 5000 }),
    repo({ n: 'x/apartment-manager', d: 'Apartment management with maintenance fee tracking and announcements', s: 300 }),
    repo({ n: 'x/condo-manager', d: 'Condo management with association dues tracking and announcements', s: 200 }),
    repo({ n: 'x/hoa', d: 'HOA management with maintenance fee tracking and resident announcements', s: 150 }),
  ], plans[9]);
  assert.ok(out.length >= 3);
  assert.ok(!out.some((r) => /hotel-pms|personal-finance/.test(r.name)));
  assert.ok(out[0].best && out[0].reviewOk);
  assert.ok(out.slice(0, 3).every((r) => r.mainOk));
});
const productHit = (id, title, points = 0, url = 'https://example.com') => ({ objectID: String(id), title: 'Show HN: ' + title, points, url, created_at: iso(1) });
test('products: podcast kaynağı olmadan klip/video ve yüksek oy tek başına yeterli değildir', () => {
  const hits = [
    productHit(1, 'Clips.live – Live video clips of every NBA play', 1000, 'https://clips.live'),
    productHit(2, 'Stable Diffusion video toy', 2000), productHit(3, 'Clip organizer', 500),
    productHit(6, 'Video clips of every NBA episode', 1000),
    productHit(4, 'Turn podcasts into short video clips', 1), productHit(5, 'Turn podcasts into clips', 0),
  ];
  const out = L._.productsFrom(hits, plans[10]);
  assert.deepEqual(out.map((p) => p.hn.split('=')[1]).sort(), ['4', '5']);
  assert.deepEqual(L._.productsFrom(hits.filter((h) => ['1', '2', '3', '6'].includes(h.objectID)), plans[10]), [], 'az sonuçta zayıf eşleşme geri alınamaz');
});
test('products: iki bağımsız kavram veya seçici ana nesne öbeği gerekir', () => {
  const out = L._.productsFrom([
    productHit(1, 'Appointment tool', 500), productHit(2, 'Salon appointment booking app', 0),
  ], plans[0]);
  assert.deepEqual(out.map((p) => p.hn.split('=')[1]), ['2']);
  const p = L.planQueries('Nutrition plan editor for dietitians with client tracking');
  const single = L._.productsFrom([productHit(3, 'Nutrition plan editor', 0)], p);
  assert.equal(single.length, 1, 'seçici ana nesne öbeği tek başına yeterlidir');
  assert.deepEqual(L._.productsFrom([productHit(4, 'Nutrition facts', 1000)], p), []);
});
test('products: aynı kelime, kanal, PRF ve akıllı ekler kavram sayısını şişiremez', () => {
  const p = L.planQueries('Clip tool with video');
  p.extraC = [{ t: 'nba', toks: ['nba'], role: 's', w: 0.4, alts: [{ s: ['nba'], w: 1 }] }];
  p.prfC = { t: 'live', toks: ['live'], role: 'prf', w: 0.3, alts: [{ s: ['live'], w: 1 }] };
  assert.deepEqual(L._.productsFrom([productHit(1, 'Live NBA clip app', 1000)], p), []);
  const overlap = L.planQueries('Client tracking and tracking app');
  assert.deepEqual(L._.productsFrom([productHit(2, 'Tracking app', 1000)], overlap), []);
  assert.deepEqual(L._.productsFrom([productHit(3, 'Appointment WhatsApp app', 1000)], plans[0]), [], 'kanal ikinci alan kavramı sayılmaz');
});
test('research: gerçek çeviri şekli konut anlamına düzeltilir, istek bütçesi korunur', async () => {
  const net = mockNet({
    'tl=en': () => json([[IDEAS[9][1], 'tr']]),
    'search/repositories': () => json({ items: [] }),
    'search/issues': () => json({ items: [] }),
  });
  const r = await L.research(IDEAS[9][0], { fetch: net.fetch });
  assert.match(r.en, /hoa management/);
  assert.match(r.en, /maintenance fee/);
  assert.doesNotMatch(r.en, /site managers/);
  const repoQueries = net.gh().filter((c) => c.url.includes('search/repositories')).map((c) => new URL(c.url).searchParams.get('q'));
  assert.ok(repoQueries.some((q) => q.includes('hoa management')));
  assert.ok(!repoQueries.some((q) => /\b(?:site|website)\b/.test(q)));
  assert.ok(net.gh().length <= 5);
});
test('akıllı mod: yüksek fit dil ve etiket engelini veya nedenini silemez', async () => {
  const net = mockNet({
    'search/repositories': (u) => /whatsapp%20api/.test(u) ? null : json({ items: [
      repo({ n: 'x/foreign', d: '预约美发管理系统，发送消息与安排客户预约', s: 5000, t: ['salon', 'appointment', 'whatsapp'] }),
      repo({ n: 'x/topics', s: 5000, t: ['salon', 'appointment', 'whatsapp'] }),
      repo({ n: 'x/readable', d: 'Salon appointment booking with WhatsApp reminders', s: 300 }),
    ] }),
    'api.anthropic.com': (u, init) => JSON.parse(init.body).model === L.MODELS.plan ? claudeText(PLAN_OK) : claudeText('[{"name":"x/foreign","fit":10,"why_tr":"Harika"},{"name":"x/topics","fit":10},{"name":"x/readable","fit":7}]'),
  });
  const r = await L.research(IDEA, { fetch: net.fetch });
  // Anahtar verilmeden sezgisel yol da aynı engelleri uygular.
  assert.equal(r.repos[0].name, 'x/readable');
  const smart = await L.research(IDEA, { fetch: net.fetch, claudeKey: 'test' });
  assert.equal(smart.repos[0].name, 'x/readable');
  assert.equal(smart.verdict.repo, 'x/readable');
  for (const name of ['x/foreign', 'x/topics']) {
    const candidate = smart.repos.find((x) => x.name === name);
    assert.ok(candidate && candidate.fit === 10 && !candidate.best && !candidate.reviewOk);
    assert.equal(candidate.why[0], candidate.reviewWarning);
  }
});
test('akıllı mod: yanlış çevrilmiş site sorguları kavram katmanını aşamaz', async () => {
  const net = mockNet({
    'tl=en': () => json([[IDEAS[9][1], 'tr']]),
    'api.anthropic.com': () => claudeText(JSON.stringify({ repo_queries: ['site management dues', 'website managers'], hn_queries: ['site managers dues'], need_terms: ['dues tracking'] })),
    'search/repositories': () => json({ items: [] }), 'search/issues': () => json({ items: [] }),
  });
  const r = await L.research(IDEAS[9][0], { fetch: net.fetch, claudeKey: 'test' });
  assert.ok(r.smart);
  assert.ok(r.queries.repos.some((q) => q.includes('hoa management')));
  assert.ok(!JSON.stringify(r.queries).match(/\b(?:site|website|dues)\b/));
});


// ─── Sorgu kapsamı ve açıklama kanıtı regresyonları ─────────────────────────
test('plan: konut ve aidat alternatifleri ayrı sorgulara yayılır', () => {
  const p = L.planQueries(IDEAS[9][1], IDEAS[9][0]);
  assert.deepEqual(p.queries.repos, [
    'apartment management maintenance fee in:name,description,topics',
    'condo management in:name,description,topics',
    'hoa management in:name,description,topics',
  ]);
  assert.deepEqual(p.concepts.find((c) => c.role === 'aud').queryAlts, [
    'apartment management', 'condo management', 'hoa management', 'property management',
  ]);
  assert.deepEqual(p.concepts.find((c) => c.main).queryAlts, ['maintenance fee tracking', 'hoa dues tracking']);
  const dues = L.planQueries('Dues tracking application', 'Aidat takibi uygulaması');
  assert.ok(dues.queries.repos.some((q) => q.startsWith('hoa dues tracking ')));
  assert.ok(!p.block && !p.queries.blocks.length);
  const strict = L.planQueries('HOA management for maintenance fees', IDEAS[9][0], true);
  assert.ok(!strict.concepts.some((c) => c.queryAlts), 'elle düzenlenen terimlere TR alternatifleri eklenmez');
});

const ghRepoQueries = (net) => net.gh().filter((c) => c.url.includes('search/repositories')).map((c) => new URL(c.url).searchParams.get('q'));
const emptySiteNet = (over = {}) => mockNet({
  'tl=en': () => json([[IDEAS[9][1], 'tr']]),
  'hn.algolia.com': () => json({ hits: [] }),
  'search/repositories': () => json({ total_count: 0, items: [] }),
  'search/issues': () => json({ items: [] }),
  ...over,
});

test('research: sıfır sonuçta alternatifleri genişletir, dört repo ve bir issues hakkını korur', async () => {
  const net = emptySiteNet();
  const r = await L.research(IDEAS[9][0], { fetch: net.fetch });
  const queries = ghRepoQueries(net);
  assert.deepEqual(queries, [
    ...plans[9].queries.repos,
    'property management in:name,description,topics',
  ]);
  assert.deepEqual(r.queries.repos, queries, 'rapor gerçekten çalıştırılan sorguları gösterir');
  assert.equal(net.gh().length, 5);
  assert.ok(net.gh().at(-1).url.includes('search/issues'));
  assert.ok(queries.every((q) => !q.includes('stars:')));
  assert.deepEqual(r.sources.find((s) => s.id === 'github'), { id: 'github', ok: true, total: 0, n: 0 });
  assert.equal(r.verdict.kind, 'gap');
  assert.match(r.verdict.text, /Bu terimlerle açık kaynak örnek bulamadık/);
  assert.match(r.verdict.text, /“Düzenle” ile genişletmeyi dene/);
  assert.match(r.verdict.text, /önce talebi doğrula/);
});

test('research: bir veya iki sonuçta sonraki alternatif filtresiz denenir', async () => {
  for (const count of [1, 2]) {
    const items = Array.from({ length: count }, (_, i) => repo({
      n: 'x/apartment-' + i, d: 'Apartment management with maintenance fee tracking and announcements', s: 18,
    }));
    const net = emptySiteNet({ 'search/repositories': () => json({ total_count: count, items }) });
    await L.research(IDEAS[9][0], { fetch: net.fetch });
    const queries = ghRepoQueries(net);
    assert.equal(queries[1], 'condo management in:name,description,topics');
    assert.ok(queries.includes('hoa management in:name,description,topics'));
    assert.ok(queries.every((q) => !q.includes('stars:')));
    assert.ok(net.gh().length <= 5);
    assert.ok(net.gh().at(-1).url.includes('search/issues'));
  }
});

test('research: az ilgili örnekte yıldız filtresi ve ek sözcükler düşer, duplicate arama yapılmaz', async () => {
  for (const sparse of [[], [repo({ n: 'x/dietitian', d: 'Dietitian client management', s: 0 })],
    Array.from({ length: 5 }, (_, i) => repo({ n: 'x/weather-' + i, d: 'Weather forecast', s: 1000 }))]) {
    const net = mockNet({
      'tl=en': () => json([[IDEAS[5][1], 'tr']]),
      'search/repositories': () => json({ total_count: sparse.length, items: sparse }),
      'search/issues': () => json({ items: [] }),
    });
    await L.research(IDEAS[5][0], { fetch: net.fetch });
    const queries = ghRepoQueries(net);
    assert.deepEqual(queries, [
      'dietitian nutrition in:name,description,topics',
      'dietitian in:name,description,topics',
      'nutrition plan in:name,description,topics',
    ]);
    assert.equal(new Set(queries).size, queries.length);
    assert.ok(net.gh().length <= 5 && net.gh().at(-1).url.includes('search/issues'));
  }
});

test('research: genişletilen condo sorgusu düşük yıldızlı ilgili projeyi bulabilir', async () => {
  const net = emptySiteNet({ 'search/repositories': (url) => {
    const q = new URL(url).searchParams.get('q');
    return json({ total_count: q === 'condo management in:name,description,topics' ? 1 : 0,
      items: q === 'condo management in:name,description,topics' ? [
        repo({ n: 'fgilde/hausverwaltung', d: 'Condo management with HOA dues tracking and announcements', s: 18 }),
      ] : [] });
  } });
  const r = await L.research(IDEAS[9][0], { fetch: net.fetch });
  assert.ok(r.repos.some((x) => x.name === 'fgilde/hausverwaltung'));
  assert.ok(r.sources.find((s) => s.id === 'github').total > 0);
  assert.doesNotMatch(r.verdict.text, /örnek bulamadık/);
});

test('research: ilk GitHub araması 403 ve remaining 0 ise kaynak rate, karar eksik taramadır', async () => {
  const net = emptySiteNet({
    'search/repositories': () => json({ message: 'API rate limit exceeded' }, 403, { 'x-ratelimit-remaining': '0' }),
  });
  const r = await L.research(IDEAS[9][0], { fetch: net.fetch });
  const source = r.sources.find((s) => s.id === 'github');
  assert.deepEqual({ id: source.id, ok: source.ok, kind: source.kind }, { id: 'github', ok: false, kind: 'rate' });
  assert.equal(net.gh().length, 1);
  assert.deepEqual(r.repos, []);
  assert.notEqual(r.verdict.kind, 'gap');
  assert.match(r.verdict.text, /GitHub taraması yarım kaldı; örnekler eksik olabilir/);
  assert.doesNotMatch(r.verdict.text, /fırsat|Az örnek|örnek bulamadık/);
});

test('rankRepos: açıklamadaki plan ve danışan kapsamı yalnızca ad eşleşmesini geçer', () => {
  const items = [
    repo({ n: 'SandraAhlgrimm/ai-nutrition-planner', d: 'Agentic Spring implementations for LangChain4j, SpringAI, Embabel', s: 36 }),
    repo({ n: 'vangelov/calories-in', d: 'A web-based meal plan editor', s: 187 }),
    repo({ n: 'Rehanchougle/Dietitian', d: 'A web application designed for dietitians to manage clients', s: 0 }),
  ];
  const out = L.rankRepos(items, plans[5]);
  const byName = Object.fromEntries(out.map((x) => [x.name, x]));
  const named = byName[items[0].full_name];
  assert.ok(named && named.mainOk && !named.bodyMainOk);
  assert.ok(named.rel <= 0.4 && !named.bestOk && !named.best);
  for (const other of items.slice(1)) {
    const candidate = byName[other.full_name];
    assert.ok(candidate && candidate.score > named.score);
    assert.ok(out.indexOf(candidate) < out.indexOf(named));
  }
  const highStars = L.rankRepos([{ ...items[0], stargazers_count: 10000 }], plans[5])[0];
  for (const candidate of [highStars, { ...highStars, fit: 10 }]) {
    const v = L.verdict(R({ repos: [candidate] }));
    assert.notEqual(v.kind, 'fork');
    assert.equal(v.repo, undefined, 'kısmi temel de ad kanıtıyla önerilemez');
    assert.equal(candidate.best, false);
  }
});

test('rankRepos: ana nesne açıklamada veya açıklama+etiketlerde bulunmalı, ad parçaları yetmez', () => {
  const p = L.planQueries('Nutrition plan application for dietitians');
  const rank = (d, t = [], n = 'x/nutrition-plan-dietitian') => L.rankRepos([repo({ n, d, t, s: 1000 })], p)[0];
  const named = rank('Agentic Spring implementations');
  assert.ok(named && !named.bodyMainOk && !named.best);
  const splitName = rank('Nutrition tool for dietitians');
  assert.ok(splitName && !splitName.bodyMainOk && !splitName.best, 'plan sözcüğü yalnızca adda');
  const described = rank('Nutrition plan editor for dietitians', [], 'x/editor');
  assert.ok(described.bodyMainOk && described.best);
  const topicAndDescription = rank('Plan editor for dietitians', ['nutrition'], 'x/editor');
  assert.ok(topicAndDescription.bodyMainOk && topicAndDescription.best);
});

test('akıllı mod: yüksek fit yalnızca ad eşleşmesine best veya fork veremez', async () => {
  const net = mockNet({
    'tl=en': () => json([[IDEAS[5][1], 'tr']]),
    'search/repositories': () => json({ items: [
      repo({ n: 'x/ai-nutrition-plan-dietitian-client-tracking', d: 'Agentic Spring implementations', s: 10000 }),
      repo({ n: 'x/readable', d: 'Nutrition plans and client tracking for dietitians', s: 300 }),
    ] }),
    'api.anthropic.com': (url, init) => JSON.parse(init.body).model === L.MODELS.plan ?
      claudeText(JSON.stringify({ repo_queries: ['dietitian nutrition'], block_queries: ['spring library'] })) :
      claudeText('[{"name":"x/ai-nutrition-plan-dietitian-client-tracking","fit":10},{"name":"x/readable","fit":7}]'),
  });
  const r = await L.research(IDEAS[5][0], { fetch: net.fetch, claudeKey: 'test' });
  const named = r.repos.find((x) => x.name === 'x/ai-nutrition-plan-dietitian-client-tracking');
  assert.ok(named.fit === 10 && !named.bodyMainOk && !named.best);
  assert.equal(r.repos[0].name, 'x/readable');
  assert.ok(r.repos[0].best);
  assert.equal(r.verdict.repo, 'x/readable');
  assert.deepEqual(r.queries.blocks, [], 'kanal olmayan akıllı blok araması bütçeyi tüketmez');
  assert.ok(net.gh().length <= 5);
});

test('rankRepos: geniş konut alternatifinden gelen property management projesi keşifte korunur', () => {
  const out = L.rankRepos([repo({
    n: 'open-condo-software/condo', d: 'Open-source property management SaaS', s: 427,
  })], plans[9]);
  assert.equal(out.length, 1);
  assert.equal(out[0].name, 'open-condo-software/condo');
  assert.equal(out[0].bodyMainOk, false, 'aidat takibi açıklamada doğrulanmadı');
  assert.equal(out[0].best, false);
  assert.notEqual(L.verdict(R({ repos: out })).kind, 'fork');
});


// ─── Eğitim Atlası ve eğitimci soruları ──────────────────────────────────
const EDU_ATLAS = { categories: [
  { id: 'planning', title: 'Öğretmen asistanı', keywords: ['lesson plan', 'rubric'], tr_keywords: ['ders planı', 'rubrik'],
    evidence: Array.from({ length: 5 }, (_, i) => ({ title: 'Planlama araştırması ' + i, url: 'https://evidence.example/plan-' + i, finding: 'Öğretmen kontrolüyle hazırlık süresi azaldı.' })), repos: [] },
  { id: 'assessment', title: 'Ölçme değerlendirme', keywords: ['rubric', 'assessment'], tr_keywords: ['rubrik', 'ölçme değerlendirme'], evidence: [], repos: [] },
  { id: 'general', title: 'Genel eğitim', keywords: ['teacher', 'education'], tr_keywords: ['öğretmen', 'eğitim'], evidence: [], repos: [] },
] };
const eduNet = (over = {}) => mockNet({
  'search/repositories': () => json({ total_count: 0, items: [] }),
  'search/issues': () => json({ items: [] }),
  'hn.algolia.com': () => json({ hits: [] }),
  'api.stackexchange.com': () => json({ items: [], quota_remaining: 299 }),
  ...over,
});
const seCalls = (net) => net.calls.filter((c) => c.url.includes('api.stackexchange.com'));
const eduRepo = (name, desc = 'Lesson plan and rubric builder for teachers') => ({ name, desc, url: 'https://github.com/' + name,
  stars: 300, forks: 20, pushed: Date.now() - 10 * DAY, lang: 'JavaScript', topics: ['lesson-plan'], license: { id: 'MIT', kind: 'permissive' }, archived: false });

test('eduMatch: Türkçe kökler, İngilizce öbekler, sıralı ve sınırlı puan; genel kelimeler atlası doldurmaz', () => {
  const out = L.eduMatch('Öğretmenler için ders planları ve rubrikler', 'Lesson plans and rubrics for teachers', EDU_ATLAS);
  assert.deepEqual(out.map((c) => c.id), ['assessment', 'planning']);
  assert.ok(out.every((c) => c.score >= 0 && c.score <= 1));
  assert.equal(L.eduMatch('Öğretmen eğitim uygulaması', 'Teacher education', EDU_ATLAS).length, 0);
  assert.deepEqual(L.eduMatch('Kuaför randevusu', 'Salon booking', EDU_ATLAS), []);
  assert.deepEqual(L.eduMatch('ders planı', 'lesson plan'), []);
});

test('eğitim kavramları: çeviri yokken de anlam ve arama alternatifleri korunur', () => {
  for (const [tr, term, alternative] of [
    ['Ders planı', 'lesson plan', 'lesson planning'], ['Kazanımlar', 'learning outcomes', 'learning objectives'],
    ['Ölçme değerlendirme', 'assessment', 'formative assessment'], ['Dereceli puanlama rubrik', 'rubric', 'grading rubric'],
    ['Soru bankası', 'question bank', 'quiz bank'], ['Deneme sınavı', 'mock exam', 'practice test'],
    ['Özel eğitim BEP', 'special education', 'IEP'], ['Disleksi', 'dyslexia', 'dyslexic'],
    ['Okuma yazma', 'literacy', 'reading'], ['Okul öncesi', 'early childhood', 'preschool'],
    ['Rehberlik', 'school counseling', 'student guidance'], ['Veli', 'parent communication', 'school parent'],
    ['Ödev', 'homework', 'assignment'], ['Öğretmenler', 'teacher', 'educator'], ['Öğrenciler', 'student', 'learner'],
    ['Sınıf', 'classroom', 'class management'], ['Akran', 'peer', 'peer learning'], ['Geri bildirim', 'feedback', 'formative feedback'],
    ['Ters yüz sınıf', 'flipped classroom', 'flipped learning'], ['Oyunlaştırma', 'gamification', 'game based learning'],
    ['Uzaktan eğitim', 'online learning', 'LMS'], ['Kodlama eğitimi', 'programming education', 'autograder'],
    ['Matematik', 'math', 'mathematics'], ['Fen', 'science', 'STEM education'], ['İngilizce öğrenme', 'language learning', 'ESL'],
  ]) {
    const en = L._.enFromDict(tr), p = L.planQueries(en, tr);
    assert.ok(en.includes(term), tr + ': ' + en);
    const c = p.concepts.find((c) => c.t === term);
    assert.ok(c, tr + ': ' + p.terms.join(', '));
    assert.ok(c.queryAlts?.includes(alternative), tr + ': ' + JSON.stringify(c.queryAlts));
  }
});

test('eğitim kavramları: sınav kısaltmaları yalnızca eşlenmiş repo sorgusuna taşınır; kurum adları taşınmaz', () => {
  for (const acronym of ['LGS', 'YKS', 'KPSS', 'TYT', 'AYT']) {
    const tr = acronym + ' öğrencileri için deneme sınavı ve soru bankası';
    const p = L.planQueries(acronym + ' students mock exams and question bank', tr);
    assert.ok(p.concepts.some((c) => c.t.includes('exam prep')));
    const hint = p.repoQ.find((q) => q.examHint);
    assert.equal(hint.terms[0], '"' + acronym.toLowerCase() + ' sınav" OR "' + acronym.toLowerCase() + ' exam"');
    assert.doesNotMatch(JSON.stringify({ ...p.queries, repos: p.queries.repos.filter((q) => !q.includes(' OR ')) }), /\b(?:lgs|yks|kpss|tyt|ayt)\b/i);
  }
  const p = L.planQueries('e-Okul EBA MEBBIS lesson planning', 'e-Okul EBA MEBBİS ders planı');
  assert.doesNotMatch(JSON.stringify(p.queries), /e-okul|e-school|\beba\b|mebbis/i);
  const strict = L.planQueries('Invoice editor', 'Öğretmen ders planı', true);
  assert.ok(!strict.terms.some((t) => /lesson|teacher/.test(t)));
});

test('research: eğitim düzeyi ve kanıtlar saklanır, eğitim dışı fikir kaynak çağırmaz', async () => {
  const net = eduNet();
  const r = await L.research('Lise öğretmenleri için ders planı ve rubrik', { en: 'Lesson plan and rubric for high school teachers', atlas: EDU_ATLAS, fetch: net.fetch });
  assert.equal(r.edu.level, 'lise');
  assert.equal(r.edu.evidence.length, 4);
  assert.equal(r.edu.cats[0].id, 'assessment');
  assert.ok(r.edu.evidence.every((e) => e.title && e.finding && e.url.startsWith('https://')));
  const generic = await L.research('Üniversite öğrencilerine yardımcı', { en: 'An assistant for university students', fetch: net.fetch });
  assert.ok(generic.edu && generic.edu.level === 'üniversite');
  const other = eduNet();
  const salon = await L.research(IDEA, { en: IDEAS[0][1], atlas: EDU_ATLAS, fetch: other.fetch });
  assert.equal(salon.edu, null);
  assert.equal(seCalls(other).length, 0);
  const machine = await L.research('Makine öğrenmesi modeli', { en: 'Machine learning model with a learning rate scheduler', fetch: other.fetch });
  assert.equal(machine.edu, null);
});

test('research: yalnızca ilk iki kategorinin zenginleştirilmiş ve ilgili repoları küratörlü eklenir', async () => {
  const atlas = { categories: [
    { ...EDU_ATLAS.categories[0], repos: [...Array.from({ length: 6 }, (_, i) => eduRepo('atlas/planner-' + i)), eduRepo('atlas/weather', 'Weather forecast'), { name: 'atlas/raw' }] },
    { ...EDU_ATLAS.categories[1], repos: [eduRepo('atlas/assessment')] },
    { id: 'third', title: 'Üçüncü', keywords: ['lesson plan'], repos: [eduRepo('atlas/third')] },
  ] };
  const net = eduNet({ 'search/repositories': () => json({ items: Array.from({ length: 8 }, (_, i) => repo({ n: 'web/planner-' + i, d: 'Lesson plan and rubric builder for teachers', s: 300 })) }) });
  const r = await L.research('Öğretmen için ders planı rubrik', { en: 'Lesson plan rubric', atlas, fetch: net.fetch });
  assert.equal(r.repos.length, 8);
  const curated = r.repos.filter((r) => r.curated);
  assert.equal(curated.length, 3);
  assert.ok(curated.every((r) => r.why.includes('Eğitim Atlası’nda öneriliyor')));
  assert.ok(!r.repos.some((r) => /weather|raw|third/.test(r.name)));
  assert.ok(net.gh().length <= 5);
  const off = eduNet({ 'api.github.com': () => json({ message: 'limit' }, 403) });
  const seeded = await L.research('Ders planı rubrik', { en: 'Lesson plan rubric', atlas, fetch: off.fetch });
  assert.equal(seeded.repos.filter((r) => r.curated).length, 3, 'GitHub başarısızken yerel atlas korunur');
});

test('rankRepos: küratörlü etiket alaka eşiğini aşamaz ve destek küçük kalır', () => {
  const p = L.planQueries('Lesson plan rubric');
  const plain = L.rankRepos([eduRepo('atlas/planner')], p)[0];
  const boosted = L.rankRepos([{ ...eduRepo('atlas/planner'), curated: true }, { ...eduRepo('atlas/weather', 'Weather forecast'), curated: true }], p);
  assert.equal(boosted.length, 1);
  assert.ok(boosted[0].score > plain.score && boosted[0].score - plain.score <= 0.026);
});

test('research: Stack Exchange konu seçimi, başlık çözme, tarih/oy/kaynak ve kota bilgisi', async () => {
  const net = eduNet({ 'api.stackexchange.com': (url) => {
    const site = new URL(url).searchParams.get('site');
    return json({ quota_remaining: site === 'matheducators' ? 298 : 297, items: [
      { title: 'How to teach math &amp; give &#39;feedback&#39;?', link: 'https://' + site + '.stackexchange.com/questions/1', creation_date: 1700000000, score: 12 },
      { title: 'Unsafe', link: 'http://example.com', creation_date: 10, score: 100 },
    ] });
  } });
  const r = await L.research('Ortaokul matematik geri bildirim', { en: 'Math feedback for middle school students', fetch: net.fetch });
  assert.equal(r.edu.level, 'ortaokul');
  const calls = seCalls(net).map((c) => new URL(c.url));
  assert.deepEqual(calls.map((u) => u.searchParams.get('site')), ['matheducators']);
  for (const u of calls) {
    for (const [k, v] of Object.entries({ order: 'desc', sort: 'relevance', pagesize: '10', filter: 'default' })) assert.equal(u.searchParams.get(k), v);
    assert.ok(u.searchParams.get('q').split(' ').length >= 2 && u.searchParams.get('q').split(' ').length <= 3);
  }
  const need = r.needs.find((n) => n.where === 'matheducators');
  assert.equal(need.text, "How to teach math & give 'feedback'?");
  assert.equal(need.source, 'Eğitimci sorusu');
  assert.equal(need.date, 1700000000000);
  assert.equal(need.votes, 12);
  assert.deepEqual(r.sources.find((s) => s.id === 'stackexchange'), { id: 'stackexchange', ok: true, n: 1, quota_remaining: 298 });
  httpsOnly(r);
  const code = eduNet();
  await L.research('Kodlama eğitimi', { en: 'Programming education with autograder', fetch: code.fetch });
  assert.deepEqual(seCalls(code).map((c) => new URL(c.url).searchParams.get('site')), ['cseducators']);
});

test('research: Stack Exchange backoff, error_id, kota ve bozuk yanıt kısmi sonucu bozmaz', async () => {
  for (const [payload, status, kind, count] of [
    [{ items: [], backoff: 30, quota_remaining: 299 }, 200, 'rate', 1],
    [{ error_id: 502, error_message: 'throttle' }, 400, 'rate', 1],
    [{ error_id: 400, error_message: 'bad' }, 400, 'network', 1],
    [{ items: [], quota_remaining: 0 }, 200, 'rate', 1],
    [{ broken: true }, 200, 'network', 1],
  ]) {
    const net = eduNet({ 'api.stackexchange.com': () => json(payload, status) });
    const r = await L.research('Matematik öğretimi', { en: 'Math lessons for students', fetch: net.fetch });
    const s = r.sources.find((s) => s.id === 'stackexchange');
    assert.equal(s.ok, false);
    assert.equal(s.kind, kind);
    assert.equal(seCalls(net).length, count);
    if (payload.backoff) assert.ok(s.resetAt > Date.now());
    assert.ok(r.edu && r.verdict && r.sources.some((s) => s.id === 'github' && s.ok));
  }
});

test('research: Stack Exchange başarı önbellekte, backoff önbellek dışında kalır', async () => {
  const map = new Map(), cache = { get: (k) => map.get(k), set: (k, v) => map.set(k, v) };
  let blocked = true;
  const net = eduNet({ 'api.stackexchange.com': () => json(blocked ? { items: [], backoff: 1 } : { items: [], quota_remaining: 298 }) });
  const opts = { en: 'Programming education', fetch: net.fetch, cache };
  await L.research('Kodlama eğitimi', opts);
  blocked = false;
  await L.research('Kodlama eğitimi', opts);
  const before = seCalls(net).length;
  await L.research('Kodlama eğitimi', opts);
  assert.equal(seCalls(net).length, before);
  assert.equal(before, 2);
});

test('eğitim çıktıları: düzey, kaynaklı pedagojik dayanak, Türkiye ve pilot ölçütleri', () => {
  const r = { ...R({}), idea: 'Ders planı', edu: { level: 'lise', cats: [{ id: 'planning', title: 'Öğretmen asistanı', score: 1 }],
    evidence: [{ title: 'Planlama deneyi', url: 'https://evidence.example/study', finding: 'Hazırlık süresi azaldı.' }] } };
  for (const text of [L.buildPrompt(r), L.toMarkdown(r)]) {
    for (const term of ['Eğitim notları', 'Hedef düzey: lise', 'MEB müfredatı', 'kazanım', 'Öğretmen iş yükü', 'Pedagojik dayanak', 'Planlama deneyi', 'https://evidence.example/study', 'KVKK', 'veli onayı', '2 hafta, 1–2 öğretmen', 'Başarı ölçütü']) assert.ok(text.includes(term), term);
  }
  assert.ok(!L.buildPrompt({ ...r, edu: null }).includes('Eğitim notları'));
  const escaped = L.toMarkdown({ ...r, edu: { cats: [], evidence: [{ title: '[Kaynak]', url: 'https://evidence.example/a)[evil](javascript:alert(1))' }] } });
  assert.ok(escaped.includes('\\[Kaynak\\]'));
  assert.ok(!escaped.includes('](javascript:'));
});


test('research: İngilizce eğitim terimleri atlas olmadan tanınır, genel geri bildirim eğitim sayılmaz', async () => {
  const net = eduNet();
  for (const en of ['Formative assessment rubric', 'Math tutor', 'Dyslexia accessibility', 'Gamification for literacy']) {
    const r = await L.research(en, { en, fetch: net.fetch });
    assert.ok(r.edu, en);
  }
  const r = await L.research('Müşteri geri bildirimlerini takip eden araç', { en: 'Customer feedback tracking', fetch: net.fetch });
  assert.equal(r.edu, null);
});

test('research: akıllı sıralama Atlas sınırını, gerekçesini ve yinelenen repo işaretini korur', async () => {
  const atlas = { categories: [{ ...EDU_ATLAS.categories[0], repos: Array.from({ length: 6 }, (_, i) => eduRepo('atlas/planner-' + i)) }] };
  const net = eduNet({
    'search/repositories': () => json({ items: [repo({ n: 'atlas/planner-0', d: 'Lesson plan and rubric builder for teachers', s: 300 }),
      ...Array.from({ length: 8 }, (_, i) => repo({ n: 'web/planner-' + i, d: 'Lesson plan and rubric builder for teachers', s: 300 }))] }),
    'api.anthropic.com': (url, init) => {
      const b = JSON.parse(init.body);
      if (b.model === L.MODELS.plan) return claudeText(JSON.stringify({ repo_queries: ['lesson plan rubric'] }));
      const list = JSON.parse(b.messages[0].content.split('Repositories:\n')[1]);
      return claudeText(JSON.stringify(list.map((r) => ({ name: r.name, fit: r.name.startsWith('atlas/') ? 10 : 7, why_tr: 'Ders planı ve rubrik için uygun.' }))));
    },
  });
  const r = await L.research('Öğretmen ders planı rubrik', { en: 'Lesson plan rubric', atlas, claudeKey: 'test', fetch: net.fetch });
  assert.equal(r.smart, true);
  assert.equal(r.repos.length, 8);
  assert.equal(r.repos.filter((r) => r.curated).length, 3);
  assert.equal(r.repos.filter((r) => r.name === 'atlas/planner-0').length, 1);
  assert.ok(r.repos.find((r) => r.name === 'atlas/planner-0').curated);
  assert.ok(r.repos.filter((r) => r.curated).every((r) => r.why.includes('Eğitim Atlası’nda öneriliyor')));
});

test('research: Stack Exchange kısmi başarı korunur; ağ hatası ve iptal ayrılır', async () => {
  const net = eduNet({ 'api.stackexchange.com': (url) => new URL(url).searchParams.get('site') === 'academia' ? json({ error_id: 400 }, 400) : json({ quota_remaining: 290, items: [
    { title: 'Teaching math lessons', link: 'https://matheducators.stackexchange.com/questions/1', score: 4, creation_date: 1700000000 },
  ] }) });
  const r = await L.research('Üniversite matematik öğretimi', { en: 'University math lessons', fetch: net.fetch });
  const s = r.sources.find((s) => s.id === 'stackexchange');
  assert.equal(s.ok, false);
  assert.equal(s.partial, true);
  assert.equal(s.n, 1);
  assert.ok(r.needs.some((n) => n.source === 'Eğitimci sorusu'));
  const offline = eduNet({ 'api.stackexchange.com': () => { throw new Error('offline'); } });
  const failed = await L.research('Matematik öğretimi', { en: 'Math lessons', fetch: offline.fetch });
  assert.equal(failed.sources.find((s) => s.id === 'stackexchange').kind, 'network');
  const ctrl = new AbortController();
  const aborted = eduNet({ 'api.stackexchange.com': () => { ctrl.abort(); throw Object.assign(new Error('aborted'), { name: 'AbortError' }); } });
  await assert.rejects(L.research('Matematik öğretimi', { en: 'Math lessons', fetch: aborted.fetch, signal: ctrl.signal }), { name: 'AbortError' });
});


for (const translated of [true, false]) test('research: sınıflandırma eğitim değildir; çeviri ' + (translated ? 'başarılı' : 'başarısız'), async () => {
  for (const word of ['sınıflandırma', 'sınıflandırıcı', 'sınıflandırılmış', 'sınıflama', 'siniflandirma']) {
    const net = eduNet({ translate_a: (url) => {
      if (!translated) throw new TypeError('offline');
      if (url.endsWith('tl=en')) return json([['Image classification model', 'tr']]);
    } });
    const r = await L.research('Görüntü ' + word + ' modeli', { atlas: EDU_ATLAS, fetch: net.fetch });
    assert.equal(r.sources.find((s) => s.id === 'translate').ok, translated);
    assert.equal(r.edu, null, word);
    assert.doesNotMatch([r.en, ...r.terms, ...r.queries.repos].join(' '), /classroom|class management/, word);
    assert.equal(seCalls(net).length, 0, word);
  }
});

test('normalizeLicense: ham ve zenginleştirilmiş lisanslar aynı kuralları kullanır', () => {
  for (const [input, expected] of [
    [null, { id: '', kind: 'none' }], [undefined, { id: '', kind: 'none' }],
    ['', { id: '', kind: 'none' }], [{}, { id: '', kind: 'none' }],
    [' MIT ', { id: 'MIT', kind: 'permissive' }],
    [{ spdx_id: 'GPL-3.0' }, { id: 'GPL-3.0', kind: 'copyleft' }],
    [{ spdx_id: 'NOASSERTION' }, { id: '', kind: 'other' }],
    ['NOASSERTION', { id: '', kind: 'other' }], ['other', { id: 'other', kind: 'other' }],
    [{ id: '', kind: 'other' }, { id: '', kind: 'other' }],
    [{ id: 'MIT', kind: 'invalid' }, { id: 'MIT', kind: 'permissive' }],
    [{ id: '', kind: 'invalid' }, { id: '', kind: 'none' }],
    ...['permissive', 'copyleft', 'other', 'none'].map((kind) => [{ id: 'custom', kind }, { id: 'custom', kind }]),
  ]) {
    const normalized = L.normalizeLicense(input);
    assert.deepEqual(normalized, expected, JSON.stringify(input));
    assert.deepEqual(L.normalizeLicense(normalized), expected, 'normalization is idempotent');
  }
});

test('research: Atlas lisans türü sıralamada, puanda ve gerekçede korunur', async () => {
  const other = { ...eduRepo('atlas/other'), license: { id: '', kind: 'other' } };
  const missing = { ...eduRepo('atlas/missing'), license: { id: '', kind: 'none' } };
  const atlas = { categories: [{ ...EDU_ATLAS.categories[0], repos: [other, missing] }] };
  const net = eduNet();
  const r = await L.research('Ders planı', { en: 'Lesson plan', atlas, fetch: net.fetch });
  const special = r.repos.find((x) => x.name === other.name);
  const absent = r.repos.find((x) => x.name === missing.name);
  assert.deepEqual(special.license, other.license);
  assert.deepEqual(absent.license, missing.license);
  assert.ok(special.why.some((w) => w.startsWith('Lisansı özel')));
  assert.ok(absent.why.some((w) => w.startsWith('Lisans belirtilmemiş')));
  assert.ok(special.score > absent.score, 'quality uses the same normalized license kind');
});

test('server tagsFor: teknik öğretmen/öğrenci bağlamı bağımsız eğitim kanıtı gerektirir', () => {
  const { tagsFor } = require('../server.js');
  for (const title of [
    'Teacher-student distillation compresses LLMs',
    'Self-distillation trains a smaller student model',
    'Curriculum learning', 'Curriculum-learning improves LLM reasoning',
    'A teacher model trains the student', 'Student language models get smaller',
    'Knowledge distillation transfers logits from a teacher to a student',
    'Curriculum learning improves student performance',
  ]) assert.ok(!tagsFor({ title }).includes('Eğitim'), title);
  for (const title of [
    'AI tools for teachers', 'Students use AI for homework', 'A new school curriculum',
    'Teacher-student distillation in schools', 'Self-distillation for classroom tutors',
    'Curriculum learning in K-12 education', 'Distillation helps students study for exams',
    'Distillation helps teachers prepare lessons',
    'Distillation ile okul öğrencilerine destek', 'Öğretmenler için curriculum learning',
    'Eğitimde self-distillation',
  ]) assert.ok(tagsFor({ title }).includes('Eğitim'), title);
  assert.ok(tagsFor({ title: 'Teacher-student distillation', summary: 'Teachers prepare lessons.' }).includes('Eğitim'));
  assert.ok(!tagsFor({ title: 'Teacher-student distillation', cat: 'edu' }).includes('Eğitim'), 'kategori etiketi okul kanıtının yerini tutmaz');
});


// Canlı tarayıcı regresyonları: yerel atlas ve ağsız yanıtlar.
const BUILT_EDU_ATLAS = require('../public/data/edu-atlas.json');
const TUTOR_CATEGORY = BUILT_EDU_ATLAS.categories.find((c) => c.id === 'tutor');
const TUTOR_IDEA = require('../atlas/edu.json').categories.find((c) => c.id === 'tutor').ideas.find((i) => i.title === 'Cevaptan önce bir soru').query;
const TUTOR_EN = 'An AI teacher teaching concepts to middle school science students through Socratic questions and gradual clues without revealing the answer';

for (const [tr, term, alt] of [
  ['Sokratik sorular', 'socratic', 'socratic tutor'],
  ['İpucu', 'hint', 'scaffolding'], ['Kademeli ipuçları', 'hint', 'scaffolding'],
  ['Cevabı vermeden', 'hint-based tutor', 'without giving answers'],
  ['Çözümü göstermeden', 'hint-based tutor', 'without giving answers'],
  ['Fen', 'science', 'STEM education'], ['Kavram yanılgısı', 'misconception', 'conceptual misunderstanding'],
  ['Çıkış kartı', 'exit ticket', 'exit slip'], ['Yardımsız', 'independent practice', 'unassisted learning'],
]) test('eğitim anlamı korunur: ' + tr, () => {
  const en = L._.enFromDict(tr), p = L.planQueries(en, tr);
  assert.ok(en.includes(term), en);
  const c = p.concepts.find((c) => c.t === term);
  assert.ok(c, p.terms.join(', '));
  assert.ok(c.queryAlts.includes(alt), JSON.stringify(c.queryAlts));
});

test('tutor planı: genel çiftler elenir, beş seçici terimle sınırlanır', () => {
  for (const en of [TUTOR_EN, L._.enFromDict(TUTOR_IDEA)]) {
    const p = L.planQueries(en, TUTOR_IDEA);
    assert.ok(p.terms.length <= 5, p.terms.join(', '));
    for (const t of ['socratic', 'hint', 'hint-based tutor', 'science']) assert.ok(p.terms.includes(t), t + ': ' + p.terms.join(', '));
    assert.doesNotMatch(JSON.stringify(p), /teacher teaching|science student|teaching concept|revealing answer|gradual clue/);
  }
  const edited = L.planQueries('Invoice editor', TUTOR_IDEA, true);
  assert.ok(!edited.terms.includes('socratic'), 'elle düzenlenen terimler Türkçeden tekrar eklenmez');
});

const tutorCrowd = () => Array.from({ length: 12 }, (_, i) => repo({ n: 'web/science-tutor-' + i,
  d: 'Science Socratic hint-based tutor with scaffolding and hints for middle school students', s: 50000 }));
for (const mode of ['crowded', 'empty', 'offline', 'smart', 'smart-low']) test('gerçek atlas: tutor sorgusu ve küratörlü tohumlar — ' + mode, async () => {
  const net = eduNet({
    translate_a: (url) => url.endsWith('tl=en') ? json([[TUTOR_EN, 'tr']]) : null,
    'search/repositories': () => mode === 'offline' ? json({ message: 'limit' }, 403) : json({ items: mode === 'empty' ? [] : tutorCrowd() }),
    'api.anthropic.com': (url, init) => {
      const b = JSON.parse(init.body);
      if (b.model === L.MODELS.plan) return claudeText(JSON.stringify({ repo_queries: ['teacher teaching', 'revealing answer'] }));
      const list = JSON.parse(b.messages[0].content.split('Repositories:\n')[1]);
      return claudeText(JSON.stringify(list.map((r) => ({ name: r.name, fit: r.name.startsWith('web/') ? 10 : mode === 'smart-low' ? 1 : 5, why_tr: 'Fikirle kısmi eşleşme.' }))));
    },
  });
  const r = await L.research(TUTOR_IDEA, { atlas: BUILT_EDU_ATLAS, fetch: net.fetch, ...(mode.startsWith('smart') ? { claudeKey: 'test' } : {}) });
  assertBestOrder(r);
  assert.equal(r.edu.cats[0].id, 'tutor');
  const repoQueries = net.gh().filter((c) => c.url.includes('search/repositories')).map((c) => new URL(c.url).searchParams.get('q'));
  assert.match(repoQueries[0], /^ai tutor socratic in:name,description,topics$/);
  assert.ok(net.gh().length <= 5, 'GitHub bütçesi korunur');
  assert.ok(r.terms.length <= 5);
  assert.ok(repoQueries.every((q) => !/teacher teaching|revealing answer/.test(q)));
  const curated = r.repos.filter((x) => x.curated);
  assert.ok(curated.length >= 2 && curated.length <= 3, curated.map((x) => x.name).join(', '));
  assert.ok(r.repos.length <= 8);
  const primary = curated.filter((x) => TUTOR_CATEGORY.repos.some((seed) => seed.name === x.name));
  assert.ok(primary.length >= 2, 'ilk kategoriden en az iki repo: ' + primary.map((x) => x.name));
  assert.ok(curated.every((x) => x.why.includes('Eğitim Atlası’nda öneriliyor')));
  if (mode === 'empty' || mode === 'offline') assert.ok(primary.some((x) => x.name === 'HKUDS/DeepTutor'));
  if (mode === 'crowded') assert.equal(r.repos.length, 8, 'yer ayırma diğer ilgili sonuçları korur');
  if (mode === 'empty') assert.ok(curated.every((x) => !x.best), 'kategori eşleşmesi tam fikir kapsamı iddia etmez');
  assert.equal(seCalls(net).length, 0, 'fen için math/academia sorgulanmaz');
});

test('gerçek atlas: yinelenen arama kaydı kategori bilgisini korur; alakasız tohum elenir', async () => {
  const atlas = { ...BUILT_EDU_ATLAS, categories: [{ ...TUTOR_CATEGORY, repos: [...TUTOR_CATEGORY.repos,
    { ...eduRepo('atlas/weather', 'Weather forecast'), topics: [] }] }] };
  const net = eduNet({ 'search/repositories': () => json({ items: [repo({ n: 'HKUDS/DeepTutor', d: TUTOR_CATEGORY.repos[0].desc, s: 47465 }), ...tutorCrowd()] }) });
  const r = await L.research(TUTOR_IDEA, { en: TUTOR_EN, atlas, fetch: net.fetch });
  assert.equal(r.repos.filter((x) => x.name === 'HKUDS/DeepTutor').length, 1);
  assert.ok(r.repos.find((x) => x.name === 'HKUDS/DeepTutor').curated);
  assert.ok(r.repos.filter((x) => x.curated).length >= 2);
  assert.ok(!r.repos.some((x) => x.name === 'atlas/weather'));
});

test('verdict: en çok iki eksik kavram listeler', () => {
  const v = L.verdict(R({ repos: [rr({ cov: ['ödev'], miss: ['ipucu', 'Sokratik yaklaşım', 'fen', 'öğretmen', 'sınıf'] })] }));
  assert.match(v.text, /ipucu ve Sokratik yaklaşım kısmını kendin eklemelisin/);
  assert.doesNotMatch(v.text, /fen|öğretmen|sınıf/);
});

test('eğitimci araması: fen/genel okul atlanır; matematik, kodlama ve üniversite ayrılır', () => {
  for (const [en, sites] of [
    ['Middle school science misconceptions and hints', []], ['Lesson plan for teachers', []],
    ['Math misconceptions with exit tickets', ['matheducators']],
    ['Programming education with autograder', ['cseducators']],
    ['Computer science tutoring', ['cseducators']],
    ['University formative assessment', ['academia']],
    ['Higher ed feedback', ['academia']],
    ['University math feedback', ['matheducators', 'academia']],
    ['Math and programming education', ['matheducators', 'cseducators']],
  ]) {
    const p = L.planQueries(en, '', true);
    assert.deepEqual(L._.educatorSearch(p, en).sites, sites, en);
  }
  const p = L.planQueries(TUTOR_EN, TUTOR_IDEA);
  assert.equal(L._.educatorSearch(p, TUTOR_EN).query.split(' ').includes('teacher'), false);
});

test('eğitimci soruları: iki seçici kavram, relevance sıralaması, ilgisiz popüler sorular elenir', async () => {
  const en = 'University math rubric and misconception';
  const net = eduNet({ 'api.stackexchange.com': (url) => {
    const site = new URL(url).searchParams.get('site');
    return json({ items: [
      { title: 'Rubric for a math misconception?', link: 'https://' + site + '.stackexchange.com/questions/1', score: 3 },
      { title: 'Teaching a class meant to inflate GPA of student athletes', link: 'https://' + site + '.stackexchange.com/questions/2', score: 9999 },
      { title: 'Is web presence important for researchers?', link: 'https://' + site + '.stackexchange.com/questions/3', score: 9999 },
      { title: 'Rubric alone', link: 'https://' + site + '.stackexchange.com/questions/4', score: 9999 },
    ], quota_remaining: 200 });
  } });
  const r = await L.research('Üniversite matematik rubrik ve kavram yanılgısı', { en, fetch: net.fetch });
  for (const c of seCalls(net)) {
    const params = new URL(c.url).searchParams;
    assert.equal(params.get('sort'), 'relevance');
    assert.equal(params.get('q'), 'rubric misconception');
  }
  assert.equal(r.needs.length, 2);
  assert.ok(r.needs.every((n) => n.text === 'Rubric for a math misconception?'));
});

test('eğitimci soruları: bir kavram + ayrı kategori anahtarı kabul edilir, eşleşmeyenler doldurulmaz', async () => {
  const atlas = { categories: [{ id: 'math', title: 'Matematik', keywords: ['math', 'geometry'], tr_keywords: ['matematik'] }] };
  const net = eduNet({ 'api.stackexchange.com': () => json({ items: [
    { title: 'Geometry rubric?', link: 'https://matheducators.stackexchange.com/questions/1', score: 1 },
    { title: 'Teaching math', link: 'https://matheducators.stackexchange.com/questions/2', score: 999 },
    { title: 'Rubric rubrics', link: 'https://matheducators.stackexchange.com/questions/3', score: 999 },
  ] }) });
  const r = await L.research('Matematik rubrik', { en: 'Math rubric', atlas, fetch: net.fetch });
  assert.deepEqual(r.needs.map((n) => n.text), ['Geometry rubric?']);
  const empty = eduNet({ 'api.stackexchange.com': () => json({ items: [
    { title: 'Is web presence important for researchers?', link: 'https://academia.stackexchange.com/questions/4', score: 999 },
  ] }) });
  const none = await L.research('Üniversite rubrik', { en: 'University rubric', fetch: empty.fetch });
  assert.deepEqual(none.needs, []);
  assert.equal(none.sources.find((s) => s.id === 'stackexchange').n, 0);
  const p = L.planQueries('Math feedback', '', true);
  const nested = { ...p.domain[0], t: 'math feedback', toks: ['math', 'feedback'], alts: [{ s: ['math', 'feedback'], w: 1 }] };
  assert.equal(L._.educatorRelevant('Math feedback', [nested], ['math feedback']), false, 'aynı kavram kategori anahtarıyla iki kere sayılmaz');
});

const EDUCATION_NEGATIVES = [
  { title: 'Grok vs. Dot vs. Muse vs. Claude Duet: which one crushes the competition?', summary: 'A personal-agent benchmark for people. Education and learning.' },
  { title: 'Anyone else building a boring, non-AI project right now?', summary: 'Reddit post about software projects and learning.' },
  { title: 'The sleep framework: A new way for LLMs to retain knowledge in continual learning', summary: 'Education Innovation', cat: 'edu' },
  { title: "😺 OpenAI's big day brought a disproof and Terra", summary: 'Most courses get built behind closed doors, then dropped on students. The Neuron Academy.' },
  { title: 'Using Codex for education at Dagster Labs', summary: 'Documentation for developers.' },
  { title: 'OpenAI, canlı internet erişimini model eğitiminden çıkarıyor', summary: 'Modellerini eğitirken eğitim ve değerlendirme verileri kullanıyor.' },
  { title: 'Brown student maps the hidden global labor powering AI' },
  { title: 'Why Engineers Should Brave Capitol Hill', summary: 'Technology education and research funding.' },
  ...['70% Of Internet Hacked By AI', 'The NEW Way to Build a Second Brain…', 'The Last AI Roadmap Video…'].map((title) => ({ title, cat: 'video', summary: 'Nick Saraev: Join Maker School. skool.com course resources and curriculum. Teachers and students in the classroom.' })),
  { title: 'I built an app that makes $2K PER DAY', cat: 'video', summary: 'Starter Story: Join the course. Students and teachers learn in school.' },
  { title: 'New model eğitimi approach', summary: 'Eğitim verisi, ön eğitim ve eğitilmiş modeller.' },
  { title: 'LLM modellerini eğitirken kullanılan yeni yöntem', cat: 'edu' },
  { title: 'Yapay zeka için eğitim verisi toplama', cat: 'edu' },
  { title: 'Ön eğitim ile eğitilmiş dil modelleri', cat: 'edu' },
  { title: 'Distillation improves LLMs', summary: 'Knowledge distillation transfers logits from a teacher to a student.' },
  { title: 'Student model learns from a teacher model', summary: 'Teacher language models and student models use distillation.' },
  { title: 'A neutral product announcement', summary: 'Join Maker School. Course resources, curriculum, The Neuron Academy and Education Innovation.' },
  { title: 'A neutral product announcement', summary: 'Teachers, teachers and more teachers.' },
  { title: 'A neutral product announcement', type: 'video', summary: 'School teachers support students in classrooms.' },
  { title: 'A neutral product announcement', url: 'https://www.youtube.com/watch?v=abc', summary: 'School teachers support students in classrooms.' },
];
const EDUCATION_POSITIVES = [
  { title: 'Yeni EBA ile okullara yapay zekâ destekli altyapı geliyor' },
  { title: 'Gerçek Öğretmenlerin Yerini Yapay Zeka Alabilir mi?…', cat: 'video' },
  { title: "AI use leads UC Berkeley math professor to see 'no point' in grading homework" },
  { title: 'Koç Topluluğu 100. yılında: Sergilerden yapay zeka eğitimine uzanan projeler' },
  { title: "Google Cloud ve TÜBİSAD'dan yapay zeka eğitimi için yeni adım" },
  { title: 'How school districts are helping teachers use AI', source: 'EdSurge' },
  { title: 'K-12 classrooms rethink homework in the age of AI', source: 'The Hechinger Report' },
  { title: 'Eğitimde yapay zekâ için yeni dönem' },
  { title: 'Yetişkinler için yapay zekâ kursu ve eğitimi başlıyor' },
  { title: 'A new pilot takes shape', summary: 'Teachers work with students in school classrooms.' },
  { title: 'Yeni pilot başladı', summary: 'Öğretmenler okul öğrencilerine destek oluyor.' },
  { title: 'Student models support classroom teachers', cat: 'edu' },
];
for (const [expected, items] of [[false, EDUCATION_NEGATIVES], [true, EDUCATION_POSITIVES]]) {
  for (const item of items) test('Eğitim etiketi ' + (expected ? 'korunur: ' : 'elenir: ') + item.title + (item.type || item.url || ''), () => {
    assert.equal(require('../server.js').tagsFor(item).includes('Eğitim'), expected, JSON.stringify(item));
  });
}


test('Atlas için ayrılan yerler yerel eşleşmeler eklenirken de korunur', () => {
  const p = L.planQueries('Socratic tutor invoice e-fatura', 'e-fatura', true);
  const primary = TUTOR_CATEGORY.repos.map((r) => ({ ...r, curated: true, curatedTop: true, curatedKeywords: TUTOR_CATEGORY.keywords }));
  const crowd = Array.from({ length: 10 }, (_, i) => repo({ n: 'web/tutor-invoice-' + i, d: 'Socratic tutor invoice', s: 50000 }));
  const local = Array.from({ length: 2 }, (_, i) => repo({ n: 'local/efatura-' + i, d: 'e-fatura GIB UBL TR invoicing for schools', s: 20 }));
  const ranked = L.rankRepos([...crowd, ...primary, ...local], p);
  assert.equal(ranked.length, 8);
  assert.ok(ranked.filter((r) => r.curatedTop).length >= 2);
  assert.equal(ranked.filter((r) => r.local).length, 2);
});


// Eğitim kapısı sorgu üretiminden bağımsızdır: API alakasız sonuç döndürebilir.
test('edu anchor: eğitim sözcükleri, Türkçe ekler ve bileşik adlar; teknik learning tek başına yetmez', () => {
  for (const anchor of ['tutor', 'tutoring', 'education', 'educational', 'edtech', 'learning', 'learner', 'student', 'teacher', 'teaching',
    'school', 'classroom', 'course', 'lesson', 'quiz', 'exam', 'study', 'flashcard', 'homework', 'curriculum', 'pedagogy',
    'k-12', 'mooc', 'lms', 'moodle', 'e-learning', 'kids learning', 'children learning', 'DeepTutor',
    'Öğrencilerin', 'Öğretmenler', 'ortaokul', 'eğitim', 'öğrenme', 'öğreten', 'dersler', 'sınavlar', 'ödevler', 'müfredat']) {
    assert.ok(L._.hasEduAnchor(anchor), anchor);
  }
  for (const text of ['hint', 'science', 'ai', 'socratic', 'machine learning', 'deep-learning', 'reinforcement_learning',
    'MachineLearning and DeepLearning', 'machine learning and reinforcement learning', 'schooling-browser', 'studentized statistics', 'classification']) {
    assert.equal(L._.hasEduAnchor(text), false, text);
  }
  assert.ok(L._.hasEduAnchor('Machine learning course'));
  assert.ok(L._.hasEduAnchor('Deep learning for classroom teachers'));
  assert.ok(L._.hasEduAnchor('Reinforcement learning tutor'));
});

test('edu gate: repo sahibi, URL ve README sayılmaz; ad/açıklama/topics yeterlidir; Atlas geçebilir', () => {
  const p = L.planQueries('Socratic science hints for students');
  const r = (n, d, t) => repo({ n, d, t, s: 50000 });
  const out = L.rankRepos([
    { ...r('education/hint', 'Science Socratic hints'), readme: 'Education tutor for students', homepage: 'https://school.example' },
    r('web/deep-learning-hint', 'Science Socratic machine learning and deep learning'),
    r('web/SocraticTutor', 'Science Socratic hints'),
    r('web/description', 'Science Socratic hints for students'),
    r('web/topic', 'Science Socratic hints', ['education']),
    { ...r('atlas/socratic', 'Socratic science hints'), curated: true, curatedTop: true, curatedKeywords: ['socratic'] },
  ], p);
  assert.deepEqual(new Set(out.map((r) => r.name)), new Set(['web/SocraticTutor', 'web/description', 'web/topic', 'atlas/socratic']));
  const ordinary = L.rankRepos([r('education/hint', 'Science Socratic hints')], { ...p, edu: false });
  assert.equal(ordinary.length, 1, 'kapı yalnızca eğitim modunda uygulanır');
});

const LIVE_EDU_REPOS = [
  repo({ n: 'smashburger-dev/socratic-workshop', d: 'Socratic workshop for teaching science through questions', s: 22 }),
  repo({ n: 'panaversity/learn-modern-ai-python', d: 'Learn modern AI Python, machine learning and deep learning', s: 879 }),
  repo({ n: 'webhintio/hint', d: 'A hinting engine for the web', s: 3701 }),
  repo({ n: 'ossc-db/pg_hint_plan', d: 'Give PostgreSQL planner hints', s: 928 }),
  repo({ n: 'WICG/ua-client-hints', d: 'User-Agent Client Hints', s: 623 }),
  repo({ n: 'AlfredoSequeida/hints', d: 'Keyboard navigation hints for your computer', s: 1387 }),
  ...TUTOR_CATEGORY.repos.filter((r) => ['HKUDS/DeepTutor', 'shayan-shojaei/open-tutor'].includes(r.name))
    .map((r) => ({ ...repo({ n: r.name, d: r.desc, s: r.stars, t: r.topics }), license: { spdx_id: r.license.id } })),
];
for (const smart of [false, true]) test('live edu regression: webhint ve teknik hints sonuçları elenir; smart=' + smart, async () => {
  const badNeed = { ...issue(900, 'Feature request: Internet Explorer hint support', 100), repository_url: 'https://api.github.com/repos/webhintio/hint' };
  const goodNeed = { ...issue(901, 'Feature request: science tutor hints for students', 5), repository_url: 'https://api.github.com/repos/smashburger-dev/socratic-workshop' };
  const net = eduNet({
    translate_a: (url) => url.endsWith('tl=en') ? json([[TUTOR_EN, 'tr']]) : null,
    'search/repositories': () => json({ items: LIVE_EDU_REPOS }),
    'search/issues': () => json({ items: [badNeed, goodNeed] }),
    'api.anthropic.com': (url, init) => {
      const b = JSON.parse(init.body);
      if (b.model === L.MODELS.plan) return claudeText(JSON.stringify({ repo_queries: ['hint', 'science', 'ai'], hn_queries: ['socratic'], need_terms: ['hint'] }));
      const list = JSON.parse(b.messages[0].content.split('Repositories:\n')[1]);
      assert.ok(list.every((r) => !/webhint|pg_hint_plan|ua-client-hints|AlfredoSequeida/.test(r.name)));
      return claudeText(JSON.stringify(list.map((r) => ({ name: r.name, fit: r.name.startsWith('smashburger') ? 10 : 7 }))));
    },
  });
  const r = await L.research(TUTOR_IDEA, { atlas: BUILT_EDU_ATLAS, fetch: net.fetch, ...(smart ? { claudeKey: 'test' } : {}) });
  assertBestOrder(r);
  assert.equal(r.edu.cats[0].id, 'tutor');
  assert.ok(r.repos.some((x) => x.name === 'HKUDS/DeepTutor'));
  assert.ok(r.repos.some((x) => x.name === 'shayan-shojaei/open-tutor'));
  assert.ok(r.repos.every((x) => !/webhint|pg_hint_plan|ua-client-hints|AlfredoSequeida|learn-modern-ai-python/.test(x.name)));
  assert.equal(r.repos[0].name, 'HKUDS/DeepTutor');
  assert.ok(!r.verdict.repo || r.repos.some((x) => x.name === r.verdict.repo && (x.curated || L._.hasEduAnchor(x.name, x.desc, ...x.topics))));
  assert.doesNotMatch(r.verdict.text, /webhint|pg_hint_plan|ua-client-hints|AlfredoSequeida/);
  assert.ok(r.needs.some((n) => n.text.includes('science tutor')));
  assert.ok(r.needs.every((n) => !/webhint|Internet Explorer/.test(n.text + n.where)));
  assert.ok(net.gh().length <= 5);
  const searches = net.gh().map((c) => new URL(c.url).searchParams.get('q'));
  for (const q of searches) {
    const text = q.replace(/\b[\w-]+:\S+/g, '').trim();
    assert.ok(L._.hasEduAnchor(text), q);
    assert.ok(text.split(/\s+/).length >= 2, q);
  }
});

test('edu queries: seyrek sonuç genişletmesi ve topics geri beslemesi eğitim koşulunu korur', async () => {
  for (const crowded of [false, true]) {
    const net = eduNet({ 'search/repositories': () => json({ items: crowded ? Array.from({ length: 5 }, (_, i) =>
      repo({ n: 'web/hint-tutor-' + i, d: 'Science Socratic hint-based tutor with scaffolding and hints for students', s: 5000, t: ['scaffolding'] })) : [] }) });
    const r = await L.research(TUTOR_IDEA, { en: 'Science Socratic hint-based tutor hints for students', fetch: net.fetch });
    assert.ok(r.edu);
    const queries = net.gh().map((c) => new URL(c.url).searchParams.get('q'));
    assert.ok(queries.length >= 3 && queries.length <= 5);
    for (const q of queries) assert.ok(L._.hasEduAnchor(q.replace(/\b[\w-]+:\S+/g, '')), q);
    if (crowded) assert.ok(queries.some((q) => q.includes('topic:scaffolding')), queries.join('; '));
    else assert.ok(queries.some((q) => /^(?:hint|science|socratic) (?:tutor|education) in:/.test(q)), 'genişletme çıplak hint değildir: ' + queries.join('; '));
  }
});

test('edu gate: bloklar, ürün başlıkları ve HN alıntıları da eğitim kanıtı gerektirir', async () => {
  const net = eduNet({ 'search/repositories': (url) => {
    const q = new URL(url).searchParams.get('q');
    return json({ items: q.includes('whatsapp api') ? [
      repo({ n: 'web/whatsapp-infra', d: 'WhatsApp API for science Socratic hints', s: 5000 }),
      repo({ n: 'web/whatsapp-school', d: 'WhatsApp API for classroom science tutoring', s: 5000 }),
    ] : [] });
  } });
  const r = await L.research('Öğrenciler için WhatsApp Sokratik fen ipuçları', { en: 'Science Socratic hint tutor through WhatsApp for students', fetch: net.fetch });
  assert.deepEqual(r.blocks.map((x) => x.name), ['web/whatsapp-school']);
  for (const q of net.gh().map((c) => new URL(c.url).searchParams.get('q'))) assert.ok(L._.hasEduAnchor(q.replace(/\b[\w-]+:\S+/g, '')), q);
  const p = L.planQueries(TUTOR_EN, TUTOR_IDEA);
  const product = (id, title, url) => ({ objectID: id, title: 'Show HN: ' + title, url, points: 999, created_at: iso(1) });
  const products = L._.productsFrom([
    product('1', 'Science Socratic hints', 'https://education.example'),
    product('2', 'Science Socratic hints tutor', 'https://example.org'),
  ], p);
  assert.deepEqual(products.map((x) => x.title), ['Science Socratic hints tutor']);
  const needs = L.extractNeeds([
    hit(801, 'I wish there was a science Socratic hints app for my browser.'),
    hit(802, 'I wish there was a science Socratic hints tutor app for my students.'),
  ], p);
  assert.equal(needs.length, 1);
  assert.match(needs[0].text, /students/);
});

test('edu gate: yalnızca Atlas eşleşmesiyle açılan eğitim modu da uygulanır', async () => {
  const atlas = { categories: [{ id: 'atlas-only', title: 'Atlas bağlamı', tr_keywords: ['özel bağlam'], keywords: ['invoice'], repos: [] }] };
  const net = eduNet({ 'search/repositories': () => json({ items: [repo({ n: 'web/invoice', d: 'Invoice editor', s: 50000 })] }) });
  const r = await L.research('Özel bağlam', { en: 'Invoice editor', atlas, fetch: net.fetch });
  assert.ok(r.edu);
  assert.equal(r.repos.length, 0);
  assert.ok(net.gh().every((c) => L._.hasEduAnchor(new URL(c.url).searchParams.get('q').replace(/\b[\w-]+:\S+/g, ''))));
});

test('edu prior: Atlas popülerlikten güçlüdür; iki ek kavram ve daha iyi kalite onu aşabilir', () => {
  const p = L.planQueries(TUTOR_EN, TUTOR_IDEA);
  const primary = { ...eduRepo('atlas/tutor', 'Hint tutor for students'), curated: true, curatedTop: true, curatedKeywords: ['tutor'] };
  const equal = repo({ n: 'web/popular-tutor', d: 'Hint tutor for students', s: 100000 });
  const stronger = repo({ n: 'web/socratic-tutor', d: 'Science Socratic hint-based tutor with hints for students', s: 100000 });
  const ranked = L.rankRepos([equal, primary], p);
  assert.equal(ranked[0].name, primary.name, 'yıldız ve best rozeti Atlas önceliğini aşamaz');
  const better = L.rankRepos([stronger, primary], p);
  assert.equal(better[0].name, stronger.full_name);
  const seed = better.find((r) => r.curated);
  assert.ok(better[0].coverage >= seed.coverage + 2);
  assert.ok(better[0].quality >= seed.quality);
  const stale = { ...stronger, pushed_at: iso(800), license: null };
  assert.equal(L.rankRepos([stale, primary], p)[0].name, primary.name, 'fazla kavram kalite kaybını tek başına örtemez');
});

test('edu verdict: eğitim dışı ve tek kavramlı depolar güçlü görünse de önerilmez', () => {
  const solid = { ...L.rankRepos([LIVE_EDU_REPOS[2]], { ...L.planQueries('Hint'), edu: false })[0],
    name: 'webhintio/hint', desc: 'Hinting engine for the web', topics: [], mainOk: true, bodyMainOk: true,
    reviewOk: true, bestOk: true, rel: 1, score: 1, stars: 50000, pushed: Date.now(), license: { id: 'MIT', kind: 'permissive' }, cov: ['hint', 'science'], miss: [] };
  assert.equal(L.verdict(R({ edu: {}, repos: [solid] })).repo, undefined);
  assert.equal(L.verdict(R({ edu: {}, repos: [{ ...solid, name: 'web/hint-tutor', desc: 'Hint tutor', coverage: 1, miss: ['science'] }] })).repo, undefined);
  assert.equal(L.verdict(R({ edu: {}, repos: [{ ...solid, name: 'web/science-tutor', desc: 'Science hint tutor', coverage: 2 }] })).repo, 'web/science-tutor');
});

test('offline Atlas değerlendirmesi: 39 query eğitim modunda, en az iki eğitim çapalı repo sorgusu', (t) => {
  const ideas = require('../atlas/edu.json').categories.flatMap((c) => c.ideas);
  assert.equal(ideas.length, 39);
  for (const { query } of ideas) {
    const en = L._.enFromDict(query), p = L.planQueries(en, query);
    assert.ok(L._.education(query, en, BUILT_EDU_ATLAS), query);
    assert.ok(p.edu, query);
    const repos = p.repoQ.map((q) => q.terms.join(' '));
    assert.ok(repos.filter((q) => L._.hasEduAnchor(q)).length >= 2, query + ': ' + repos.join('; '));
    const searches = [...repos, ...p.broadQ, ...p.hnQ, ...p.needQ, ...(p.block?.terms || [])];
    for (const q of searches) {
      assert.ok(L._.hasEduAnchor(q), query + ': ' + q);
      assert.ok(q.trim().split(/\s+/).length >= 2, query + ': ' + q);
    }
    assertCleanTerms(p, query);
    t.diagnostic(query + ' → terms: [' + p.terms.join(', ') + '] → ' + repos.join(' | '));
  }
});

// Terim öbekleri yalnızca içerik sözlüğündeki isim/sıfatlardan kurulmalı.
const TERM_JUNK = /\b(?:produce[sd]?|producing|according|accordance|trial|share[sd]?|sharing|based|using|help(?:s|ed|ing)?|prepare[sd]?|preparing|generate[sd]?|generating|with|from|for|through)\b/;
const LGS_IDEA = require('../atlas/edu.json').categories.find((c) => c.id === 'exam-prep').ideas[0].query;
const TEACHER_IDEA = require('../atlas/edu.json').categories.find((c) => c.id === 'teacher-assistant').ideas[0].query;
const LGS_EN = 'An application that produces repetition targets that can be shared with the teacher by analyzing LGS trial errors according to the topic and cause of error';
const TEACHER_EN = 'An AI assistant that prepares editable lesson plans and exit tickets for teachers in accordance with MEB learning outcomes and lesson duration';
const assertCleanTerms = (p, context) => {
  for (const term of p.terms) assert.doesNotMatch(term.replace(/hint-based/g, 'hint'), TERM_JUNK, context + ': ' + term);
  for (const c of p.concepts) {
    assert.ok(c.toks.every((t) => !L._.termNoise(t)), context + ': ' + c.t);
    if (c.toks.length > 1) assert.ok(c.toks.every(L._.contentTerm), context + ': ' + c.t);
  }
};
const assertBestOrder = (r) => {
  const best = r.repos.filter((x) => x.best);
  assert.ok(best.length <= 1);
  if (best.length) assert.equal(r.repos[0], best[0], 'best rozeti son sıralamada ilk repoda');
  if (r.verdict?.repo) assert.equal(r.verdict.repo, r.repos[0].name, 'karar ilk repoyu önerir');
  assert.ok(r.repos.every((x) => !x.best || !x.curated || x.stars >= 100));
};

for (const tr of ['deneme', 'Deneme sınavı', 'LGS deneme', 'TYT denemesi']) test('deneme kavramı trial çevirisini düzeltir: ' + tr, () => {
  const p = L.planQueries('A trial application', tr);
  const c = p.concepts.find((c) => c.t === 'mock exam');
  assert.ok(c, p.terms.join(', '));
  assert.ok(c.queryAlts.includes('practice test'));
  assert.ok(!p.concepts.some((c) => /\btrial\b/.test(c.t)));
  assertCleanTerms(p, tr);
});
for (const tr of ['yanlışlar', 'Yanlış analizi', 'hata nedeni', 'konu analizi', 'tekrar hedefi']) test('sınav analizinin yerel anlamı korunur: ' + tr, () => {
  const term = tr.startsWith('konu') ? 'topic analysis' : tr.startsWith('tekrar') ? 'review plan' : 'error analysis';
  const p = L.planQueries(L._.enFromDict(tr), tr);
  const c = p.concepts.find((c) => c.t === term);
  assert.ok(c, p.terms.join(', '));
  if (term === 'error analysis') for (const alt of ['wrong answers', 'mistake analysis']) assert.ok(c.queryAlts.includes(alt));
  assertCleanTerms(p, tr);
});

test('LGS ve öğretmen asistanı: canlı çeviri fiilleri terimleri kirletmez', () => {
  for (const [tr, en, expected] of [
    [LGS_IDEA, LGS_EN, ['mock exam', 'error analysis', 'review plan', 'exam prep']],
    [TEACHER_IDEA, TEACHER_EN, ['lesson plan', 'learning outcomes', 'exit ticket']],
  ]) {
    const p = L.planQueries(en, tr);
    assertCleanTerms(p, tr);
    for (const term of expected) assert.ok(p.concepts.some((c) => c.toks.includes(term)), term + ': ' + p.terms.join(', '));
    assert.ok(p.repoQ.filter((q) => L._.hasEduAnchor(q.terms.join(' '))).length >= 2);
  }
});

test('içerik sözlüğü: bilinmeyen sözcükler ve işlev/fiil sözcükleri serbest bigram kuramaz', () => {
  for (const token of ['produce', 'produces', 'producing', 'according', 'accordance', 'share', 'sharing', 'based', 'using', 'help', 'helping', 'wibble']) {
    const p = L.planQueries('Invoice ' + token + ' tracking');
    assert.ok(!p.concepts.some((c) => c.toks.length > 1 && c.toks.includes(token)), token);
    assertCleanTerms(p, token);
  }
  for (const term of ['patient record', 'book club', 'care plan', 'nutrition plan']) {
    const p = L.planQueries(term);
    assert.ok(p.terms.includes(term), term);
  }
});

for (const smart of [false, true]) test('Atlas best: benimsenmiş küratörlü repo kapsamı doğrulanınca ilk sırada; smart=' + smart, async () => {
  const strongDesc = 'Science Socratic hint-based tutor with scaffolding and hints for middle school students';
  const items = [
    repo({ n: 'web/workshop', d: strongDesc, s: 90000 }),
    repo({ n: 'HKUDS/DeepTutor', d: strongDesc, s: 47465 }),
    repo({ n: 'LEARNableLabs/opentutor', d: strongDesc, s: 1 }),
  ];
  const net = eduNet({
    translate_a: (url) => url.endsWith('tl=en') ? json([[TUTOR_EN, 'tr']]) : null,
    'search/repositories': () => json({ items }),
    'api.anthropic.com': (url, init) => {
      const b = JSON.parse(init.body);
      if (b.model === L.MODELS.plan) return claudeText('{}');
      const list = JSON.parse(b.messages[0].content.split('Repositories:\n')[1]);
      return claudeText(JSON.stringify(list.map((r) => ({ name: r.name, fit: r.name.includes('opentutor') ? 10 : 8 }))));
    },
  });
  const r = await L.research(TUTOR_IDEA, { atlas: BUILT_EDU_ATLAS, fetch: net.fetch, ...(smart ? { claudeKey: 'test' } : {}) });
  assertBestOrder(r);
  assert.equal(r.repos[0].name, 'HKUDS/DeepTutor');
  assert.equal(r.repos[0].best, true);
  assert.ok(r.repos[0].coverage >= 2 && r.repos[0].bodyMainOk);
  assert.equal(r.verdict.repo, 'HKUDS/DeepTutor');
  const tiny = r.repos.find((x) => x.name === 'LEARNableLabs/opentutor');
  assert.ok(tiny && !tiny.best);
});

test('Atlas best: kategori önceliği kapsamı olmayan tohuma rozet vermez veya rozeti aşağı itemez', async () => {
  const net = eduNet({ translate_a: (url) => url.endsWith('tl=en') ? json([[TUTOR_EN, 'tr']]) : null,
    'search/repositories': () => json({ items: [repo({ n: 'web/socratic-workshop',
    d: 'Science Socratic hint-based tutor with scaffolding and hints for students', s: 5000 })] }) });
  const r = await L.research(TUTOR_IDEA, { atlas: BUILT_EDU_ATLAS, fetch: net.fetch });
  assertBestOrder(r);
  assert.equal(r.repos[0].name, 'web/socratic-workshop');
  assert.equal(r.repos[0].best, true);
  assert.equal(r.verdict.repo, r.repos[0].name, JSON.stringify({ verdict: r.verdict, repo: r.repos[0] }));
  const deep = r.repos.find((x) => x.name === 'HKUDS/DeepTutor');
  assert.ok(deep && !deep.best && !deep.bestOk, 'Atlas tek başına kapsam kanıtı değildir');
});

test('deneme bağlamı: öğrencinin tek denemesi deneme sınavı değildir', () => {
  const tr = 'Moodle ödevlerinde öğrenci denemesinden sonra ipucu';
  const p = L.planQueries(L._.enFromDict(tr), tr);
  assert.ok(!p.concepts.some((c) => c.t === 'mock exam'));
  assert.ok(p.concepts.some((c) => c.t === 'hint'));
});

test('Atlas best: kısmi karar benimsenmiş küratörlü temeli yalnızca popülerlik için değiştirmez', () => {
  const p = L.planQueries('Lesson plan and rubric and math for teachers');
  const desc = 'Lesson plan and rubric builder for teachers';
  const ranked = L.rankRepos([
    repo({ n: 'web/popular', d: desc, s: 100000 }),
    { ...eduRepo('atlas/planner', desc), curated: true, curatedTop: true, curatedKeywords: ['lesson plan'] },
  ], p);
  assert.ok(ranked[0].best && ranked[0].curated);
  assert.ok(ranked[0].coverage >= 2 && ranked[0].miss.length);
  const result = { edu: {}, repos: ranked, products: [], sources: [] };
  result.verdict = L.verdict(result);
  assertBestOrder(result);
  assert.equal(result.verdict.repo, 'atlas/planner');
});

test('verdict: best kapsam denetimini geçmeyen repo önerilmez', () => {
  assert.equal(L.verdict(R({ repos: [rr({ bestOk: false })] })).repo, undefined);
});


// Canlı küme: kullanıcı yalnızca repo adını verdiğinde fixture sahibi 'live' kullanılır.
const LIVE_EXAM_REPOS = [
  repo({ n: 'nastaso/cloudcertprep', d: 'AWS Cloud Practitioner mock exam and exam prep with error analysis and review plan by subject', s: 800 }),
  repo({ n: 'turer73/bilge-arena', d: 'YKS sınav hazırlığı ve oyunlaştırılmış soru çözümü', s: 0, lic: null, t: ['yks'] }),
  repo({ n: 'live/claude-architect-exam-guide', d: 'Certified Claude architect exam prep and mock exam guide', s: 500 }),
  repo({ n: 'sailor-sh/CK-X', d: 'CKAD/CKA mock exams and exam prep', s: 1200 }),
  repo({ n: 'live/kubernetes-security-kcsa-mock', d: 'Kubernetes security KCSA mock exams', s: 300 }),
  repo({ n: 'live/CKA-Exam-Practice-Questions', d: 'CKA exam prep practice questions', s: 900 }),
];
const STUDENT_EXAM_REPOS = [
  repo({ n: 'students/school-exam-practice', d: 'Mock exam and exam prep for school students with error analysis, review plan and subject practice', s: 600 }),
  repo({ n: 'students/lgs-practice', d: 'LGS sınav: high school entrance mock exam and exam prep, error analysis, review plan by subject', s: 300, t: ['lgs'] }),
];
const EXAM_CATEGORY = BUILT_EDU_ATLAS.categories.find((c) => c.id === 'exam-prep');
const LIVE_EXAM_ATLAS = { categories: [{ ...EXAM_CATEGORY, repos: EXAM_CATEGORY.repos.filter((r) => r.name === 'turer73/bilge-arena') }] };

test('exam level: Türkçe ve İngilizce okul düzeyleri sorgulara taşınır; KPSS yetişkin kalır', () => {
  for (const [idea, level] of [
    ['LGS deneme sınavı', 'ortaokul'], ['YKS exam prep', 'lise'], ['TYT exam prep', 'lise'], ['AYT exam prep', 'lise'],
    ['ilkokul sınavı', 'ilkokul'], ['ortaokul sınavı', 'ortaokul'], ['lise sınavı', 'lise'],
    ['Öğrenciler için sınav hazırlığı', 'okul'], ['Student exam practice', 'okul'], ['K-12 exam prep', 'K-12'],
    ['High school entrance exam prep', 'ortaokul'], ['School exam practice', 'okul'], ['Secondary school exam prep', 'lise'], ['KPSS sınav hazırlığı', 'yetişkin'],
  ]) {
    const p = L.planQueries(idea, idea);
    assert.equal(p.edu.level, level, idea);
    if (level !== 'yetişkin') {
      const english = p.repoQ.filter((q) => !q.examHint);
      assert.ok(english.length >= 2, idea);
      assert.ok(english.every((q) => /school|student exam practice/.test(q.terms.join(' '))), idea);
    }
    for (const q of p.repoQ.filter((q) => q.examHint)) {
      assert.match(q.terms[0], /"(?:lgs|yks|tyt|ayt|kpss) sınav" OR "(?:lgs|yks|tyt|ayt|kpss) exam"/);
      assert.ok(p.queries.repos.some((s) => s.includes(q.terms[0]) && s.endsWith('in:name,description,topics')));
    }
  }
});

test('school gate: profesyonel hazırlık ad/açıklama/topics alanlarından elenir, kürasyon kapıyı aşamaz', () => {
  const school = L.planQueries('Student mock exam and exam prep', 'LGS sınavı');
  const adult = L.planQueries('Professional mock exam and exam prep');
  const desc = 'Mock exam and exam prep for students';
  for (const token of ['certification', 'certified', 'aws', 'azure', 'gcp', 'kubernetes', 'cka', 'ckad', 'cks', 'kcsa', 'comptia', 'ccna', 'pmp', 'cissp', 'leetcode', 'interview prep', 'cloud practitioner', 'solutions architect', 'aws_mock', 'ckad_practice', 'interview_prep', 'CloudPractitioner']) {
    for (const where of ['name', 'desc', 'topics']) {
      const r = repo({ n: 'school/' + (where === 'name' ? token.replace(/ /g, '-') : 'practice'), d: desc + (where === 'desc' ? ' ' + token : ''), t: where === 'topics' ? [token] : [], s: 500 });
      assert.equal(L.rankRepos([{ ...r, curated: true, curatedTop: true, curatedKeywords: ['mock exam'] }], school).length, 0, where + ': ' + token);
      assert.equal(L.rankRepos([r], adult).length, 1, 'profesyonel fikir korunur: ' + token);
    }
  }
  const positive = { ...STUDENT_EXAM_REPOS[0], full_name: 'aws/school-exam-practice', readme: 'AWS certification', homepage: 'https://aws.example' };
  assert.equal(L.rankRepos([positive], school).length, 1, 'sahip, README ve URL filtre kanıtı değildir');
});

test('TR exams: yerel eşleşme puanı ve Türkçe gerekçe; kısaltma alt dize/sahipten gelmez', () => {
  for (const exam of ['lgs', 'yks', 'tyt', 'ayt', 'kpss']) {
    const p = L.planQueries('Mock exam and exam prep', exam.toUpperCase() + ' sınavı');
    const base = repo({ n: 'web/practice', d: 'Mock exam and exam prep for students', s: 500 });
    const plain = L.rankRepos([base], p)[0];
    for (const r of [{ ...base, full_name: 'web/' + exam }, { ...base, full_name: 'web/' + exam + '_practice' }, { ...base, description: base.description + ' ' + exam.toUpperCase() }, { ...base, topics: [exam] }]) {
      const local = L.rankRepos([r], p)[0];
      assert.ok(local.local, exam);
      assert.ok(local.score > plain.score, exam);
      assert.ok(local.why.includes('Türkiye’deki sınava yönelik'));
    }
    for (const name of [exam + '/practice', 'web/' + exam + 'auth']) assert.ok(!L.rankRepos([{ ...base, full_name: name }], p)[0].local, name);
  }
});

for (const smart of [false, true]) for (const positives of [false, true]) test('live LGS regression: certification yok, 0★ küratörlü repo best olamaz; smart=' + smart + ', positives=' + positives, async () => {
  const items = [...LIVE_EXAM_REPOS, ...(positives ? STUDENT_EXAM_REPOS : [])];
  const net = eduNet({
    translate_a: (url) => url.endsWith('tl=en') ? json([[LGS_EN, 'tr']]) : null,
    'search/repositories': () => json({ items }),
    'api.anthropic.com': (url, init) => {
      const b = JSON.parse(init.body);
      if (b.model === L.MODELS.plan) return claudeText(JSON.stringify({ repo_queries: ['mock exam', 'exam prep'], hn_queries: ['exam prep'], need_terms: ['exam prep'] }));
      const list = JSON.parse(b.messages[0].content.split('Repositories:\n')[1]);
      assert.ok(list.every((r) => !LIVE_EXAM_REPOS.filter((x) => x.stargazers_count > 0).some((x) => x.full_name === r.name)));
      return claudeText(JSON.stringify(list.map((r) => ({ name: r.name, fit: 10, why_tr: 'Sınav hazırlığı örneği' }))));
    },
  });
  const r = await L.research(LGS_IDEA, { atlas: LIVE_EXAM_ATLAS, fetch: net.fetch, ...(smart ? { claudeKey: 'test' } : {}) });
  assert.equal(r.edu.level, 'ortaokul');
  assert.equal(r.edu.cats[0].id, 'exam-prep');
  assertBestOrder(r);
  const bilge = r.repos.find((x) => x.name === 'turer73/bilge-arena');
  assert.ok(bilge && bilge.curated && bilge.stars === 0 && !bilge.best);
  assert.ok(bilge.local && bilge.why.includes('Türkiye’deki sınava yönelik'));
  assert.ok(r.repos.every((x) => !LIVE_EXAM_REPOS.filter((x) => x.stargazers_count > 0).some((bad) => bad.full_name === x.name)));
  if (positives) {
    for (const good of STUDENT_EXAM_REPOS) assert.ok(r.repos.some((x) => x.name === good.full_name), good.full_name);
    assert.ok(r.repos[0].best && r.repos[0].stars >= 100);
    assert.equal(r.verdict.repo, r.repos[0].name);
    assert.ok(r.repos.find((x) => x.name === 'students/lgs-practice').why.includes('Türkiye’deki sınava yönelik'));
  } else {
    assert.ok(r.repos.every((x) => !x.best));
    assert.ok(['gap', 'build'].includes(r.verdict.kind));
    assert.equal(r.verdict.repo, undefined);
  }
  const queries = net.gh().filter((c) => c.url.includes('search/repositories')).map((c) => new URL(c.url).searchParams.get('q'));
  assert.ok(queries.some((q) => q === '"lgs sınav" OR "lgs exam" in:name,description,topics'), queries.join('; '));
  assert.ok(queries.filter((q) => !q.includes(' OR ')).every((q) => /school|student exam practice/.test(q)), queries.join('; '));
  assert.ok(net.gh().length <= 5);
});

test('school adoption: çok sayıda 0★ örnek rozet veya kalabalık pazar iddiası üretmez', () => {
  const p = L.planQueries('Student mock exam and exam prep', 'LGS sınavı');
  const ranked = L.rankRepos(Array.from({ length: 6 }, (_, i) => ({ ...STUDENT_EXAM_REPOS[0], full_name: 'students/practice-' + i, stargazers_count: 0 })), p);
  assert.equal(ranked.length, 6);
  assert.ok(ranked.every((r) => !r.best));
  const v = L.verdict({ edu: p.edu, repos: ranked, products: [{}, {}, {}, {}], sources: [] });
  assert.ok(['gap', 'build'].includes(v.kind));
  assert.equal(v.repo, undefined);
  const professional = { ...ranked[0], desc: 'AWS certification mock exam and exam prep', stars: 50000, bestOk: true, best: true, miss: [] };
  assert.equal(L.verdict({ edu: p.edu, repos: [professional], sources: [] }).repo, undefined);
});
