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
  assert.ok(!qs(plans[2]).some((q) => /\byks\b/.test(q)), 'yks tek başına GitHub’da gürültü getirir');
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
