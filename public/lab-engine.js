// Fikir Lab motoru: fikri İngilizce sorgulara çevirir, GitHub ve Hacker News'ten kanıt toplar, sıralar.
// DOM'a dokunmaz. Tarayıcıda window.LabEngine, Node'da require('./public/lab-engine.js').
const LabEngine = (() => {
  const MODELS = { plan: 'claude-haiku-5-5', rank: 'claude-sonnet-5-5' };
  const DAY = 864e5;
  const TTL_API = 6 * 3600e3, TTL_TX = 7 * DAY;
  const TX_URL = 'https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=';
  const GH = 'https://api.github.com/search/';
  const HN = 'https://hn.algolia.com/api/v1/search';
  const CLAUDE = 'https://api.anthropic.com/v1/messages';
  const GH_BUDGET = 5;

  // ─── Metin yardımcıları ───────────────────────────────────────────────
  const lower = (s) => String(s || '').toLowerCase();
  const trLower = (s) => String(s || '').toLocaleLowerCase('tr');
  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
  const decode = (s) => String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] !== '#') return ENT[e.toLowerCase()] ?? m;
    const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '';
  });
  const stripHtml = (s) => decode(String(s || '').replace(/<\/?p>|<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ''))
    .replace(/[ \t\r]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
  const safeUrl = (u) => { try { const x = new URL(String(u)); return x.protocol === 'https:' ? x.href : ''; } catch { return ''; } };
  const clip = (s, n) => (s = String(s || '').replace(/\s+/g, ' ').trim()).length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s;
  const uniq = (a) => [...new Set(a.filter(Boolean))];
  const hash = (str) => { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0; return (h >>> 0).toString(36) + str.length.toString(36); };
  const ts = (d) => (typeof d === 'number' ? d : Date.parse(d) || 0);
  const daysAgo = (d) => (ts(d) ? (Date.now() - ts(d)) / DAY : Infinity);
  const joinTr = (a) => (a.length > 1 ? a.slice(0, -1).join(', ') + ' ve ' + a[a.length - 1] : a[0] || '');
  const err = (msg, kind = 'network') => Object.assign(new Error(msg), { kind });

  const KEEP_S = new Set('news sms ios analytics saas aws gas canvas kubernetes whatsapp notes maps jobs ads css js os yes this its has was his is us plus status bus campus atlas alias chaos lens series species physics mathematics economics logistics electronics diabetes ethics metrics devops llms dues glasses'.split(' '));
  function singular(w) {
    if (w.length < 4 || KEEP_S.has(w)) return w;
    if (/ies$/.test(w) && w.length > 4) return w.slice(0, -3) + 'y';
    if (/(ch|sh|x|ss|zz)es$/.test(w)) return w.slice(0, -2);
    if (/s$/.test(w) && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
    return w;
  }
  // Eşleştirme kökü: tekil + hafif ek atma (invoicing≈invoice, vaccination≈vaccine, announcement≈announce)
  const stem = (w) => { w = singular(w); const s = w.replace(/(ations?|ions?|ments?|ing|ed|e)$/, ''); return s.length >= 5 ? s.replace(/e$/, '') : w; };
  const words = (s) => lower(s).split(/[^a-z0-9+#]+/).filter(Boolean);
  const termKey = (t) => ' ' + words(t).map(stem).join(' ') + ' ';
  // Metni eşleştirme alanına çevir: kökler, kelime kümesi, (ad için) bitişik ham metin
  const field = (text, m = 1, isName = false) => {
    const ws = words(text).map(stem);
    return { m, s: ' ' + ws.join(' ') + ' ', set: new Set(ws), raw: isName ? lower(text).replace(/[^a-z0-9]/g, '') : '' };
  };
  function has(f, str) {
    if (/[ -]/.test(str)) return f.s.includes(termKey(str)) || (!!f.raw && str.length >= 6 && f.raw.includes(lower(str).replace(/[^a-z0-9]/g, '')));
    const st = stem(str);
    if (f.set.has(st) || f.set.has(st + 'er') || f.set.has(st + st.slice(-1) + 'er') || f.set.has(st + 'r')) return true;
    return !!(f.raw && st.length >= 5 && f.raw.includes(st));
  }

  // ─── Sözlükler ────────────────────────────────────────────────────────
  // Atlanan kelimeler (isim öbeğini bölmez): belirteçler, sıfatlar, zarflar
  const STOP = new Set(('a an the this these those it its their his her my our your i we you he she they there be is are was were been being can could will would should may might must do does did has have had as so such than then also just only very more most much many any some each every all both about over under up down out new etc way ways thing things one own other others easy easily quick quickly fast automatic automatically auto automated smart better best free online digital modern powerful supported powered driven enabled integrated people person everyone anyone turkish turkey english language personalized personalised personal custom customized customised special various different specific general multiple single full complete comprehensive advanced basic simple intelligent efficient seamless instant beautiful whole able like based friendly user-friendly easy-to-use local daily real-time realtime short long large high low recent').split(' '));
  // Ayraçlar: isim öbeğini kapatır, edat bilgisini taşır
  const SEP = new Set('and or that which who whom whose to for from with via by into onto in on at of through using within without plus where when while if because'.split(' '));
  const PRON = new Set('them it these those this that'.split(' '));
  // Genel ürün kelimeleri: öbeği kapatır, kavram olmaz
  const GENERIC = new Set('app application apps tool tools platform system systems software service services solution solutions program product project feature features idea mvp startup helper manager management version thing stuff module kit suite engine framework utility'.split(' '));
  // Zayıf (tek başına seçici olmayan) isimler
  const WEAK = new Set('question solution record list file content user customer client portfolio order note document text message image photo item task report form account profile page post review analysis tracker tracking plan description detail information info data request process status update entry log'.split(' '));
  const TYPES = new Set('crm erp lms cms pos marketplace helpdesk scheduler tutor'.split(' '));
  // Kitle sayılan kurum/rol isimleri; -ist/-ian/-er/-or/-ant/-ent ekleri de rol sayılır
  const ORG = new Set('clinic club business company shop store restaurant salon barber school hospital hotel agency office studio gym farm team family parent kid child student community group organization nonprofit ngo startup firm practice center centre cafe bakery pharmacy library church association brand household couple patient athlete people'.split(' '));
  const NOT_ROLE = new Set('order folder reminder tracker planner container filter server browser player letter paper number counter timer scheduler poster sticker header footer computer printer water power answer register calendar summary event content client'.split(' '));
  const AUD_PH = new Set(['real estate', 'property management', 'small business', 'hoa management', 'tutoring center', 'wedding venue', 'salon', 'barber', 'dental', 'gym', 'pet']);
  const WEAK_AUD = new Set(['small business', ...'business company user people student team developer everyone customer beginner individual'.split(' ')]);
  // Fiiller: öbeği kapatır; bazıları kavrama "eylem ismi" ekler, bazıları kanal ipucu verir
  const VERBS = {};
  const vb = (forms, act = '', hint = '') => forms.split(' ').forEach((f) => { VERBS[f] = { act, hint }; });
  vb('make makes made making create creates created prepare prepares prepared help helps helped build builds built find finds get gets give gives send sends receive receives use uses used allow allows enable enables let lets provide provides handle handles process processes processed convert converts turn turns show shows display displays organize organizes organise organises keep keeps manage manages managed automate automates simplify simplifies streamline streamlines analyze analyzes analyse analyses check checks collect collects store stores save saves share shares connect connects integrate integrates support supports offer offers improve improves');
  vb('monitor monitors track tracks follow follows', 'tracking');
  vb('remind reminds', 'reminder');
  vb('notify notifies alert alerts', 'notification');
  vb('summarize summarizes summarise summarises', 'summary');
  vb('transcribe transcribes', 'transcription');
  vb('translate translates', 'translation');
  vb('respond responds reply replies answer answers', 'reply');
  vb('record records', 'recording');
  vb('book books schedule schedules', 'booking');
  vb('read reads scan scans parse parses extract extracts digitize digitizes recognize recognizes', '', 'ocr');
  vb('write writes draft drafts generate generates generated generating compose composes', '', 'ai');
  // Genel fiillerin çekimleri de öbek sınırıdır; alan isimleri elle eklenmez.
  for (const [w, v] of Object.entries(VERBS)) if (!v.act && !v.hint && !/(s|ed|ing)$/.test(w)) {
    VERBS[w + 'ing'] = v;
    VERBS[w.replace(/e$/, '') + 'ing'] = v;
    VERBS[w + (w.endsWith('e') ? 'd' : 'ed')] = v;
  }
  // İsim de olabilen fiiller yalnızca bu bağlamlardan sonra fiil sayılır
  const AMBIG = new Set('record records track tracks book books schedule schedules answer answers reply replies offer offers extract extracts scan scans support supports alert alerts use show display check store save share'.split(' '));
  const VERB_CTX = new Set('that which who to will can automatically also then'.split(' '));
  const DOCS = /^(invoice|receipt|document|pdf|bill|form|card|id card|contract|paper|statement|letter)$/;
  const BROAD = { appointment: 'scheduling', booking: 'scheduling', 'real estate': 'property', accounting: 'bookkeeping', invoice: 'billing', meeting: 'notes', 'spaced repetition': 'flashcard', exam: 'quiz', restaurant: 'menu', inventory: 'warehouse' };
  // Çok kelimeli kalıplar (çözümlemeden önce birleştirilir)
  const PHRASES = [
    [/\breal[ -]estate( agents?| agenc(y|ies)| brokers?| offices?)?\b|\brealtors?\b|\bestate agents?\b/g, 'real estate'],
    [/\bproperty (managers?|management)\b/g, 'property management'],
    [/\bsmall business(es)?\b|\bsmes?\b/g, 'small business'],
    [/\b(?:hoa|apartment|condo|condominium|residential complex) (?:managers?|management|administration)\b/g, 'hoa management'],
    [/\bmaintenance fees?\b/g, 'maintenance fee'],
    [/\btutoring cent(?:er|re)s?\b/g, 'tutoring center'],
    [/\bfootball pitch(?:es)?\b/g, 'football pitch'],
    [/\bwedding venues?\b/g, 'wedding venue'],
    [/\bschool bus(?:es)?\b/g, 'school bus'],
    [/\b(google )?chrome (extensions?|add-?ons?|plugins?)\b/g, 'chrome extension'],
    [/\b(browser|firefox|edge) (extensions?|add-?ons?|plugins?)\b/g, 'browser extension'],
    [/\bmobile (apps?|applications?)\b/g, 'mobile'],
    [/\bartificial intelligence\b|\bmachine learning\b|\bai[- ](powered|based|driven|supported|enabled|assisted)\b|\bllms?\b|\bgpt\b/g, 'ai'],
    [/\bspaced[- ]repetitions?\b/g, 'spaced repetition'],
    [/\be-?invoic(e|es|ing)\b/g, 'invoice'],
    [/\bcustomer (support|service)\b|\bhelp ?desk\b/g, 'helpdesk'],
    [/\bto-?do lists?\b/g, 'todo'],
    [/\bsocial media\b/g, 'social media'],
    [/\bspeech[- ]to[- ]text\b/g, 'transcription'],
    [/\btext[- ]to[- ]speech\b/g, 'tts'],
    [/\bjob (postings?|listings?|ads?|boards?)\b/g, 'job board'],
    [/\bpersonal financ(e|ial)\b/g, 'personal finance'],
    [/\bdental clinics?\b|\bdentists?\b/g, 'dental'],
    [/\bfitness (centers?|clubs?)\b|\bgyms?\b/g, 'gym'],
    [/\bhair ?(dresser|stylist|salon|cutter)s?\b|\bbeauty salons?\b|\bhairdressers?\b/g, 'salon'],
    [/\bbarber ?shops?\b|\bbarbers?\b/g, 'barber'],
    [/\b(question|problem) (solutions?|solving|solvers?)\b/g, 'question solving'],
    [/\b(exam|test) (prep|preparation)\b|\buniversity entrance exams?\b/g, 'exam'],
    [/\bpet owners?\b|\bpets?\b/g, 'pet'],
    [/\bonline stores?\b|\be-?commerce\b|\bonline shops?\b/g, 'ecommerce'],
    [/\bwhats ?app\b/g, 'whatsapp'],
  ];
  // Türkçe metne bakarak bilinen çeviri hatalarını düzelt
  const FIX = [
    [/müşavir/, /\bfinancial (advis[eo]rs?|consultants?)\b/g, 'accountants'],
    [/emlak/, /\bportfolios?\b/g, 'property portfolios'],
    [/teklif/, /\boffers?\b/g, 'proposals'],
  ];
  const LEMMA = { hairdresser: 'salon', stylist: 'salon', summarize: 'summary', summarization: 'summary', summarizer: 'summary', summaries: 'summary', transcribe: 'transcription', transcript: 'transcription', recording: 'recording', recorder: 'recording', scheduling: 'appointment', reservation: 'booking', accountant: 'accounting', bookkeeping: 'accounting', bookkeeper: 'accounting', invoicing: 'invoice', billing: 'invoice', realtor: 'real estate', attorney: 'lawyer', cv: 'resume', tutoring: 'tutor', flashcards: 'flashcard', chatbot: 'bot', assistant: 'bot', extension: 'browser extension', addon: 'browser extension', spreadsheet: 'excel', sheets: 'excel', iphone: 'ios', mail: 'email', e: '', repetition: 'spaced repetition', revision: 'spaced repetition', monitoring: 'tracking' };
  const SYN = {
    appointment: ['booking', 'scheduling', 'scheduler', 'calendar'], booking: ['appointment', 'reservation', 'scheduling'],
    salon: ['barber', 'hairdresser', 'beauty', 'barbershop', 'spa'], barber: ['salon', 'barbershop', 'hairdresser'],
    invoice: ['billing', 'invoicing', 'e-invoice', 'fatura'], receipt: ['expense', 'bill', 'fiş'],
    accounting: ['bookkeeping', 'ledger', 'accountant', 'erp', 'muhasebe'], restaurant: ['menu', 'food ordering', 'cafe'],
    'real estate': ['property', 'realestate', 'realtor', 'emlak', 'housing'], property: ['real estate', 'rental', 'housing'],
    listing: ['ilan'], lawyer: ['legal', 'law firm', 'attorney'], legal: ['lawyer', 'law'],
    student: ['study', 'learning', 'education'], exam: ['exam prep', 'quiz', 'test prep', 'question bank'], study: ['student', 'learning'],
    teacher: ['classroom', 'education', 'lms'], school: ['education', 'lms', 'classroom'], course: ['lms', 'e-learning'],
    inventory: ['stock', 'warehouse'], expense: ['budget', 'spending', 'personal finance'], budget: ['expense', 'personal finance', 'spending'],
    resume: ['cv', 'resume builder'], 'job board': ['job', 'recruiting', 'hiring'], job: ['job board', 'recruiting', 'hiring'],
    dental: ['dentist', 'clinic'], clinic: ['practice', 'healthcare', 'medical'], patient: ['healthcare', 'medical'], doctor: ['clinic', 'medical', 'healthcare'],
    gym: ['fitness', 'workout'], fitness: ['gym', 'workout'], diet: ['nutrition', 'meal', 'calorie'], nutrition: ['diet', 'meal', 'food'], recipe: ['cooking', 'meal'],
    dietitian: ['nutritionist', 'dietician', 'nutrition'], plan: ['planner', 'planning'], client: ['patient', 'customer'],
    meeting: ['transcription', 'notes', 'minutes', 'meet', 'zoom'], transcription: ['speech to text', 'whisper', 'transcribe', 'transcript'],
    summary: ['summarize', 'summarization', 'summarizer'], notes: ['note taking', 'notebook'], translation: ['translator', 'localization'],
    ecommerce: ['online store', 'shop', 'storefront'], order: ['ordering', 'checkout'], crm: ['customer relationship', 'leads', 'pipeline', 'contacts'],
    helpdesk: ['ticketing', 'customer support'], rent: ['rental', 'tenant', 'landlord'], 'property management': ['tenant', 'landlord', 'rental', 'hoa'],
    pet: ['veterinary', 'vet', 'dog', 'cat'], photo: ['image', 'picture'], voice: ['speech', 'audio'],
    'spaced repetition': ['flashcard', 'anki', 'srs', 'fsrs'], flashcard: ['spaced repetition', 'anki'],
    quiz: ['question bank', 'exam', 'practice'], question: ['quiz', 'question bank'], 'question solving': ['quiz', 'question bank', 'solver', 'practice'],
    tutor: ['tutoring', 'teaching', 'education'], recording: ['recorder', 'record'], reply: ['response', 'respond', 'responder', 'answer'],
    reminder: ['notification', 'alert'], tracking: ['tracker'], proposal: ['quote', 'estimate'], contract: ['agreement'],
    'hoa management': ['apartment management', 'condo management', 'homeowners association', 'hoa'],
    'maintenance fee': ['hoa dues', 'hoa fee', 'association dues', 'dues', 'aidat'],
    'tutoring center': ['tuition center', 'cram school', 'study center'], 'football pitch': ['soccer field', 'football field', 'futsal'],
    'wedding venue': ['wedding hall', 'banquet hall'], 'school bus': ['school transport', 'student transport'],
    stationery: ['stationery store', 'office supplies'], neighborhood: ['neighbourhood', 'local government'],
    hotel: ['booking', 'hospitality'], travel: ['trip', 'itinerary'], event: ['ticketing'], payroll: ['salary', 'hr'], hr: ['human resources', 'employee', 'payroll'],
    tax: ['taxes', 'accounting'], vocabulary: ['language learning', 'flashcard'], 'social media': ['instagram', 'scheduler'], survey: ['form', 'poll'],
    document: ['pdf', 'paperwork'], shipping: ['delivery', 'logistics', 'cargo'], delivery: ['shipping', 'courier'], warehouse: ['inventory', 'stock'],
  };
  // Kanal / biçim terimleri: blok sorgusu ve öncelik (küçük = daha belirleyici)
  const CHANNELS = {
    whatsapp: { p: 1, q: 'whatsapp api', tr: 'WhatsApp bağlantısı için', label: 'WhatsApp', syn: ['whatsapp-web', 'baileys'] },
    telegram: { p: 1, q: 'telegram bot', tr: 'Telegram botu için', label: 'Telegram' },
    discord: { p: 1, q: 'discord bot', tr: 'Discord botu için', label: 'Discord' },
    slack: { p: 1, q: 'slack bot', tr: 'Slack entegrasyonu için', label: 'Slack' },
    instagram: { p: 1, q: 'instagram api', tr: 'Instagram bağlantısı için', label: 'Instagram' },
    shopify: { p: 1, q: 'shopify app', tr: 'Shopify entegrasyonu için', label: 'Shopify' },
    wordpress: { p: 1, q: 'wordpress plugin boilerplate', tr: 'WordPress eklentisi için', label: 'WordPress' },
    notion: { p: 1, q: 'notion api', tr: 'Notion entegrasyonu için', label: 'Notion' },
    'chrome extension': { p: 2, q: 'extension framework', min: 1000, bw: ['chrome extension', 'browser extension', 'web extension', 'webextension'], tr: 'Chrome eklentisi iskeleti için', label: 'Chrome eklentisi', syn: ['browser extension', 'chrome'] },
    'browser extension': { p: 2, q: 'extension framework', min: 1000, bw: ['chrome extension', 'browser extension', 'web extension', 'webextension'], tr: 'Tarayıcı eklentisi iskeleti için', label: 'tarayıcı eklentisi', syn: ['chrome extension', 'chrome'] },
    ocr: { p: 3, pair: true, q: 'ocr', min: 1000, bw: ['ocr'], tr: 'Belge ve fiş okuma (OCR) için', label: 'belge okuma (OCR)', syn: ['parser', 'extraction', 'scanner'] },
    voice: { p: 3, pair: true, q: 'speech recognition', min: 1000, bw: ['speech', 'asr', 'whisper', 'voice'], tr: 'Ses tanıma için', label: 'ses', syn: ['speech', 'audio', 'whisper'] },
    excel: { p: 3, pair: true, q: 'spreadsheet library', min: 1000, bw: ['spreadsheet', 'excel', 'xlsx'], tr: 'Excel/tablo işlemleri için', label: 'Excel', syn: ['spreadsheet', 'xlsx'] },
    sms: { p: 3, q: 'sms gateway', tr: 'SMS gönderimi için', label: 'SMS' },
    email: { p: 4, q: 'email api', min: 1000, tr: 'E-posta gönderimi için', label: 'e-posta', syn: ['mail', 'gmail'] },
    mobile: { p: 4, q: 'react native starter', min: 1000, tr: 'Mobil uygulama iskeleti için', label: 'mobil', syn: ['android', 'ios', 'flutter', 'react native'] },
    ios: { p: 4, q: 'swiftui', min: 1000, tr: 'iOS uygulaması için', label: 'iOS', syn: ['iphone', 'swift'] },
    android: { p: 4, q: 'android jetpack compose', min: 1000, tr: 'Android uygulaması için', label: 'Android', syn: ['kotlin'] },
    cli: { p: 4, q: 'cli framework', min: 1000, tr: 'Komut satırı aracı için', label: 'komut satırı', syn: ['terminal', 'command line'] },
    dashboard: { p: 5, q: 'admin dashboard template', min: 1000, tr: 'Yönetim paneli için', label: 'panel', syn: ['admin'] },
    api: { p: 5, q: 'rest api boilerplate', min: 1000, tr: 'API iskeleti için', label: 'API', syn: ['rest', 'sdk'] },
    bot: { p: 6, q: 'chatbot framework', min: 1000, tr: 'Sohbet botu altyapısı için', label: 'bot', syn: ['chatbot', 'assistant', 'agent'] },
    website: { p: 7, label: 'web sitesi', syn: ['web'] },
    ai: { p: 8, pair: true, label: 'yapay zeka', syn: ['llm', 'gpt', 'openai', 'ml'] },
  };
  // Türkiye'ye özgü terimler: [desen, terim, eş anlamlılar, GitHub sorgusu (anlamlıysa), eklenecek İngilizce kavram]
  const LOCAL = [
    [/e[ -]?(?:fatura|arşiv|arsiv|irsaliye)|\bgib\b|gelir idaresi/, 'e-fatura', ['efatura', 'fatura', 'gib', 'earsiv', 'e-arsiv'], 'e-fatura'],
    [/e[ -]?defter/, 'e-defter', ['edefter', 'e-ledger'], 'edefter', 'accounting'],
    [/\byks\b|\btyt\b|\bayt\b|ösym/, 'yks', ['tyt', 'ayt', 'osym'], '', 'exam'],
    [/\blgs\b/, 'lgs', [], '', 'exam'], [/\bkpss\b/, 'kpss', [], '', 'exam'], [/\bkvkk\b/, 'kvkk', ['gdpr']],
    [/sahibinden/, 'sahibinden', ['emlak'], 'sahibinden'], [/trendyol/, 'trendyol', [], 'trendyol'], [/hepsiburada/, 'hepsiburada', [], 'hepsiburada'],
    [/iyzico/, 'iyzico', ['payment'], 'iyzico'], [/e-?devlet/, 'e-devlet', ['edevlet'], 'e-devlet'],
  ];
  // TR → EN anahtar kelimeler (çeviri çökerse yedek ve Türkçe etiketler için)
  const DICT = [
    ['mali müşavir', 'accountant'], ['muhasebeci', 'accountant'], ['muhasebe', 'accounting'], ['e-fatura', 'invoice'], ['fatura', 'invoice'],
    ['fiş', 'receipt'], ['makbuz', 'receipt'], ['vergi', 'tax'], ['bordro', 'payroll'], ['maaş', 'payroll'],
    ['kuaför', 'salon'], ['güzellik salonu', 'salon'], ['berber', 'barber'], ['randevu', 'appointment'], ['rezervasyon', 'booking'],
    ['emlak', 'real estate'], ['ilan', 'listing'], ['kiracı', 'tenant'], ['kira', 'rent'], ['site yönetimi', 'property management'], ['site yönetici', 'property management'], ['apartman', 'apartment'],
    ['avukat', 'lawyer'], ['hukuk', 'legal'], ['sözleşme', 'contract'], ['teklif', 'proposal'],
    ['öğrenci', 'student'], ['sınav', 'exam'], ['soru', 'question'], ['tekrar', 'repetition'], ['öğretmen', 'teacher'], ['okul', 'school'],
    ['kurs', 'course'], ['eğitim', 'education'], ['kelime', 'vocabulary'], ['ders', 'lesson'],
    ['restoran', 'restaurant'], ['kafe', 'cafe'], ['menü', 'menu'], ['sipariş', 'order'], ['stok', 'inventory'], ['depo', 'warehouse'],
    ['kargo', 'shipping'], ['teslimat', 'delivery'], ['e-ticaret', 'ecommerce'], ['mağaza', 'store'], ['ürün', 'product'],
    ['diyetisyen', 'dietitian'], ['diyet', 'diet'], ['beslenme', 'nutrition'], ['spor salonu', 'gym'], ['antrenman', 'workout'], ['tarif', 'recipe'], ['yemek', 'food'],
    ['bütçe', 'budget'], ['harcama', 'expense'], ['gider', 'expense'], ['özgeçmiş', 'resume'], ['iş ilanı', 'job board'], ['işe alım', 'recruiting'],
    ['insan kaynakları', 'hr'], ['personel', 'employee'], ['ev hayvanı', 'pet'], ['evcil', 'pet'], ['veteriner', 'veterinary'],
    ['toplantı', 'meeting'], ['özet', 'summary'], ['not', 'notes'], ['çeviri', 'translation'], ['tercüme', 'translation'], ['ses', 'voice'],
    ['video', 'video'], ['fotoğraf', 'photo'], ['görsel', 'image'], ['müşteri', 'customer'], ['danışan', 'client'], ['destek', 'support'],
    ['klinik', 'clinic'], ['diş', 'dental'], ['hasta', 'patient'], ['doktor', 'doctor'], ['hastane', 'hospital'], ['psikolog', 'therapy'],
    ['eklenti', 'extension'], ['mobil uygulama', 'mobile'], ['web sitesi', 'website'], ['sohbet botu', 'chatbot'], ['asistan', 'assistant'],
    ['yapay zeka', 'ai'], ['takvim', 'calendar'], ['hatırlatma', 'reminder'], ['bildirim', 'notification'], ['anket', 'survey'], ['belge', 'document'],
    ['evrak', 'document'], ['otel', 'hotel'], ['seyahat', 'travel'], ['tatil', 'travel'], ['etkinlik', 'event'], ['bilet', 'ticket'],
    ['düğün', 'wedding'], ['tarım', 'agriculture'], ['çiftçi', 'farmer'], ['sosyal medya', 'social media'], ['kayıt', 'record'],
    ['portföy', 'portfolio'], ['e-posta', 'email'], ['kitap', 'book'], ['müzik', 'music'], ['oyun', 'game'], ['aidat', 'dues'], ['duyuru', 'announcement'],
  ];
  const TR_LABEL = {
    salon: 'kuaför', barber: 'berber', appointment: 'randevu', booking: 'rezervasyon', invoice: 'fatura', receipt: 'fiş', accounting: 'muhasebe',
    accountant: 'mali müşavir', 'real estate': 'emlak', listing: 'ilan', crm: 'CRM', exam: 'sınav', 'spaced repetition': 'aralıklı tekrar',
    flashcard: 'bilgi kartı', 'question solving': 'soru çözümü', quiz: 'test', tutor: 'özel ders', transcription: 'deşifre',
    meeting: 'toplantı', summary: 'özet', recording: 'kayıt', property: 'mülk', helpdesk: 'müşteri desteği', 'e-fatura': 'e-fatura', yks: 'YKS',
    scheduling: 'planlama', reply: 'yanıt', tracking: 'takip', reminder: 'hatırlatma', 'property management': 'site/mülk yönetimi', 'small business': 'küçük işletme',
    'hoa management': 'site/apartman yönetimi', 'maintenance fee': 'aidat', 'tutoring center': 'dershane/etüt merkezi',
    'football pitch': 'halı saha', 'wedding venue': 'düğün salonu', 'school bus': 'okul servisi', stationery: 'kırtasiye', neighborhood: 'mahalle',
  };
  for (const [t, e] of DICT) if (!TR_LABEL[e] && !t.includes('-')) TR_LABEL[e] = t;
  for (const [k, c] of Object.entries(CHANNELS)) TR_LABEL[k] = c.label;
  const TR_STOP = new Set('ve ile için bir bu şu o da de mi ki çok daha en gibi olan olarak yapan eden alan veren yazan çıkaran yöneten işleyen hazırlayan otomatik destekli uygulaması uygulama araç aracı sistem sistemi platform platformu'.split(' '));

  // Yerel anlamı asıl Türkçe metinden sabitle; çevirideki yanlış arkadaşlar kavram olmasın.
  // Kök sonundaki [a-z]* Türkçe çekim eklerini kapsar; "servis" ve web "site" tek başına tetiklemez.
  const trFold = (s) => trLower(s).replace(/[çğıöşü]/g, (c) => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' }[c]));
  const TR_CONCEPTS = [
    { re: /\bapartman[a-z]*\b|\bsite[a-z]*\s+(?:yonet[a-z]*|sakin[a-z]*)\b/, t: 'hoa management', alternatives: ['apartment management', 'condo management', 'hoa management', 'property management'], en: /\b(?:(?:web\s*site|hoa|property|apartment|condominium|condo|residential complex)s?\s+(?:managers?|management|administrators?|administration)|apartments?|websites?|sites?)\b/g },
    { re: /\baidat[a-z]*\b/, t: 'maintenance fee', alternatives: ['maintenance fee', 'hoa dues'], en: /\b(?:membership fees?|subscription fees?|dues|maintenance fees?|fees?)\b/g },
    { re: /\besnaf[a-z]*\b/, t: 'small business', en: /\b(?:tradesm[ae]n|artisans?|craftsm[ae]n|shopkeepers?|merchants?|small businesses)\b/g },
    { re: /\bmuhtar[a-z]*\b/, t: 'neighborhood', en: /\b(?:(?:village|neighbou?rhood) (?:heads?|headm[ae]n|chiefs?)|headm[ae]n|mukhtars?|muhtars?)\b/g },
    { re: /\be[ -]?(?:fatura|arsiv)[a-z]*\b/, t: 'invoice', en: /\b(?:e[ -]?(?:invoices?|archives?)|electronic (?:invoices?|archives?)|archives?)\b/g },
    { re: /\be[ -]?defter[a-z]*\b/, t: 'accounting', en: /\b(?:e[ -]?(?:books?|ledgers?|notebooks?)|electronic (?:books?|ledgers?)|books?|ledgers?)\b/g },
    { re: /\bkargo[a-z]*\b/, t: 'shipping', en: /\b(?:cargo|freight|shipping)\b/g },
    { re: /\b(?:dershane|etut)[a-z]*\b/, t: 'tutoring center', en: /\b(?:classrooms?|cram schools?|private teaching institutions?|study cent(?:er|re)s?|etudes?|tutoring cent(?:er|re)s?)\b/g },
    { re: /\bkirtasiye[a-z]*\b/, t: 'stationery', en: /\b(?:stationary|stationery|stationers?|office supplies)\b/g },
    { re: /\bhali\s+saha[a-z]*\b/, t: 'football pitch', en: /\b(?:carpet (?:fields?|pitches?)|astroturf|astro turf|football pitches|soccer fields?)\b/g },
    { re: /\bdugun\s+salon[a-z]*\b/, t: 'wedding venue', en: /\b(?:wedding (?:salons?|halls?|venues?)|marriage halls?)\b/g },
    { re: /\bokul\s+servis[a-z]*\b/, t: 'school bus', en: /\b(?:school (?:services?|shuttles?|bus(?:es)?|transport(?:ation)?))\b/g },
    { re: /\bemlakci[a-z]*\b/, t: 'real estate', en: /\b(?:estate agents?|real estate agents?|realtors?)\b/g },
    { re: /\bmali\s+musavir[a-z]*\b/, t: 'accountant', en: /\b(?:(?:financial|fiscal) (?:advis[eo]rs?|consultants?)|accountants?)\b/g },
  ];
  const trConcepts = (tr) => {
    const source = trFold(tr);
    return TR_CONCEPTS.filter((c) => c.re.test(c.t === 'hoa management' ? source.replace(/\b(?:web|internet)\s+site[a-z]*/g, ' ') : source));
  };
  function conceptEnglish(en, tr, strict = false, inject = true) {
    let txt = String(en || '');
    if (strict) return txt; // Kullanıcının elle düzelttiği İngilizce metin önceliklidir.
    const found = trConcepts(tr);
    if (!found.length) return txt;
    txt = lower(txt);
    for (const c of found) {
      txt = txt.replace(c.en, (match) => c.t === 'accountant' && /s$/.test(match) ? 'accountants' : c.t);
      if (inject && !has(field(txt), c.t)) txt += ', ' + c.t;
    }
    // Aidat konut bağlamındaysa, tek başına belirsiz "site" çevirisine de yer bırakma.
    if (found.some((c) => c.t === 'maintenance fee') && /\bsite[a-z]*\b/.test(trFold(tr)) && !/\bweb\s+site/.test(trFold(tr))) {
      txt = txt.replace(/\b(?:websites?|sites?)(?:\s+(?:managers?|management|administrators?))?\b/g, 'hoa management');
    }
    return txt;
  }

  // Türkçe metinde sözlük eşleşmeleri (kelime başı öneki)
  function trHits(tr) {
    const t = ' ' + trLower(tr).replace(/[’'`´]/g, "'").replace(/[^a-zçğıöşü0-9'\s-]+/g, ' ').replace(/'\S*/g, '') + ' ';
    const out = [];
    for (const [k, en] of DICT) {
      const i = k.length >= 4 ? t.indexOf(' ' + k) : t.search(new RegExp(` ${k}(?:[ılieaüu]|ler|lar|leri|ları|de|da|li|lı)? `));
      if (i >= 0 && !out.some((o) => o.i <= i && o.end > i)) out.push({ en, i, end: i + k.length + 1 });
    }
    return out.sort((a, b) => a.i - b.i);
  }
  // Çeviri yoksa sözlükten kaba bir İngilizce metin üret (virgüller ayrı kavram yapar)
  function enFromDict(tr) {
    const brands = words(tr.replace(/[’'][a-zçğıöşü]+/gi, '')).filter((w) => CHANNELS[w] || LEMMA[w] || ['crm', 'erp', 'pdf', 'api', 'ai', 'chrome', 'yks', 'sms'].includes(w));
    return conceptEnglish(uniq([...trHits(tr).map((h) => h.en), ...brands]).join(', '), tr);
  }

  // ─── Fikri çözümle: kitle, nesne öbekleri, eylemler, kanallar ─────────
  const norm = (w) => { const a = LEMMA[w] ?? w; if (a.includes(' ')) return a; const s = singular(a); return LEMMA[s] ?? s; };
  const isRole = (raw, w) => {
    if (AUD_PH.has(w) || ORG.has(w)) return true;
    const r = singular(raw);
    return !NOT_ROLE.has(r) && !NOT_ROLE.has(w) && /(ist|ian|er|or|ant|ent|ee)$/.test(r) && r.length >= 5;
  };
  function parseIdea(en, trl = '', strict = false) {
    let txt = ' ' + lower(conceptEnglish(en, trl, strict)).replace(/[’`´]/g, "'") + ' ';
    if (!strict) for (const [cond, re, rep] of FIX) if (cond.test(trl)) txt = txt.replace(re, rep);
    // birleşik kalıplar; çoğul eşleşme "§" ile işaretlenir (kitle tespiti için)
    for (const [re, rep] of PHRASES) txt = txt.replace(re, (m) => ` ${rep.replace(/ /g, '_')}${/[^s]s\s*$/.test(m) ? '_§' : ''} `);
    const toks = txt.match(/[a-z0-9_§+#'-]+|[,.;:!?()/&]/g) || [];
    const nps = [], chans = [];
    let cur = [], prep = '', act = '', hint = '', npHint = '', prev = '';
    const close = (p) => {
      if (cur.length) {
        nps.push({ items: cur, prep, acts: act ? [act] : [], hint: npHint || hint, i: nps.length });
        act = ''; hint = '';
      }
      cur = []; npHint = '';
      if (p !== undefined) prep = p;
    };
    toks.forEach((tok, pos) => {
      if (/^[,.;:!?()/&]$/.test(tok)) { close(tok === '&' ? 'and' : ','); prev = tok; return; }
      let raw = tok.replace(/'s$|'$|^'/g, ''), pl = false;
      if (raw.endsWith('_§')) { raw = raw.slice(0, -2); pl = true; }
      const ph = raw.includes('_'), w0 = raw.replace(/_/g, ' ');
      if (!w0) return;
      if (SEP.has(w0)) { close(w0); prev = w0; return; }
      if (PRON.has(w0)) { if (!cur.length && act && nps.length) { nps[nps.length - 1].acts.push(act); act = ''; } prev = w0; return; }
      const v = VERBS[w0];
      if (v && (!AMBIG.has(w0) || VERB_CTX.has(prev) || GENERIC.has(prev) || CHANNELS[norm(prev)])) {
        close('');
        if (v.act) act = v.act;
        if (v.hint) hint = v.hint;
        prev = w0; return;
      }
      const w = ph ? w0 : norm(w0);
      if (!w || STOP.has(w0) || STOP.has(w) || /^\d+$/.test(w)) { prev = w0; return; }
      if (CHANNELS[w]) {
        chans.push({ t: w, pos });
        if (CHANNELS[w].pair) npHint = w; else close();
        prev = w0; return;
      }
      if (GENERIC.has(w)) { close(''); prev = w0; return; }
      cur.push({ w, raw: w0, pl: pl || (!ph && w0 !== singular(w0)), ph });
      prev = w0;
    });
    close();
    return { nps, chans };
  }

  // Kavram: eşleşme seçenekleri (eş anlamlı kombinasyonları) ve kısmi parçalar
  function mkConcept(t, toks, role, w, extra = {}) {
    const vars = toks.map((k) => {
      const v = [k, ...(SYN[k] || [])];
      if (role === 'aud' && /er$/.test(k) && k.length >= 7) v.push(k.slice(0, -1)); // freelancer → freelance
      return uniq(v).slice(0, 5);
    });
    const alts = [{ s: toks, w: 1 }];
    const combos = (i) => (i === vars.length ? [[]] : combos(i + 1).flatMap((rest) => vars[i].map((x) => [x, ...rest])));
    if (toks.length <= 3) for (const c of combos(0).slice(0, 24)) if (c.join('|') !== toks.join('|')) alts.push({ s: c, w: 0.7 });
    if (toks.length > 1) for (const s of SYN[t] || []) alts.push({ s: [s], w: 0.7 });
    const parts = toks.length > 1 ? toks.map((k, i) => ({ s: vars[i], w: WEAK.has(k) ? 0.1 : i === toks.length - 1 ? 0.25 : 0.35 })) : null;
    return { t, toks, role, w, alts, parts, syn: uniq(vars.flat().filter((x) => !toks.includes(x))), ...extra };
  }
  const spec = (np) => np.toks.reduce((s, k) => s + (k.includes(' ') ? 1 : WEAK.has(k) ? 0 : 0.35), 0) + (np.toks.length >= 2 ? 0.5 : 0) + (np.toks.some((k) => TYPES.has(k)) ? 1.2 : 0) + (np.hint ? 0.2 : 0) - np.i * 0.05;

  // ─── Plan (sezgisel) ──────────────────────────────────────────────────
  const qStr = (terms, extra) => [...terms, 'in:name,description,topics', extra].filter(Boolean).join(' ');
  // strict: kullanıcı terimleri elle düzenlediyse çeviri düzeltmeleri uygulanmaz (yerel terimler kalır)
  function planQueries(en, tr = '', strict = false) {
    const trl = trLower(tr);
    const { nps: phrases, chans } = parseIdea(en, trl, strict);
    const nps = [];
    const locals = LOCAL.filter(([re]) => re.test(trl) || re.test(trFold(tr)));
    const localT = new Set(locals.map((l) => l[1]));
    for (const n of phrases) {
      const toks = n.items.map((x) => x.w).filter((x) => !localT.has(x));
      const head = n.items[n.items.length - 1];
      const separateObject = phrases.some((o) => o !== n && o.items.length && !['for', 'by'].includes(o.prep));
      // 'for' kitleyi yapısal olarak tanımlar; zayıf nesne başları (orders, records…) hariç.
      n.aud = ['for', 'by'].includes(n.prep) && !!head && (
        isRole(head.raw, head.w) && (head.pl || AUD_PH.has(head.w) || ORG.has(head.w)) ||
        n.prep === 'for' && separateObject && !WEAK.has(head.w) && !NOT_ROLE.has(head.w)
      );
      if (n.aud || toks.length <= 2) nps.push({ ...n, toks: uniq(toks).slice(-2) });
      else for (let i = 0; i < toks.length - 1; i++) nps.push({ ...n, toks: uniq(toks.slice(i, i + 2)), acts: i === toks.length - 2 ? n.acts : [], i: n.i + i / toks.length });
    }
    const valid = nps.filter((n) => n.toks.length);
    const audNp = valid.find((n) => n.aud);
    const aud = audNp ? audNp.toks.join(' ') : '';
    const objs = valid.filter((n) => n !== audNp && n.toks.join(' ') !== aud);
    // en seçici nesne ana kavramdır
    const ranked = objs.slice().sort((a, b) => spec(b) - spec(a));
    const seenT = new Set();
    const C = [];
    const addC = (c) => { if (c && !seenT.has(c.t)) { seenT.add(c.t); C.push(c); } };
    const main = ranked[0];
    if (main) addC(mkConcept(main.toks.join(' '), main.toks, 'obj', 1, { core: true, main: true, hint: main.hint }));
    const weakAud = !aud || WEAK_AUD.has(aud) || WEAK_AUD.has(audNp.toks[audNp.toks.length - 1]);
    if (aud) addC(mkConcept(aud, audNp.toks, 'aud', weakAud ? 0.4 : 1, { core: !weakAud, bonus: weakAud, weak: weakAud }));
    // tek ve zayıf kelimelik nesneler (ör. "client") az ağırlık alır
    ranked.slice(1).forEach((n, i) => addC(mkConcept(n.toks.join(' '), n.toks, 'obj', n.toks.length === 1 && WEAK.has(n.toks[0]) ? 0.3 : i === 0 ? 0.6 : 0.4, { core: n.toks.length > 1 || !WEAK.has(n.toks[0]), bonus: i > 0, hint: n.hint })));
    // eylem kavramları: "danışan takibi", "yorum yanıtı", "toplantı özeti"
    for (const n of objs) for (const a of uniq(n.acts)) {
      const h = n.toks[n.toks.length - 1];
      if (h !== a) addC(mkConcept(`${h} ${a}`, [h, a], 'act', n === main ? 0.6 : 0.4, { bonus: n !== main, core: true, of: n.toks.join(' ') })); // ana nesnenin eylemi (ör. yorum yanıtı) işin özüdür
    }
    for (const [, t, syn, q, e] of locals) {
      addC(mkConcept(t, [t], 'loc', 0.8, { bonus: true, q: q || '', localSyn: syn }));
      const lc = C[C.length - 1];
      if (lc && lc.t === t) lc.alts.push(...syn.map((s) => ({ s: [s], w: 0.7 })));
      if (e) addC(mkConcept(e, [e], 'obj', 0.4, { bonus: true }));
    }
    // kanallar: belirleyici olan önce; biçim kanalı (OCR, YZ) ilgili nesneye bağlanır
    const chs = uniq(chans.map((c) => c.t)).sort((a, b) => CHANNELS[a].p - CHANNELS[b].p);
    for (const n of objs) if (n.hint === 'ocr' && !n.toks.some((k) => DOCS.test(k))) n.hint = '';
    for (const n of objs) if (n.hint && !chs.includes(n.hint)) chs.push(n.hint);
    const channel = chs.slice(0, 3).map((t) => ({ t, syn: CHANNELS[t].syn || [] }));
    const primary = channel.find((c) => c.t !== 'ai') || channel[0];
    if (primary) addC(mkConcept(primary.t, [primary.t], 'ch', CHANNELS[primary.t].pair ? 0.8 : 0.5, {}));
    // aynı kelime iki kavramı birden saymasın
    // (ör. diyetisyen ≈ beslenme olursa her beslenme projesi kitleyi de karşılamış sayılırdı)
    for (const c of C) c.alts = c.alts.filter((a, i) => i === 0 || !a.s.some((x) => !c.toks.includes(x) && C.some((o) => o !== c && o.role !== 'act' && (o.t === x || o.toks.includes(x)))));
    // Sorgu alternatifleri aynı aramada AND ile yığılmaz; ayrı açılarda kullanılır.
    const localAlts = !strict ? trConcepts(tr).filter((c) => c.alternatives) : [];
    for (const c of C) {
      const alternatives = (t) => localAlts.find((l) => l.t === t)?.alternatives || [t];
      if (c.toks.some((t) => alternatives(t).length > 1)) {
        c.headAlts = alternatives(c.toks[0]);
        const n = Math.max(...c.toks.map((t) => alternatives(t).length));
        c.queryAlts = Array.from({ length: n }, (_, i) => c.toks.map((t) => alternatives(t)[i] || alternatives(t)[0]).join(' '));
        for (const t of c.queryAlts) if (!c.alts.some((a) => a.s.join(' ') === t)) c.alts.push({ s: [t], w: 0.7 });
      }
    }
    return buildPlan(C, channel, objs.find((n) => n.hint && CHANNELS[n.hint]?.pair) || null);
  }
  // Kavramlardan sorgu kümesi üret (sıra = öncelik; "late" sorgular PRF'den sonra koşar)
  function buildPlan(C, channel, hinted) {
    const main = C.find((c) => c.main) || C.find((c) => c.role === 'obj') || C.find((c) => c.role === 'act');
    const aud = C.find((c) => c.role === 'aud');
    const audStrong = aud && !aud.weak;
    const obj2 = C.find((c) => c.role === 'obj' && c !== main && !c.bonus) || C.find((c) => c.role === 'obj' && c !== main);
    const ACT_P = ['summary', 'transcription', 'reply', 'reminder', 'translation', 'notification', 'tracking', 'booking', 'recording'];
    const mainAct = C.filter((c) => c.role === 'act' && main && c.of === main.t).sort((a, b) => ACT_P.indexOf(a.toks[1]) - ACT_P.indexOf(b.toks[1]))[0];
    const local = C.find((c) => c.role === 'loc' && c.q);
    const ch = channel.find((c) => CHANNELS[c.t]?.q && CHANNELS[c.t].p <= 2);
    const pair = channel.find((c) => CHANNELS[c.t]?.pair);
    const repoQ = [];
    const add = (terms, extra = '', sort = '', o = {}) => {
      terms = uniq(terms);
      if (!terms.length) return;
      const k = terms.slice().sort().join('|');
      if (repoQ.some((q) => q.terms.slice().sort().join('|') === k)) return;
      repoQ.push({ terms, extra, sort, ...o });
    };
    if (main && audStrong && aud.queryAlts?.length > 1) {
      add([aud.queryAlts[0], main.headAlts?.[0] || main.toks[0]], '', '', { early: true });
      add([aud.queryAlts[1]], '', '', { early: true });
      add([aud.queryAlts[2] || aud.t], '', 'stars', { late: true });
    } else if (main && main.queryAlts?.length > 1) {
      add([main.queryAlts[0], audStrong ? aud.t : ''], '', '', { early: true });
      add([main.queryAlts[1]], '', '', { early: true });
      add([main.headAlts[0]], '', 'stars', { late: true });
    } else if (main) {
      const mod = main.toks.length > 1 ? main.toks[0] : main.t;
      // 1) dar: güçlü kitle + ana nesne, yoksa ana nesne + ikinci ayrıntı (+ mesajlaşma/eklenti kanalı)
      const q1 = uniq(audStrong ? [aud.t, mod] : [main.t, mainAct ? mainAct.toks[1] : obj2 ? obj2.toks[0] : '']);
      add([...q1, ch ? ch.t : ''], '', '', { early: true });
      // 2) ikinci açı: biçim kanalı bağlı nesneyle ("invoice ocr"), yoksa ana öbek / eş anlamlı varyant
      const syn1 = main.syn.find((s) => !s.includes(' ') && !q1.includes(s) && !main.toks.some((k) => s.startsWith(stem(k)) || k.startsWith(stem(s))));
      if (pair && hinted) add([hinted.toks.join(' '), pair.t], 'stars:>=5', '', { early: true });
      else if (main.toks.length > 1 && !(q1.length === 1 && q1[0] === main.t)) add([main.t], 'stars:>=5', '', { early: true });
      else if (obj2 && main.toks.length === 1) add([main.t, obj2.toks[0]], 'stars:>=5', '', { early: true });
      else if (mainAct) add([main.toks[main.toks.length - 1], mainAct.toks[1]], 'stars:>=5', '', { early: true });
      else if (syn1) add([audStrong ? aud.t : main.t, syn1], 'stars:>=5', '', { early: true });
      if (local) add([local.q], '', '', { early: true });
      // 3) geniş ve kanıtlanmış: alanın bilinen büyük projeleri, kitlenin popüler araçları ya da çapraz kombinasyon
      const cands = [];
      if (audStrong) cands.push(BROAD[main.t] ? [main.t, BROAD[main.t]] : [aud.t]);
      if (obj2 && obj2.toks.length > 1) cands.push([obj2.toks[0], main.toks[main.toks.length - 1]]);
      if (obj2) cands.push([obj2.t]);
      cands.push([main.t, BROAD[main.t] || syn1 || '']);
      const k = (t) => uniq(t).slice().sort().join('|');
      const pick = cands.find((t) => uniq(t).length && !repoQ.some((q) => k(q.terms) === k(t)));
      if (pick) add(pick, BROAD[main.t] && pick.includes(BROAD[main.t]) ? 'stars:>=100' : 'stars:>=20', 'stars', { late: true });
    } else if (local) add([local.q], '', '', { early: true });
    repoQ.splice(3);
    const chB = channel.find((c) => CHANNELS[c.t]?.q);
    const block = chB ? { terms: [CHANNELS[chB.t].q], extra: `stars:>${CHANNELS[chB.t].min || 300}`, sort: 'stars', purpose_tr: CHANNELS[chB.t].tr, ch: chB.t } : null;
    const hnQ = main ? uniq([repoQ[0] ? repoQ[0].terms.filter((t) => !CHANNELS[t]).join(' ') : main.t, main.t]).slice(0, 2) : local ? [local.t] : [];
    const needQ = main ? [uniq([...main.toks, ...(audStrong ? aud.toks : obj2 ? obj2.toks : [])]).join(' ')] : local ? [local.t] : [];
    const terms = uniq([...C.filter((c) => c.role !== 'ch').map((c) => c.t), ...channel.map((c) => c.t)]).slice(0, 8);
    const domain = C.filter((c) => c.role !== 'ch');
    return {
      concepts: C, domain, channel, terms, repoQ, block, hnQ, needQ, smart: false, labels: {},
      broadQ: uniq([...(aud?.queryAlts || []).slice(1), ...(main?.queryAlts || []).slice(1), aud?.queryAlts?.[0] || aud?.t, main?.t]),
      queries: { repos: repoQ.map((q) => qStr(q.terms, q.extra)), blocks: block ? [`${block.terms[0]} ${block.extra}`] : [], hn: hnQ, needs: needQ },
    };
  }

  // ─── Eşleştirme ve sıralama ───────────────────────────────────────────
  const concepts = (plan) => [...(plan.concepts || []), ...(plan.extraC || []), ...(plan.prfC ? [plan.prfC] : [])];
  // Kavramın alanlarda geçme gücü: tam eşleşme (1 / eş anlamlı 0.7) × alan çarpanı, yoksa kısmi puan
  function hitIn(c, F) {
    let best = { h: 0, full: 0, where: -1, s: null };
    for (const a of c.alts) F.forEach((f, i) => {
      if (a.w * f.m > best.h && a.s.every((x) => has(f, x))) best = { h: a.w * f.m, full: a.w, where: i, s: a.s };
    });
    if (!best.full && c.parts) {
      let p = 0;
      for (const part of c.parts) p += Math.max(0, ...F.map((f) => (part.s.some((x) => has(f, x)) ? part.w * f.m : 0)));
      best.h = Math.min(0.6, p);
    }
    return best;
  }
  const repoFields = (repo) => {
    const name = String(repo.full_name || repo.name || '').split('/').pop();
    const topics = (repo.topics || []).join(' ');
    return [field(name, 1.5, true), field(topics, (repo.topics || []).length > 8 ? 0.8 : 1.2), field(repo.description || repo.desc || '', 1), field(`${name} ${topics} ${repo.description || repo.desc || ''}`, 0.9)];
  };
  function relevance(repo, cs) {
    const F = repoFields(repo);
    let raw = 0, max = 0;
    const hits = [];
    for (const c of cs) {
      const b = hitIn(c, F);
      raw += c.w * b.h;
      if (!c.bonus) max += c.w * 1.2;
      if (b.h) hits.push({ c, ...b });
    }
    // Adın vaat ettiği ana iş açıklama/etiketlerde doğrulanmıyorsa alaka sınırlıdır.
    const body = [F[2], field(`${(repo.topics || []).join(' ')} ${repo.description || repo.desc || ''}`, 0.9)];
    const main = cs.find((c) => c.main);
    const bodyMainOk = !main || hitIn(main, body).full >= 0.7;
    return { rel: Math.min(bodyMainOk ? 1 : 0.4, max ? raw / max : 0), hits, bodyMainOk };
  }
  const PERMISSIVE = /^(mit|mit-0|apache-2\.0|bsd-[23]-clause(-clear)?|0bsd|isc|unlicense|zlib|cc0-1\.0|bsl-1\.0|wtfpl|python-2\.0|postgresql|artistic-2\.0|ncsa|upl-1\.0)$/i;
  const COPYLEFT = /^(a?gpl|lgpl|mpl|epl|eupl|cddl|osl|cecill|cc-by-sa|odbl|sspl)/i;
  function licenseKind(spdx) {
    const s = String(spdx || '').trim();
    if (!s) return 'none';
    if (PERMISSIVE.test(s)) return 'permissive';
    if (COPYLEFT.test(s)) return 'copyleft';
    return 'other';
  }
  const fmtNum = (n) => n < 1000 ? String(n) : n < 1e4 ? (n / 1000).toFixed(1).replace('.', ',').replace(',0', '') + ' bin' : n < 1e6 ? Math.round(n / 1000) + ' bin' : (n / 1e6).toFixed(1).replace('.', ',').replace(',0', '') + ' milyon';
  function licenseReason(id, kind) {
    if (kind === 'permissive') return `${id} lisansı: ticari kullanım serbest`;
    if (kind === 'copyleft') return `${id.replace(/-(only|or-later)$/, '')}: kodunu açman gerekebilir`;
    if (kind === 'none') return 'Lisans belirtilmemiş: izinsiz kullanılamaz';
    return 'Lisansı özel: kullanmadan önce oku';
  }
  function freshReason(r) {
    if (r.archived) return 'Arşivlenmiş: artık geliştirilmiyor';
    const d = daysAgo(r.pushed_at ?? r.pushed), st = r.stargazers_count ?? r.stars ?? 0;
    const f = d <= 30 ? 'son 30 günde güncellendi' : d <= 365 ? 'son bir yılda güncellendi' : d === Infinity ? '' : `${Math.max(1, Math.floor(d / 365))} yıldır güncellenmiyor`;
    const s = st >= 50 ? `${fmtNum(st)} yıldız` : '';
    const out = [s, f].filter(Boolean).join(', ');
    return out ? out[0].toUpperCase() + out.slice(1) : '';
  }
  // Türkçe etiket: önce elle yazılmış sözlük, sonra makine çevirisi, yoksa İngilizce
  const trWord = (w, plan) => TR_LABEL[w] || plan?.labels?.[w] || '';
  const label = (c, plan) => TR_LABEL[c.t] || plan?.labels?.[c.t] || c.toks.map((k) => trWord(k, plan) || k).join(' ');
  function matchReason(hits, plan) {
    const shown = hits.filter((h) => h.full && !['s', 'prf'].includes(h.c.role));
    const inName = shown.filter((h) => h.where === 0);
    const ws = uniq(inName.map((h) => h.s.join(' '))).slice(0, 2).map((w) => {
      const tr = trWord(w, plan) || (inName.find((h) => h.s.join(' ') === w)?.c.t === w ? label(inName.find((h) => h.s.join(' ') === w).c, plan) : '');
      return tr && lower(tr) !== lower(w) ? `“${w}” (${tr})` : `“${w}”`;
    });
    const rest = uniq(shown.filter((h) => h.where > 0).map((h) => label(h.c, plan)));
    if (ws.length && rest.length) return `Adında ${ws.join(' ve ')} geçiyor; ${joinTr(rest)} konusunu da kapsıyor`;
    if (ws.length) return `Adında ${ws.join(' ve ')} geçiyor`;
    if (rest.length) return `Açıklaması ${joinTr(rest)} konu${rest.length > 1 ? 'larını' : 'sunu'} kapsıyor`;
    return '';
  }
  function quality(r) {
    const st = r.stargazers_count ?? r.stars ?? 0, d = daysAgo(r.pushed_at ?? r.pushed);
    const fresh = d <= 90 ? 1 : d <= 365 ? 0.6 : d <= 730 ? 0.3 : 0.1;
    const lic = { permissive: 1, copyleft: 0.6, other: 0.4, none: 0.2 }[licenseKind(r.license?.spdx_id ?? r.license?.id ?? r.license)];
    // yıldız (kanıtlanmışlık) en güçlü sinyal; tazelik ve lisans tek başına denemeyi öne çıkarmasın
    let q = Math.min(1, Math.log10(st + 1) / 4) * 0.55 + fresh * 0.2 + lic * 0.15 + (r.description || r.homepage ? 0.1 : 0);
    if (r.archived) q *= 0.3;
    return q;
  }
  // Noktalama/emoji oranı düşürmesin: yalnızca Unicode harflerini say, Türkçe de Latin'dir.
  function descriptionWarning(description) {
    const letters = stripHtml(description).match(/\p{L}/gu) || [];
    const foreign = letters.filter((c) => !/\p{Script=Latin}/u.test(c));
    if (!letters.length || foreign.length / letters.length <= 0.4) return '';
    const japanese = foreign.some((c) => /\p{Script=Hiragana}|\p{Script=Katakana}/u.test(c));
    const scripts = [
      [japanese ? /\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}/u : /\p{Script=Han}/u, japanese ? 'Japonca' : 'Çince'],
      [/\p{Script=Hangul}/u, 'Korece'], [/\p{Script=Cyrillic}/u, 'Kiril alfabesiyle'], [/\p{Script=Arabic}/u, 'Arap alfabesiyle'],
    ].map(([re, name]) => [foreign.filter((c) => re.test(c)).length, name]).sort((a, b) => b[0] - a[0]);
    const script = scripts[0][0] >= foreign.length / 2 ? scripts[0] : null;
    return 'Açıklaması ' + (script ? script[1] : 'çoğunlukla Latin dışı yazıyla') + '; kodu incelemesi zor olabilir';
  }
  const eligible = (x) => x.bodyMainOk !== false && !x.list && !x.archived && x.reviewOk !== false && (x.fit == null || x.fit >= 6);
  // En iyi temel: ana nesneyi gerçekten karşılayan ilk uygun proje; dizinin başına alınır
  function setBest(list, pick) {
    list.forEach((x) => { x.best = false; });
    const b = pick !== undefined ? (eligible(pick) && pick.mainOk !== false && pick.bestOk !== false ? pick : null) : list.find((x) => eligible(x) && x.mainOk !== false && x.bestOk !== false && (x.fit != null ? x.fit >= 7 : x.score >= 0.55));
    if (b) { b.best = true; list.splice(list.indexOf(b), 1); list.unshift(b); }
    return list;
  }
  function rankRepos(repos, plan, limit = 8) {
    const cs = concepts(plan), seen = new Set(), out = [];
    const core = cs.filter((c) => c.core), main = cs.find((c) => c.main);
    for (const r of repos || []) {
      const name = r.full_name || r.name;
      if (!name || seen.has(lower(name))) continue;
      seen.add(lower(name));
      const stars = r.stargazers_count ?? r.stars ?? 0;
      if (r.fork && stars < 50) continue;
      const url = safeUrl(r.html_url || r.url || `https://github.com/${name}`);
      if (!url) continue;
      const { rel, hits, bodyMainOk } = relevance(r, cs);
      const full = (c) => hits.some((h) => h.c === c && h.full >= 0.7);
      // tek bir genel kelimeyle (ör. yalnızca "nutrition") eşleşen projeler elenir
      if (!hits.some((h) => h.full && h.c.role !== 'ch')) continue;
      const mainOk = main ? full(main) : true;
      // Geniş yerel kitle araması: açıklamadaki alan başka bir alternatifle adda
      // doğrulanıyorsa keşifte tut (condo adı + property management açıklaması gibi).
      const audience = cs.find((c) => c.role === 'aud' && c.queryAlts && full(c));
      const audDesc = audience && hitIn(audience, [field(r.description || r.desc || '')]);
      const namedAudience = audience && audDesc.full >= 0.7 && audience.queryAlts.some((t) => {
        const distinct = words(t).filter((w) => !GENERIC.has(w) && !words(audDesc.s.join(' ')).includes(w));
        return distinct.length && distinct.every((w) => has(repoFields(r)[0], w));
      });
      if (rel < 0.25 && !namedAudience && !(main && hits.some((h) => h.c === main && h.full && h.where === 0))) continue;
      const local = hits.some((h) => h.full && h.c.role === 'loc');
      const desc = r.description || r.desc || '';
      const nonLatin = descriptionWarning(desc);
      // README getirmiyoruz; boş açıklamada etiketleri bağımsız bir kanıt gibi kullanma.
      const readme = typeof r.readme === 'string' ? r.readme : '';
      const corroboration = [repoFields(r)[0], field(readme)];
      const topicsOnly = !desc.trim() && !cs.some((c) => c.role !== 'ch' && hitIn(c, corroboration).full);
      const reviewWarning = nonLatin || (topicsOnly ? 'Açıklama/README kanıtı yok; eşleşme yalnızca konu etiketlerinde' : '');
      const reviewOk = !reviewWarning;
      const q = quality(r);
      // az yıldızlı denemeler gerçek temelleri gölgelemesin
      let score = 0.55 * rel + 0.45 * q;
      if (stars < 5) score *= 0.75;
      else if (stars < 20) score *= 0.9;
      if (r.fork) score *= 0.85;
      if (nonLatin) score *= 0.45;
      else if (topicsOnly) score *= 0.65;
      if (!mainOk) score *= 0.8;
      if (mainOk && !bodyMainOk) score = Math.min(score * 0.4, 0.2);
      const list = /(^|[-_.])awesome([-_.]|$)/i.test(name.split('/').pop()) || /^(a )?(curated|awesome) list/i.test(r.description || '');
      if (list) score *= 0.8;
      const lid = r.license?.spdx_id ?? r.license?.id ?? (typeof r.license === 'string' ? r.license : '');
      const id = lid === 'NOASSERTION' ? '' : lid || '';
      const kind = lid === 'NOASSERTION' ? 'other' : licenseKind(id);
      const loc = cs.find((c) => c.role === 'loc');
      out.push({
        name, url, desc: clip(desc, 300), desc_tr: clip(desc, 300), stars, forks: r.forks_count ?? r.forks ?? 0,
        pushed: ts(r.pushed_at ?? r.pushed) || 0, created: ts(r.created_at ?? r.created) || 0, lang: r.language ?? r.lang ?? '',
        topics: (r.topics || []).slice(0, 8), license: { id, kind }, archived: !!r.archived, homepage: safeUrl(r.homepage) || '',
        score: Math.round(score * 1000) / 1000, rel: Math.round(rel * 100) / 100, best: false, mainOk, bodyMainOk, reviewOk, ...(reviewWarning ? { reviewWarning } : {}), bestOk: reviewOk && mainOk && bodyMainOk && (!main || main.toks.length > 1 || core.length <= 1 || cs.filter((c) => c.role !== 'ch' && full(c)).length >= 2),
        cov: core.filter(full).map((c) => label(c, plan)), miss: core.filter((c) => !full(c)).map((c) => label(c, plan)),
        ...(list ? { list: true } : {}), ...(local ? { local: true } : {}),
        why: [reviewWarning, list ? 'Derlenmiş liste: fork için değil, keşif için iyi' : local && loc ? `Türkiye’ye özgü: ${label(loc, plan)} ile çalışıyor` : matchReason(hits, plan), licenseReason(id || 'Bu', kind), freshReason(r)].filter(Boolean).slice(0, 3),
      });
    }
    out.sort((a, b) => b.score - a.score || b.stars - a.stars);
    // puanlar başa baş ise kanıtlanmış (çok daha fazla yıldızlı) proje öne geçer
    const alt = out[0] && out[0].stars < 50 ? out.slice(1, 4).find((x) => out[0].score - x.score <= 0.04 && x.stars >= 100 && x.stars >= out[0].stars * 5 && !x.list && x.mainOk) : null;
    if (alt) out.splice(out.indexOf(alt), 1), out.unshift(alt);
    const top = out.slice(0, limit);
    // Türkiye'ye özgü eşleşmeler (ör. GİB e-fatura kütüphaneleri) en az iki sırada yer alsın
    const locs = out.slice(limit).filter((x) => x.local && x.stars >= 10).slice(0, Math.max(0, 2 - top.filter((x) => x.local).length));
    if (locs.length && top.length >= locs.length) top.splice(top.length - locs.length, locs.length, ...locs);
    return setBest(top);
  }
  // Konu (topic) geri beslemesi: en az iki fikir kavramını karşılayan projelerde tekrar eden konular
  const TOPIC_STOP = new Set('javascript typescript python react reactjs nextjs next vue vuejs angular svelte django flask fastapi laravel php java kotlin swift flutter dart android ios nodejs node express html css tailwind tailwindcss docker mongodb mysql postgresql postgres sqlite firebase supabase hacktoberfest open-source opensource self-hosted selfhosted ai llm openai chatgpt gpt mcp machine-learning deep-learning api rest-api web webapp website app mobile saas dashboard fullstack full-stack mern golang go rust ruby rails csharp dotnet spring-boot bootstrap jquery electron chrome-extension portfolio project school-project university-project beginner tutorial'.split(' '));
  function pickTopic(items, plan) {
    const cs = concepts(plan).filter((c) => ['obj', 'aud', 'act'].includes(c.role));
    const main = cs.find((c) => c.main), aud = cs.find((c) => c.role === 'aud' && c.core);
    if (!main) return null;
    const tally = new Map(), seen = new Set();
    for (const r of items || []) {
      if (!r || seen.has(r.full_name)) continue;
      seen.add(r.full_name);
      const F = repoFields(r);
      const hit = cs.filter((c) => hitIn(c, F).full >= 0.7);
      if (!hit.includes(main) || hit.length < 2) continue;
      for (const t of r.topics || []) {
        if (TOPIC_STOP.has(t) || !/^[a-z0-9][a-z0-9-]{2,40}$/.test(t)) continue;
        const v = tally.get(t) || { all: 0 };
        v.all++;
        tally.set(t, v);
      }
    }
    const used = new Set(plan.repoQ.flatMap((q) => q.terms).map((t) => t.replace(/ /g, '-')));
    // "kendi" konusu: ana nesnenin ya da kitlenin seçici kelimelerini içeren konu (ör. meal-planner)
    const ownC = [main, aud].filter(Boolean);
    let best = null, bs = 0;
    for (const [t, v] of tally) {
      if (used.has(t)) continue; // zaten aranmış tek kelime yeni bilgi getirmez
      const f = field(t.replace(/-/g, ' '));
      const own = ownC.some((c) => c.alts.some((a) => a.s.every((x) => has(f, x)) || a.s.some((x) => !WEAK.has(x) && has(f, x))));
      if (v.all < 2) continue;
      const sc = v.all * (own ? 2 : 1) + (t.includes('-') ? 0.7 : 0);
      if (sc > bs) { best = t; bs = sc; }
    }
    return best;
  }

  // ─── İhtiyaç cümleleri ────────────────────────────────────────────────
  const THING = '(app|apps|tool|service|software|solution|way|product|alternative|library|platform|system|site|website|saas|startup|extension|plugin|bot)';
  // "I wish" yalnızca ürün/özellik dileğiyse; iyi dilekler ve sıradan "would pay" cümleleri elenir
  const WISH = String.raw`i wish(?=[^.!?\n]{0,90}\b(there (was|were|is|'s|existed)|someone|i could (find|buy|use|get|have)|i had (had )?(a|an|something|this|known)|(it|they|this|that|the app|the tool|my \w+|our \w+) (had|supported|would|could|offered|let|did|was)|more \w+ (were|had|supported|offered|would|used)|(\w+ ){1,3}(was|were) (more|less|better|faster|cheaper|easier|accurate)|(an?|any|some) ([\w-]+ ){0,3}(app|tool|service|software|feature|product|platform|website|extension|option|way))\b)`;
  const NEED_RE = new RegExp(String.raw`\b(${WISH}|(i'd|i would|we'd|we would|people would|they'd|users would|many would|would) (happily |gladly |definitely |easily |totally )?pay (for (it|this|that|something|such|one of these|an? ([\w-]+ ){0,3}(tool|service|product|solution|app|software|platform|system|bot))|good money|real money|\$\d|a premium|a subscription|monthly)|looking for (a|an|some) ([\w-]+ ){0,4}${THING}\b|is there (a|an|any) ([\w-]+ ){0,4}${THING}\b|someone should (build|make)|why (isn't|is there no))`, 'i');
  const JOB_RE = /\b(we'?re hiring|we are hiring|apply (here|at|now)|full[- ]time|onsite|remote ok|salary|visa sponsorship|join (our|us)|send (your|a) (cv|resume))\b/i;
  const THING_RE = /\b(app|tool|service|software|system|platform|website|saas|product)s?\b/i;
  // Metinde hangi kavramlar geçiyor (tam eşleşmeler)
  function conceptHits(text, plan) {
    const F = [field(String(text).replace(/screen real estate/gi, 'screen space'))];
    return concepts(plan).map((c) => ({ c, ...hitIn(c, F) })).filter((h) => h.full);
  }
  const textScore = (hs) => hs.reduce((s, h) => s + h.c.w * h.full, 0);
  function windowAround(text, idx) {
    const sents = [];
    const re = /[^\n]+?(?:[.!?]+(?=\s|$)|(?=\n)|$)\s*/g; // "www.site.com" içindeki nokta cümle bitirmez
    let m;
    while ((m = re.exec(text))) sents.push({ a: m.index, b: m.index + m[0].length });
    let k = sents.findIndex((x) => x.a <= idx && idx < x.b);
    if (k < 0) k = 0;
    let a = sents[k]?.a ?? 0, b = sents[k]?.b ?? text.length;
    if (b - a > 260) { a = Math.max(a, idx - 60); return (a > sents[k].a ? '…' : '') + clip(text.slice(a, a + 260), 260); }
    // alıntı odaklı kalsın: kısa cümleye bir sonraki, çok kısaysa bir önceki cümle eklenir
    if (b - a < 140 && sents[k + 1] && sents[k + 1].b - a <= 260) b = sents[k + 1].b;
    if (sents[k].b - sents[k].a < 80 && k > 0 && b - sents[k - 1].a <= 260) a = sents[k - 1].a;
    return text.slice(a, b).trim();
  }
  function extractNeeds(hnHits, plan) {
    const out = [], seen = new Set();
    for (const h of hnHits || []) {
      const text = stripHtml(h.comment_text || h.story_text || '');
      const m = NEED_RE.exec(text);
      if (!m || JOB_RE.test(text)) continue;
      const snip = windowAround(text, m.index);
      if (snip.length < 40) continue;
      // alan kavramı alıntının içinde olmalı: ya iki ayrı kavram, ya da ana kavramın kendisi + ürün sözcüğü
      const sh = conceptHits(snip, plan);
      const dom = sh.filter((x) => x.c.role !== 'ch');
      const direct = dom.some((x) => (x.c.core || x.c.main) && x.full === 1);
      if (!(dom.length >= 2 || (direct && (sh.length >= 2 || THING_RE.test(snip))))) continue;
      const rs = textScore(sh) + textScore(conceptHits(text, plan)) * 0.3;
      const date = ts(h.created_at);
      // eski yorumlar (5 yıldan eski) yalnızca çok güçlüyse kalır
      if (date && daysAgo(date) > 5 * 365 && textScore(sh) < 2.4) continue;
      const key = lower(snip).replace(/[^a-z]/g, '').slice(0, 60);
      const url = safeUrl(`https://news.ycombinator.com/item?id=${encodeURIComponent(h.objectID)}`);
      if (seen.has(key) || !h.objectID || !url) continue;
      seen.add(key);
      out.push({ text: snip, text_tr: snip, url, source: 'HN yorumu', date, votes: h.points || 0, rs });
    }
    out.sort((a, b) => b.rs - a.rs || b.date - a.date);
    return out.map(({ rs, ...n }) => n);
  }

  // ─── Karar ────────────────────────────────────────────────────────────
  function verdict(r) {
    const repos = r.repos || [], prods = (r.products || []).length;
    const relOf = (x) => x.rel ?? x.score ?? 0;
    const fresh = (x) => daysAgo(x.pushed) <= 365;
    const relevant = repos.filter((x) => relOf(x) >= 0.5 && x.mainOk !== false).length;
    const ghFail = (r.sources || []).some((s) => s.id === 'github' && !s.ok);
    const fork = repos.find((x) => eligible(x) && !(x.miss || []).length && x.mainOk !== false && relOf(x) >= 0.6 && x.stars >= 100 && x.license?.kind === 'permissive' && fresh(x));
    // kısmi temel: ana işi karşılayanlar içinde alaka ile kanıtlanmışlığı (yıldız) birlikte en iyi olan
    const pv = (x) => 0.5 * relOf(x) + 0.5 * Math.min(1, Math.log10((x.stars || 0) + 1) / 4);
    const part = !fork && repos.filter((x) => eligible(x) && x.mainOk !== false && (x.cov || []).length && (x.miss || []).length && relOf(x) >= 0.3 && x.stars >= 100 && fresh(x)).sort((a, b) => pv(b) - pv(a))[0];
    let kind, text, name = '';
    if (fork) { kind = 'fork'; name = fork.name; text = `Sıfırdan başlama: **${fork.name}** sağlam bir temel. Fork’layıp kendi ihtiyacına uyarla.`; }
    else if (part) { kind = 'build'; name = part.name; text = `Tam karşılığı yok ama parçaları var: **${part.name}** ${joinTr(part.cov)} için sağlam bir başlangıç; ${joinTr(part.miss)} kısmını kendin eklemelisin.`; }
    else if (prods >= 4 || relevant >= 5) { kind = 'crowded'; text = 'Bu alanda çok deneme var. Farkını tek cümleyle netleştirmeden başlama.'; }
    else if (ghFail && repos.length <= 2) { kind = 'build'; text = 'GitHub taraması yarım kaldı; örnekler eksik olabilir. Biraz sonra tekrar dene.'; }
    else if (relevant <= 2 && prods <= 1) { kind = 'gap'; text = (r.sources || []).some((s) => s.id === 'github' && s.total === 0) ? 'Bu terimlerle açık kaynak örnek bulamadık; terimleri “Düzenle” ile genişletmeyi dene. Az örnek olması bir fırsat da olabilir — önce talebi doğrula.' : 'Az örnek bulundu. Bu bir fırsat olabilir ama önce talebi doğrula.'; }
    else { kind = 'build'; text = 'Parçalar hazır, bütün yok: yapı taşlarını birleştirerek hızlı bir ilk sürüm çıkarabilirsin.'; }
    const n = (r.needs || []).length;
    if (n >= 2) text += ` İnsanların bunu istediğine dair ${n} işaret var.`;
    return { kind, text, ...(name ? { repo: name } : {}) };
  }

  // ─── Ağ ───────────────────────────────────────────────────────────────
  const abortErr = () => { const e = new Error('Araştırma iptal edildi'); e.name = 'AbortError'; return e; };
  const sleep = (ms, signal) => new Promise((ok, no) => {
    const t = setTimeout(ok, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); no(abortErr()); }, { once: true });
  });
  async function getJSON(ctx, url, init = {}, ttl = TTL_API, pick, before) {
    const key = url + (init.body ? '\n' + init.body : '');
    if (ctx.cache && ttl) {
      try { const c = ctx.cache.get(key); if (c && c.at && Date.now() - c.at < ttl && c.v != null) return { ok: true, status: 200, data: c.v, cached: true }; } catch {}
    }
    if (ctx.signal?.aborted) throw abortErr();
    if (before) await before();
    const ctrl = new AbortController();
    let late = false;
    const onAbort = () => ctrl.abort();
    ctx.signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => { late = true; ctrl.abort(); }, 12000);
    try {
      const res = await ctx.fetch(url, { ...init, signal: ctrl.signal });
      let data = null;
      try { data = await res.json(); } catch { if (ctx.signal?.aborted) throw abortErr(); }
      if (res.ok && data != null && pick) data = pick(data);
      if (res.ok && data != null && ctx.cache && ttl) try { ctx.cache.set(key, { at: Date.now(), v: data }); } catch {}
      return { ok: res.ok, status: res.status, data, headers: res.headers };
    } catch (e) {
      if (ctx.signal?.aborted || e?.name === 'AbortError' && !late) throw abortErr();
      throw err(late ? 'Zaman aşımı' : 'Bağlantı hatası');
    } finally {
      clearTimeout(timer);
      ctx.signal?.removeEventListener('abort', onAbort);
    }
  }
  // Kısılan istekler boş metin döndürür: önbelleğe alma, hata say
  const txValid = (d) => ((Array.isArray(d) ? d : [d]).some((r) => { const t = Array.isArray(r) ? r[0] : r; return typeof t === 'string' && t.trim(); }) ? d : null);
  // Toplu çeviri; dönen dizi girdiyle aynı uzunlukta (başarısız olanlar null)
  async function translate(ctx, texts, tl) {
    const out = texts.map(() => null);
    const parts = [];
    let cur = [], len = 0;
    texts.forEach((t, i) => {
      if (!t) return;
      if (cur.length && (len + t.length > 4500 || cur.length >= 40)) { parts.push(cur); cur = []; len = 0; }
      cur.push(i); len += t.length + 3;
    });
    if (cur.length) parts.push(cur);
    let src = '';
    for (const part of parts) {
      const r = await getJSON(ctx, TX_URL + tl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: part.map((i) => 'q=' + encodeURIComponent(texts[i].slice(0, 4500))).join('&') }, TTL_TX, txValid);
      if (!r.ok || r.data == null) throw err('Çeviri yanıtı alınamadı');
      const d = r.data;
      const rows = Array.isArray(d) ? (part.length === 1 && d.length && !Array.isArray(d[0]) ? [d] : d) : [d];
      rows.forEach((row, j) => {
        if (j >= part.length) return;
        const [t, s] = Array.isArray(row) ? row : [row, ''];
        if (typeof t === 'string' && t.trim()) out[part[j]] = decode(t);
        if (!src && typeof s === 'string') src = s;
      });
    }
    out.src = src;
    return out;
  }
  // Kavram adlarının Türkçesi (gerekçelerde "appointment (randevu)" için)
  async function termLabels(ctx, plan) {
    const list = uniq(concepts(plan).filter((c) => c.role !== 'ch').flatMap((c) => [c.t, ...c.toks])).filter((t) => !TR_LABEL[t]).slice(0, 24);
    if (!list.length) return {};
    const out = await translate(ctx, list, 'tr');
    const m = {};
    list.forEach((t, i) => { if (out[i] && lower(out[i]) !== lower(t)) m[t] = trLower(clip(out[i], 40)); });
    return m;
  }
  const slimRepos = (d) => (Array.isArray(d?.items) && d.items.every((r) => r && typeof r.full_name === 'string' && (r.topics == null || Array.isArray(r.topics))) ? { total: d.total_count || 0, items: d.items.map((r) => ({
    full_name: r.full_name, html_url: r.html_url, description: clip(r.description || '', 300), stargazers_count: r.stargazers_count || 0, forks_count: r.forks_count || 0,
    pushed_at: r.pushed_at, created_at: r.created_at, language: r.language || '', topics: (r.topics || []).slice(0, 10),
    license: r.license ? { spdx_id: r.license.spdx_id || '' } : null, archived: !!r.archived, fork: !!r.fork, homepage: r.homepage || '',
  })) } : null);
  const slimIssues = (d) => (Array.isArray(d?.items) && d.items.every((i) => i && typeof i.title === 'string') ? { items: d.items.map((i) => ({
    title: clip(i.title, 300), html_url: i.html_url, created_at: i.created_at, repository_url: i.repository_url, plus1: i.reactions?.['+1'] || 0, pr: !!i.pull_request,
  })) } : null);
  async function ghSearch(ctx, kind, q, sort, limit = ctx.gh.budget) {
    const g = ctx.gh;
    if (g.used >= limit) return null;
    if (g.stop) { g.err = g.err || { kind: 'rate', error: 'GitHub arama sınırına ulaşıldı', resetAt: g.resetAt }; return null; }
    g.used++;
    const url = `${GH}${kind}?q=${encodeURIComponent(q)}&per_page=${kind === 'issues' ? 20 : 30}${sort ? `&sort=${encodeURIComponent(sort)}${kind === 'issues' ? '&order=desc' : ''}` : ''}`;
    const headers = { Accept: 'application/vnd.github+json' };
    if (ctx.token) headers.Authorization = 'Bearer ' + ctx.token;
    let r;
    for (let k = 0; ; k++) {
      try {
        r = await getJSON(ctx, url, { headers }, TTL_API, kind === 'issues' ? slimIssues : slimRepos, async () => { if (g.net++) await sleep(k ? 600 : 150, ctx.signal); });
        break;
      } catch (e) {
        if (e.name === 'AbortError') throw e;
        // GitHub araması ara sıra yavaşlar: istekler için ayrılan hakkı yemeden bir kez daha dene
        if (k === 0 && g.used < limit) { g.used++; continue; }
        g.err = { kind: 'network', error: e.message };
        return null;
      }
    }
    g.calls.push(q);
    if (r.cached) return r.data;
    const hd = (k) => (r.headers && typeof r.headers.get === 'function' ? r.headers.get(k) : null);
    const reset = +hd('x-ratelimit-reset') ? +hd('x-ratelimit-reset') * 1000 : Date.now() + 60e3;
    if (r.status === 401) { g.stop = true; g.err = { kind: 'auth', error: 'GitHub token geçersiz' }; return null; }
    if (r.status === 403 || r.status === 429) { g.stop = true; g.err = { kind: 'rate', error: 'GitHub arama sınırına ulaşıldı', resetAt: reset }; return null; }
    if (hd('x-ratelimit-remaining') === '0') { g.stop = true; g.resetAt = reset; }
    if (!r.ok || !r.data) { g.err = g.err || { kind: 'network', error: `GitHub yanıt vermedi (${r.status || 'bozuk yanıt'})` }; return null; }
    return r.data;
  }
  async function hnSearch(ctx, params) {
    const url = HN + '?' + Object.entries(params).filter(([, v]) => v !== '' && v != null).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    const r = await getJSON(ctx, url, {}, TTL_API, (d) => (Array.isArray(d?.hits) ? { hits: d.hits.map((h) => ({
      objectID: h.objectID, title: clip(h.title || '', 200), url: h.url || '', points: h.points || 0, num_comments: h.num_comments || 0, created_at: h.created_at,
      comment_text: h.comment_text ? String(h.comment_text).slice(0, 1500) : '', _tags: (h._tags || []).filter((t) => t === 'show_hn' || t === 'story'),
    })) } : null));
    if (!r.ok || !r.data) throw err('HN yanıtı alınamadı', r.status === 429 ? 'rate' : 'network');
    return r.data.hits;
  }

  // ─── Claude (akıllı mod) ──────────────────────────────────────────────
  function parseLoose(text, open) {
    const s = String(text || '');
    const close = open === '{' ? '}' : ']';
    for (let i = s.indexOf(open); i >= 0; i = s.indexOf(open, i + 1)) {
      let depth = 0, str = false, esc = false;
      for (let j = i; j < s.length; j++) {
        const ch = s[j];
        if (str) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') str = false; continue; }
        if (ch === '"') str = true;
        else if (ch === '{' || ch === '[') depth++;
        else if (ch === '}' || ch === ']') { if (--depth === 0) { if (ch !== close) break; try { return JSON.parse(s.slice(i, j + 1)); } catch { break; } } }
      }
    }
    return null;
  }
  async function claude(ctx, model, system, content, maxTokens) {
    const r = await getJSON(ctx, CLAUDE, {
      method: 'POST',
      headers: { 'x-api-key': ctx.claudeKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content }] }),
    }, 0);
    if (r.status === 401 || r.status === 403) throw err('Claude anahtarı geçersiz', 'auth');
    if (r.status === 429 || r.status === 529) throw err('Claude şu an yoğun', 'rate');
    if (!r.ok) throw err('Claude yanıt vermedi');
    if (r.data?.stop_reason === 'max_tokens') throw err('Claude yanıtı yarıda kesildi');
    const t = r.data?.content?.find?.((c) => c.type === 'text')?.text ?? r.data?.content?.[0]?.text;
    if (typeof t !== 'string') throw err('Claude yanıtı boş');
    return t;
  }
  const PLAN_SYS = 'You turn a product idea (usually Turkish) into search queries for finding open-source projects on GitHub and discussions on Hacker News. Reply with ONLY a JSON object, no prose: {"summary_tr": "one Turkish sentence restating the idea: who it is for and what it does", "repo_queries": [up to 3], "block_queries": [up to 2], "hn_queries": [up to 2], "need_terms": [up to 3]}. Every query is 2-4 lowercase English words, no quotes, no GitHub qualifiers. repo_queries: projects a builder could fork, most specific first, then broader (e.g. "salon booking whatsapp", "appointment scheduling"). block_queries: popular libraries for the channel or integration part (e.g. "whatsapp bot", "receipt ocr"). hn_queries: similar launched products. need_terms: 1-2 word topics to find user wishes and complaints.';
  const cleanQ = (s) => lower(s).replace(/\b(stars|in|language|is|sort|topic|topics|user|org|repo|archived|license|pushed|created|fork):\S*/g, ' ').replace(/[^a-z0-9 +#.-]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 4).join(' ');
  function validPlan(j) {
    if (!j || typeof j !== 'object' || Array.isArray(j)) return null;
    const arr = (a, n) => uniq((Array.isArray(a) ? a : []).filter((x) => typeof x === 'string').map(cleanQ).filter((x) => x.length >= 2)).slice(0, n);
    const p = { summary: typeof j.summary_tr === 'string' ? clip(j.summary_tr, 300) : null, repos: arr(j.repo_queries, 3), blocks: arr(j.block_queries, 2), hn: arr(j.hn_queries, 2), needs: arr(j.need_terms, 3) };
    return p.repos.length ? p : null;
  }
  // Claude sorgularını sezgisel planın üstüne giydir (sıralama kavramları korunur)
  function smartPlan(base, p, tr = '', strict = false) {
    const fix = (qs) => uniq(qs.map((q) => conceptEnglish(q, tr, strict, false)));
    p = { ...p, repos: fix(p.repos), hn: fix(p.hn), needs: fix(p.needs) };
    const plan = { ...base, smart: true };
    plan.repoQ = p.repos.map((q, i) => ({ terms: q.split(' '), extra: i === 0 ? '' : i === 1 ? 'stars:>=5' : 'stars:>=20', sort: i === 2 ? 'stars' : '', [i === 2 ? 'late' : 'early']: true }));
    const chB = base.block;
    plan.block = chB && p.blocks[0] ? { terms: [p.blocks[0]], extra: 'stars:>100', sort: 'stars', purpose_tr: chB.purpose_tr, ch: chB.ch } : chB;
    plan.hnQ = p.hn.length ? p.hn : base.hnQ;
    plan.needQ = p.needs.length ? [p.needs.slice(0, 2).join(' ')] : base.needQ;
    const known = new Set(concepts(base).flatMap((c) => [c.t, ...c.toks, ...c.syn]));
    const extra = uniq(p.repos.concat(p.blocks).flatMap((q) => q.split(' ')).map(singular).filter((w) => w.length > 2 && !STOP.has(w) && !GENERIC.has(w) && !known.has(w))).slice(0, 6);
    plan.extraC = extra.map((x) => mkConcept(x, [x], 's', 0.4, { bonus: true }));
    if (!base.concepts.some((c) => c.main)) {
      const toks = p.repos[0].split(' ').slice(0, 2).map(singular);
      plan.concepts = [mkConcept(toks.join(' '), toks, 'obj', 1, { core: true, main: true }), ...base.concepts];
      plan.domain = plan.concepts.filter((c) => c.role !== 'ch');
    }
    plan.terms = uniq([...base.terms, ...extra]).slice(0, 8);
    plan.queries = { repos: plan.repoQ.map((q) => qStr(q.terms, q.extra)), blocks: plan.block ? [`${plan.block.terms[0]} ${plan.block.extra}`] : [], hn: plan.hnQ, needs: plan.needQ };
    return plan;
  }
  const RANK_SYS = 'You judge how well open-source GitHub repositories fit as a starting point (to fork or learn from) for a product idea. Reply with ONLY a JSON array, no prose: [{"name": "owner/repo", "fit": 0-10, "why_tr": "Turkish, at most 12 words"}], one entry per repository given, names copied exactly. 10 = could fork and ship, 5 = useful parts, 0 = unrelated.';
  async function smartRank(ctx, R, pool) {
    const top = (pool && pool.length ? pool : R.repos).slice(0, 15);
    const list = top.map((r) => ({ name: r.name, desc: clip(r.desc, 160), topics: r.topics.slice(0, 6), stars: r.stars, license: r.license.id || 'none', pushed: r.pushed ? new Date(r.pushed).toISOString().slice(0, 10) : '' }));
    const t = await claude(ctx, MODELS.rank, RANK_SYS, `Fikir: ${R.idea}\nEnglish: ${R.en}\n\nRepositories:\n${JSON.stringify(list)}`, 2000);
    const arr = parseLoose(t, '[');
    if (!Array.isArray(arr)) throw err('Claude sıralaması okunamadı');
    const names = new Map(top.map((r) => [lower(r.name), r]));
    const fit = new Map();
    // yalnızca gerçekten listede olan adlar kabul edilir
    for (const x of arr) if (x && typeof x.name === 'string' && names.has(lower(x.name.trim())) && Number.isFinite(+x.fit)) fit.set(lower(x.name.trim()), { fit: Math.max(0, Math.min(10, +x.fit)), why: typeof x.why_tr === 'string' ? clip(x.why_tr, 160) : '' });
    if (!fit.size) throw err('Claude listedeki projeleri eşleştiremedi');
    const f = (r) => fit.get(lower(r.name));
    const scored = top.filter(f).sort((a, b) => f(b).fit - f(a).fit || b.score - a.score);
    const unscored = top.filter((r) => !f(r)); // puanlanmayanlar sezgisel sırayla sonra gelir
    const good = scored.filter((r) => f(r).fit >= 4);
    const fallback = scored.filter((r) => f(r).fit < 4).slice(0, Math.max(0, 3 - good.length - unscored.length));
    const out = [...good, ...fallback, ...unscored];
    return out.slice(0, 8).map((r) => (f(r) ? { ...r, fit: f(r).fit, why: [r.reviewWarning, f(r).why, licenseReason(r.license.id || 'Bu', r.license.kind), freshReason({ ...r, pushed_at: r.pushed, stargazers_count: r.stars })].filter(Boolean).slice(0, 3) } : { ...r }));
  }

  // ─── Araştırma akışı ──────────────────────────────────────────────────
  function radarMatch(items, plan, idea) {
    const cs = concepts(plan).filter((c) => c.role !== 'ch' && c.role !== 's');
    const trw = uniq(trLower(idea).replace(/[’']\S*/g, '').split(/[^a-zçğıöşü0-9]+/).filter((w) => w.length >= 4 && !TR_STOP.has(w)).map((w) => w.slice(0, Math.max(4, w.length - 3))));
    const out = [];
    for (const it of items || []) {
      if (!it || !it.key) continue;
      const F = [field(`${it.title || ''} ${it.summary || ''}`)], tt = ' ' + trLower(`${it.title_tr || ''} ${it.summary_tr || ''}`).replace(/[^a-zçğıöşü0-9]+/g, ' ');
      const hits = new Set();
      for (const c of cs) { const h = hitIn(c, F); if (h.full) hits.add(c.t); else if (h.h >= 0.3) hits.add('~' + c.t); }
      trw.forEach((w) => { if (tt.includes(' ' + w)) hits.add('tr:' + w); });
      if (hits.size >= 2) out.push({ key: String(it.key), title_tr: clip(it.title_tr || it.title || '', 160), source: String(it.source || ''), date: ts(it.date), h: hits.size });
    }
    out.sort((a, b) => b.h - a.h || ts(b.date) - ts(a.date));
    return out.slice(0, 4).map(({ h, ...x }) => x);
  }
  const PRODUCT_RE = /\b(app|apps|tool|open[- ]source|alternative|launch(es|ed)?|introducing|built|assistant|platform|extension|plugin|api|library|self-hosted|saas|startup|raises|acquires)\b/i;
  const HN_PREFIX = /^(show|launch|ask|tell) hn\s*[:–—-]\s*/i;
  function productsFrom(hits, plan) {
    const cs = (plan.concepts || []).filter((c) => c.role !== 'ch'), out = [], seen = new Set();
    // Biçim sözcükleri birlikte bile alanı tanımlamaz: NBA "video clips" ≠ podcast klipleri.
    const form = new Set('video audio clip episode recording content media'.split(' '));
    for (const h of hits) {
      if (!h.title || seen.has(h.objectID)) continue;
      seen.add(h.objectID);
      const hn = safeUrl(`https://news.ycombinator.com/item?id=${encodeURIComponent(h.objectID)}`);
      const show = /^show hn/i.test(h.title) || (h._tags || []).includes('show_hn');
      const title = h.title.replace(HN_PREFIX, '').trim();
      // Show HN dışındaki hikâyeler yalnızca ürün/araç duyurusuysa
      if (!show && !/^launch hn/i.test(h.title) && !PRODUCT_RE.test(title) && !/^https:\/\/github\.com\//.test(h.url || '')) continue;
      const F = [field(title + ' ' + (h.url || '').replace(/^https?:\/\/(www\.)?/, '').replace(/[./-]/g, ' '))];
      const hs = cs.map((c) => {
        const b = hitIn(c, F);
        if (b.full) return { c, ...b };
        // "podcast episodes" kavramını "podcasts" da gösterebilir; bir öbek en fazla bir oy alır.
        const parts = (c.parts || []).map((p, i) => ({ ...p, t: c.toks[i] }))
          .filter((p) => !WEAK.has(p.t) && !GENERIC.has(p.t));
        const specific = parts.filter((p) => !form.has(p.t));
        for (const p of specific.length ? specific : parts) {
          const s = p.s.find((s) => has(F[0], s));
          if (s) return { c, h: 0.7, full: 0.7, s: [s], partial: true };
        }
        return null;
      }).filter(Boolean);
      // PRF/Claude ek sözcükleri ve aynı eşleşmeyi tekrar sayan örtüşen kavramlar kanıt değildir.
      const used = new Set();
      let independent = 0;
      for (const x of hs) {
        const keys = words(x.s.join(' ')).map(stem);
        if (keys.length && !keys.some((k) => used.has(k))) {
          independent++;
          keys.forEach((k) => used.add(k));
        }
      }
      const mainBigram = hs.some((x) => x.c.main && !x.partial && words(x.s.join(' ')).length >= 2 &&
        words(x.c.t).some((w) => !form.has(w) && !WEAK.has(w) && !GENERIC.has(w)));
      if (independent < 2 && !mainBigram) continue;
      out.push({ title: clip(title, 200), title_tr: clip(title, 200), url: safeUrl(h.url) || hn, hn, points: h.points || 0, comments: h.num_comments || 0, date: ts(h.created_at), kind: show ? 'Show HN' : 'HN', s: textScore(hs) });
    }
    out.sort((a, b) => b.s - a.s || b.points - a.points);
    return out.slice(0, 6).map(({ s, ...p }) => p);
  }
  const snapshot = (R) => JSON.parse(JSON.stringify(R));
  async function research(idea, opts = {}) {
    idea = String(idea || '').replace(/\s+/g, ' ').trim().slice(0, 600);
    if (!idea) throw new Error('Fikir boş');
    const signal = opts.signal;
    if (signal?.aborted) throw abortErr();
    const f = opts.fetch || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    const ctx = { fetch: f, signal, cache: opts.cache, token: opts.githubToken, claudeKey: opts.claudeKey, gh: { used: 0, net: 0, calls: [], budget: opts.githubToken ? 8 : GH_BUDGET } };
    const at = Date.now();
    const R = { v: 1, id: hash(idea + at), idea, en: '', at, smart: false, summary: null, terms: [], queries: { repos: [], blocks: [], hn: [], needs: [] },
      repos: [], blocks: [], products: [], radar: [], needs: [], verdict: null, stats: { repos: 0, products: 0, needs: 0 }, sources: [] };
    const src = (id, o) => { const i = R.sources.findIndex((s) => s.id === id); const v = { id, ...o }; if (i >= 0) R.sources[i] = v; else R.sources.push(v); };
    const emit = (stage) => { if (signal?.aborted) throw abortErr(); R.stats = { repos: R.repos.length, products: R.products.length, needs: R.needs.length }; try { opts.onUpdate?.(stage, snapshot(R)); } catch {} };
    const fail = (e) => { if (e?.name === 'AbortError' || signal?.aborted) throw abortErr(); return { error: e?.message || 'Hata', kind: e?.kind || 'network' }; };

    // 1) Çeviri
    const tr = idea;
    const enOpt = typeof opts.en === 'string' ? opts.en.replace(/\s+/g, ' ').trim().slice(0, 600) : '';
    if (enOpt) R.en = enOpt; // kullanıcı İngilizce terimleri düzenledi: çeviri atlanır
    else {
      try {
        const [t] = await translate(ctx, [idea], 'en');
        if (!t) throw err('Çeviri boş döndü');
        R.en = t;
        src('translate', { ok: true, n: 1 });
      } catch (e) {
        const er = fail(e);
        R.en = enFromDict(idea) || idea;
        src('translate', { ok: false, n: 0, ...er });
      }
    }
    if (!enOpt) R.en = conceptEnglish(R.en, tr);
    emit('translate');

    // 2) Plan
    let plan = planQueries(R.en, tr, !!enOpt);
    if (ctx.claudeKey) {
      try {
        const t = await claude(ctx, MODELS.plan, PLAN_SYS, `Fikir: ${idea}\nEnglish translation: ${R.en}`, 600);
        const p = validPlan(parseLoose(t, '{'));
        if (!p) throw err('Claude planı okunamadı');
        plan = smartPlan(plan, p, tr, !!enOpt);
        R.summary = p.summary;
        R.smart = true;
        src('claude', { ok: true, n: 1 });
      } catch (e) { src('claude', { ok: false, n: 0, ...fail(e) }); }
    }
    R.terms = plan.terms;
    R.queries = plan.queries;
    emit('plan');
    // kavram etiketlerinin Türkçesi GitHub aramasıyla paralel gelir
    const labelsP = termLabels(ctx, plan).catch((e) => { fail(e); return {}; });

    // 3) GitHub ve HN paralel
    let issues = [], pool = [];
    const ghTask = (async () => {
      const g = ctx.gh, raw = [];
      let feedback = null;
      // Issues için 1 hak; yalnızca kanal varsa yapı taşı için de 1 hak ayır.
      const repoLimit = () => Math.min(plan.block ? 3 : 4, g.budget - 1 - (plan.block ? 1 : 0));
      const room = () => !g.stop && repoLimit() - g.used > 0;
      const searched = new Set(), actualQueries = [];
      let totalHits = 0;
      const relevantCount = () => rankRepos(raw, plan, 30).filter((r) => r.mainOk && r.rel >= 0.5).length;
      const key = (terms) => terms.slice().sort().join('|');
      const searchRepo = async (q) => {
        if (!room() || searched.has(key(q.terms))) return null;
        // Az ilgili örnek varsa sonraki sorgular yıldız eşiği yüzünden örnekleri kaybetmesin.
        const extra = searched.size && relevantCount() < 3 ? (q.extra || '').replace(/stars:\S+/g, '').trim() : q.extra;
        searched.add(key(q.terms));
        const query = qStr(q.terms, extra);
        actualQueries.push(query);
        const d = await ghSearch(ctx, 'repositories', query, q.sort, repoLimit());
        if (d) {
          totalHits += Math.max(d.total || 0, d.items.length);
          raw.push(...d.items);
          if (!feedback && d.items.length) feedback = d.items;
        }
        return d;
      };
      const broaden = async (q) => {
        // Önce sıradaki alternatif ifade; yoksa ek sözcükleri at. Yıldız filtresi yok.
        const candidates = [...(plan.broadQ || []), ...(q ? [q.terms[0]] : [])].map((t) => [t]);
        const terms = candidates.find((t) => t[0] && !searched.has(key(t)));
        if (terms) return searchRepo({ terms, extra: '', sort: 'stars' });
        return null;
      };
      const early = plan.repoQ.filter((q) => !q.late), late = plan.repoQ.filter((q) => q.late);
      for (const q of early) {
        if (!room()) break;
        const d = await searchRepo(q);
        if (d && (d.items.length < 3 || relevantCount() < 3) && room()) await broaden(q);
      }
      // Seyrek sonuçlarda rafine topic araması yerine geniş terimlere bütçe bırak.
      const topic = room() && relevantCount() >= 3 ? pickTopic(feedback, plan) : null;
      if (topic) {
        plan.prfC = mkConcept(topic.replace(/-/g, ' '), topic.split('-'), 'prf', 0.3, { bonus: true });
        plan.prfC.alts.push({ s: [topic], w: 1 });
        const q = `topic:${topic} stars:>=3`;
        R.queries = { ...R.queries, repos: [...R.queries.repos, q] };
        R.terms = uniq([...R.terms, 'topic:' + topic]).slice(0, 9);
        const d = await ghSearch(ctx, 'repositories', q, 'stars', repoLimit());
        if (d) { totalHits += Math.max(d.total || 0, d.items.length); raw.push(...d.items); }
        actualQueries.push(q);
      }
      for (const q of late) {
        if (!room()) break;
        await searchRepo(q);
      }
      while (room() && relevantCount() < 3) {
        const used = g.used;
        await broaden();
        if (g.used === used) break;
      }
      R.queries = { ...R.queries, repos: actualQueries };
      plan.labels = await labelsP;
      pool = rankRepos(raw, plan, 15); // akıllı sıralama için geniş havuz (sonuca yazılmaz)
      R.repos = rankRepos(raw, plan);
      if (plan.block) {
        const d = await ghSearch(ctx, 'repositories', `${plan.block.terms[0]} ${plan.block.extra}`, 'stars', g.budget - 1);
        const bw = CHANNELS[plan.block.ch]?.bw || [plan.block.ch || plan.block.terms[0]];
        // kütüphane adında ya da etiketlerinde kanal geçmeli; listeler/klonlar elenir
        R.blocks = (d?.items || []).filter((r) => {
          const nm = String(r.full_name || '').split('/')[1] || '';
          const fld = field(`${nm} ${(r.topics || []).join(' ')}`, 1, false);
          fld.raw = lower(nm).replace(/[^a-z0-9]/g, '');
          return !r.archived && r.description && !/awesome|clone|interview|roadmap|tutorial/i.test(nm) && bw.some((w) => has(fld, w));
        }).filter((r) => !R.repos.some((x) => lower(x.name) === lower(r.full_name))).slice(0, 4).map((r) => {
          const id = r.license?.spdx_id === 'NOASSERTION' ? '' : r.license?.spdx_id || '';
          return { name: r.full_name, url: safeUrl(r.html_url), desc: clip(r.description, 300), desc_tr: clip(r.description, 300), stars: r.stargazers_count, license: { id, kind: r.license?.spdx_id === 'NOASSERTION' ? 'other' : licenseKind(id) }, purpose_tr: plan.block.purpose_tr };
        }).filter((b) => b.url);
      }
      // İstekler: ana işi karşılayan önde gelen projelerin en çok 👍 alan açık konuları, yoksa terim araması
      const lead = R.repos.filter((x) => x.stars >= 100 && !x.archived && x.mainOk).slice(0, 3).map((x) => x.name);
      const iq = lead.length ? `${lead.map((n) => 'repo:' + n).join(' ')} is:issue is:open` : plan.needQ[0] ? `${plan.needQ[0]} is:issue is:open` : '';
      if (iq) {
        const d = await ghSearch(ctx, 'issues', iq, 'reactions-+1');
        const FEAT = /\b(feature|request|support|add|allow|integrat|option|ability|would be (nice|great))/i;
        // yalnızca fikirle ilgili konular (alan kavramı başlıkta geçmeli); özellik istekleri öne
        issues = (d?.items || []).filter((i) => !i.pr && i.plus1 >= 3).map((i) => ({ i, hs: conceptHits(i.title, plan).filter((x) => !['s', 'ch', 'prf'].includes(x.c.role)) }))
          .filter((x) => x.hs.length).sort((a, b) => (b.hs.length + (FEAT.test(b.i.title) ? 0.5 : 0)) - (a.hs.length + (FEAT.test(a.i.title) ? 0.5 : 0)) || b.i.plus1 - a.i.plus1)
          .slice(0, 6).map(({ i }) => ({
            text: clip(i.title, 260), text_tr: clip(i.title, 260), url: safeUrl(i.html_url), source: 'GitHub isteği', date: ts(i.created_at), votes: i.plus1,
            where: String(i.repository_url || '').split('/repos/')[1] || '',
          })).filter((n) => n.url);
      }
      src('github', g.err ? { ok: false, total: totalHits, n: R.repos.length, error: g.err.error, kind: g.err.kind, ...(g.err.resetAt ? { resetAt: g.err.resetAt } : {}) } : { ok: true, total: totalHits, n: R.repos.length });
      emit('github');
    })();
    let hnErr = null, hnN = 0, hnAll = 0;
    const hnTask = (async () => {
      const opt = (q) => q.split(' ').slice(1).join(' ');
      const q0 = plan.hnQ[0] || '';
      const nq = plan.needQ[0] || q0;
      // ilk terim zorunlu, diğerleri ve eş anlamlılar isteğe bağlı (Algolia optionalWords)
      const nw = uniq([...nq.split(' '), ...concepts(plan).filter((c) => c.core).flatMap((c) => c.syn.slice(0, 2).filter((s) => !s.includes(' ')))]).slice(0, 7);
      const calls = [
        q0 && hnSearch(ctx, { tags: 'show_hn', query: q0, optionalWords: opt(q0), hitsPerPage: 15 }),
        plan.hnQ[1] && hnSearch(ctx, { tags: 'show_hn', query: plan.hnQ[1], optionalWords: opt(plan.hnQ[1]), hitsPerPage: 15 }),
        q0 && hnSearch(ctx, { tags: 'story', query: q0, numericFilters: 'points>15', hitsPerPage: 15 }),
        ...(nq ? ['I wish', 'would pay', 'looking for', 'is there a'].map((ph) => hnSearch(ctx, { tags: 'comment', query: `${nw.join(' ')} "${ph}"`, optionalWords: nw.slice(1).join(' '), hitsPerPage: 40 })) : []),
      ].filter(Boolean);
      const res = await Promise.allSettled(calls);
      if (signal?.aborted) throw abortErr();
      const nProd = (q0 ? 1 : 0) + (plan.hnQ[1] ? 1 : 0) + (q0 ? 1 : 0);
      const bad = res.find((x) => x.status === 'rejected');
      if (bad) { if (bad.reason?.name === 'AbortError') throw abortErr(); hnErr = { error: bad.reason?.message || 'HN hatası', kind: bad.reason?.kind || 'network' }; }
      const val = (i) => (res[i]?.status === 'fulfilled' ? res[i].value : []);
      const prodHits = [];
      for (let i = 0; i < nProd; i++) prodHits.push(...val(i));
      const cmt = [];
      for (let i = nProd; i < res.length; i++) cmt.push(...val(i));
      await ghTask.catch(() => {}); // etiketler ve PRF kavramı hazır olsun
      R.products = productsFrom(prodHits, plan);
      R.hnNeeds = extractNeeds(cmt, plan);
      hnN = res.filter((x) => x.status === 'fulfilled').length;
      hnAll = res.length;
    })();
    await Promise.all([ghTask, hnTask]);
    const hnNeeds = R.hnNeeds || [];
    delete R.hnNeeds;
    R.needs = [...hnNeeds.slice(0, 4), ...issues.slice(0, 3), ...hnNeeds.slice(4)].slice(0, 6);
    // kısmi HN hatası da görünür olsun (arayüz ok:false kaynakları gösterir)
    src('hn', hnErr && !hnN ? { ok: false, n: 0, ...hnErr } : hnErr ? { ok: false, partial: true, n: R.products.length + hnNeeds.length, ...hnErr, error: `${hnAll - hnN}/${hnAll} HN araması başarısız: ${hnErr.error}` } : { ok: true, n: R.products.length + hnNeeds.length });
    emit('hn');

    // 4) Akıllı sıralama, radar, karar
    if (ctx.claudeKey && R.repos.length >= 2) {
      try {
        R.repos = await smartRank(ctx, R, pool);
        R.smart = true;
        const prev = R.sources.find((s) => s.id === 'claude');
        src('claude', { ...prev, ok: prev?.ok !== false, n: (prev?.n || 0) + 1 });
      } catch (e) { src('claude', { ok: false, n: 0, ...fail(e) }); }
    }
    setBest(R.repos);
    R.radar = radarMatch(opts.localItems, plan, tr);
    R.verdict = verdict(R);
    // karar bir projeyi temel olarak öneriyorsa rozet de onda olsun ve en başa geçsin
    const fk = R.verdict.repo && R.repos.find((x) => x.name === R.verdict.repo);
    if (fk) setBest(R.repos, fk);
    emit('rank');

    // 5) Türkçeye toplu çeviri (HN ön ekleri zaten atıldı)
    const slots = [];
    R.repos.forEach((x) => x.desc && slots.push([x, 'desc', 'desc_tr']));
    R.blocks.forEach((x) => x.desc && slots.push([x, 'desc', 'desc_tr']));
    R.products.forEach((x) => slots.push([x, 'title', 'title_tr']));
    R.needs.forEach((x) => slots.push([x, 'text', 'text_tr']));
    if (slots.length) {
      try {
        const out = await translate(ctx, slots.map(([o, k]) => o[k]), 'tr');
        slots.forEach(([o, , k], i) => { if (out[i]) o[k] = clip(out[i], 400); });
        const prev = R.sources.find((s) => s.id === 'translate');
        if (!prev) src('translate', { ok: true, n: out.filter(Boolean).length });
        else if (prev.ok) prev.n += out.filter(Boolean).length;
      } catch (e) {
        const er = fail(e);
        const prev = R.sources.find((s) => s.id === 'translate');
        if (!prev || prev.ok) src('translate', { ok: false, n: prev?.n || 0, ...er });
      }
    }
    R.stats = { repos: R.repos.length, products: R.products.length, needs: R.needs.length };
    emit('done');
    return R;
  }

  // ─── Çıktılar ─────────────────────────────────────────────────────────
  const dstr = (d) => { const t = ts(d); return t ? new Date(t).toISOString().slice(0, 10) : '?'; };
  const licTxt = (l) => (l?.kind === 'none' ? 'lisans yok' : l?.id || (l?.kind === 'other' ? 'özel lisans' : '?'));
  function buildPrompt(r) {
    const L = [];
    L.push('Bir ürün fikrim var ve açık kaynakta neler olduğunu araştırdım. Yalnızca aşağıdaki kanıtlara dayan; emin olmadığın yerde bunu söyle.', '');
    L.push(`## Fikir\n${r.idea}`);
    if (r.summary) L.push(`(Özet: ${r.summary})`);
    if (r.en && r.en !== r.idea) L.push(`(İngilizce: ${r.en})`);
    if (r.verdict) L.push('', `Ön değerlendirme: ${String(r.verdict.text).replace(/\*\*/g, '')}`);
    if (r.repos?.length) {
      L.push('', '## Başlangıç olabilecek açık kaynak projeler');
      r.repos.forEach((x, i) => L.push(`${i + 1}. ${x.name} — ${x.url}\n   ${x.desc_tr || x.desc || '(açıklama yok)'}\n   ⭐ ${x.stars} · lisans: ${licTxt(x.license)} · son güncelleme: ${dstr(x.pushed)}${x.archived ? ' · ARŞİVLENMİŞ' : ''}${(x.miss || []).length ? ` · eksik: ${x.miss.join(', ')}` : ''}`));
    }
    if (r.blocks?.length) {
      L.push('', '## Yapı taşları (kütüphaneler)');
      r.blocks.forEach((b) => L.push(`- ${b.name} — ${b.url} — ${b.purpose_tr || ''}: ${b.desc_tr || b.desc} (⭐ ${b.stars}, ${licTxt(b.license)})`));
    }
    if (r.products?.length) {
      L.push('', '## Benzer ürünler ve tartışmalar');
      r.products.forEach((p) => L.push(`- ${p.title_tr || p.title} (${p.kind}, ▲ ${p.points}, ${dstr(p.date)}) — ${p.url}${p.hn && p.hn !== p.url ? ` · tartışma: ${p.hn}` : ''}`));
    }
    if (r.radar?.length) {
      L.push('', '## Takip ettiğim haberlerden ilgili olanlar');
      r.radar.forEach((x) => L.push(`- ${x.title_tr} (${x.source})`));
    }
    if (r.needs?.length) {
      L.push('', '## İnsanların istekleri (gerçek alıntılar)');
      r.needs.forEach((n) => L.push(`- “${n.text_tr || n.text}”${n.text_tr && n.text_tr !== n.text ? ` (orijinal: “${n.text}”)` : ''} — ${n.source}${n.where ? ` · ${n.where}` : ''}${n.votes ? ` · ${n.votes} oy` : ''} — ${n.url}`));
    }
    L.push('', '## Senden istediklerim',
      '1. Fikri tek cümleyle netleştir: hedef kullanıcı kim, hangi işi çözüyor?',
      '2. Hangi repoyu ve kütüphaneleri temel almalıyım, neden? Lisans uyarılarını belirt.',
      '3. Mevcut çözümlerden farkım ne olmalı?',
      '4. 2 haftalık MVP planı çıkar: ekranlar, veri modeli, adım adım iş listesi.',
      '5. Talebi doğrulamak için bu hafta yapabileceğim 3 küçük deney öner.',
      '6. Riskleri say: KVKK, maliyet, dış servislere bağımlılık.',
      '', 'Yanıtı Türkçe ver. Yalnızca yukarıdaki kanıtlara dayan; emin olmadığın yerde bunu söyle.');
    return L.join('\n');
  }
  // Markdown bağlantısına giren URL: parantez/köşeli parantez/boşluk kodlanır (bağlantı enjeksiyonu olmasın)
  const mdUrl = (u) => safeUrl(u).replace(/[()[\]<>\s"'`]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));
  function toMarkdown(r) {
    const md = (s) => String(s || '').replace(/([\\`*_[\]<>()])/g, '\\$1').replace(/\s+/g, ' ').trim();
    const L = [`# Fikir Lab: ${md(r.idea)}`, '', `_${new Date(ts(r.at) || Date.now()).toLocaleDateString('tr-TR')} tarihli araştırma${r.smart ? ' · akıllı mod' : ''}_`, ''];
    if (r.summary) L.push(`> ${md(r.summary)}`, '');
    if (r.verdict) L.push(`**Sonuç:** ${String(r.verdict.text).replace(/[<>[\]()`]/g, '')}`, '');
    const s = r.stats || {};
    L.push(`${s.repos || 0} proje · ${s.products || 0} ürün · ${s.needs || 0} talep işareti`, '');
    if (r.terms?.length) L.push(`Aranan terimler: ${r.terms.map((t) => '`' + String(t).replace(/`/g, '') + '`').join(', ')}`, '');
    const link = (t, u) => (mdUrl(u) ? `[${md(t)}](${mdUrl(u)})` : md(t));
    if (r.repos?.length) {
      L.push('## Başlangıç noktaları', '');
      r.repos.forEach((x, i) => {
        L.push(`### ${i + 1}. ${link(x.name, x.url)}${x.best ? ' — En iyi temel' : ''}`, '', md(x.desc_tr || x.desc || 'Açıklama yok'), '',
          `⭐ ${x.stars} · ${md(licTxt(x.license))} · son güncelleme ${dstr(x.pushed)}${x.lang ? ' · ' + md(x.lang) : ''}`, '');
        (x.why || []).forEach((w) => L.push(`- ${md(w)}`));
        L.push('');
      });
    }
    if (r.blocks?.length) { L.push('## Yapı taşları', ''); r.blocks.forEach((b) => L.push(`- ${link(b.name, b.url)} — ${md(b.purpose_tr)}: ${md(b.desc_tr || b.desc)} (⭐ ${b.stars})`)); L.push(''); }
    if (r.products?.length) { L.push('## Benzer ürünler', ''); r.products.forEach((p) => L.push(`- ${link(p.title_tr || p.title, p.url)} — ${p.kind} · ▲ ${p.points} · ${dstr(p.date)}${p.hn && p.hn !== p.url && mdUrl(p.hn) ? ` · [tartışma](${mdUrl(p.hn)})` : ''}`)); L.push(''); }
    if (r.radar?.length) { L.push('## YZ Radar’dan', ''); r.radar.forEach((x) => L.push(`- ${md(x.title_tr)} (${md(x.source)})`)); L.push(''); }
    if (r.needs?.length) { L.push('## İnsanlar ne istiyor', ''); r.needs.forEach((n) => L.push(`> ${md(n.text_tr || n.text)}`, '>', `> — ${link(`${n.source}${n.where ? ' · ' + n.where : ''}`, n.url)}${n.votes ? ` · ${n.votes} oy` : ''} · ${dstr(n.date)}`, '')); }
    const bad = (r.sources || []).filter((x) => !x.ok || x.partial);
    if (bad.length) L.push('## Notlar', '', ...bad.map((x) => `- ${x.id}: ${md(x.error || 'başarısız')}`), '');
    return L.join('\n');
  }

  return { research, planQueries, rankRepos, licenseKind, extractNeeds, verdict, buildPrompt, toMarkdown, MODELS, _: { singular, stem, stripHtml, decode, safeUrl, trHits, enFromDict, parseLoose, validPlan, relevance, concepts, parseIdea, pickTopic, conceptHits, productsFrom, mdUrl } };
})();
if (typeof module !== 'undefined') module.exports = LabEngine; else window.LabEngine = LabEngine;
