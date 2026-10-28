# YZ Radar

Dünyadaki yapay zeka gelişmelerini tek ekranda toplayan kişisel haber radarı. 148 doğrulanmış kaynağı **saat başı** tarar ve haberleri **Türkçeye** (ya da seçtiğin 14 dilden birine) çevirir.

## Nasıl çalışır?

Site **GitHub üzerinde bulutta** çalışır:
- `.github/workflows/guncelle.yml` her saat kaynakları tarar, her haber için kısa bir özet çıkarır, çevirir ve siteyi GitHub Pages'e yayınlar.
- Bilgisayarının açık olmasına gerek yoktur. Siteyi telefondan da açabilirsin.
- Telefonda tarayıcı menüsündeki "Ana ekrana ekle" ile uygulama gibi kullanabilirsin.

Not: GitHub, 60 gün boyunca hiç commit gelmeyen depolarda zamanlanmış görevleri durdurur. Böyle olursa Actions sekmesinden tek tıkla yeniden açılır.

### Yerelde denemek (isteğe bağlı)
`baslat.bat` dosyasına çift tıkla ya da `node server.js` çalıştır, sonra http://localhost:4321 adresini aç. Node 18 veya üstü gerekir; ek paket yoktur.

## Kullanım

- **Gündem** sekmesi her kategoriden günün en önemli haberini ("Günün özeti") ve diğer haberleri gösterir.
- Bir habere tıklayınca **site içinde** bir sayfa açılır. Bu sayfada şunlar var:
  - Türkçe özet ve öne çıkan noktalar
  - Görsel veya video
  - Benzer haberler
  - O haberden uygulama fikri çıkaran bir prompt
- Kaynağa gitmek istersen "Kaynakta oku" düğmesi var. Site dışına giden her bağlantı önce onay ister.
- Sağ panelde **en iyi modeller** sıralaması (LMArena) ve **Fikir Laboratuvarı** yer alır.
- Sağ üstteki simgeler: kaydedilen haberler ve kaynak rehberi.

### Fikir Lab
Aklındaki uygulama fikrini Türkçe yaz, **Araştır**'a bas. Fikir Lab şunları getirir:
- **Başlangıç noktaları:** Fork'layabileceğin açık kaynak repolar. Her biri lisans, güncellik ve "neden önerdik" bilgisiyle gelir.
- **Yapı taşları:** WhatsApp, Chrome eklentisi, OCR gibi parçalar için hazır kütüphaneler.
- **Benzer ürünler:** Show HN'de çıkmış ürünler ve radarda geçen haberler.
- **İnsanlar ne istiyor:** HN yorumlarından ve en çok 👍 alan GitHub isteklerinden alıntılar.
- **Sonraki adım:** Tüm kanıtları içeren hazır bir Claude istemi. Araştırmayı kaydedebilir ya da Markdown olarak indirebilirsin.

Her şey tarayıcıda çalışır; sunucu ya da anahtar gerekmez. ⚙ ayarlarından isteğe bağlı olarak iki şey ekleyebilirsin:
- **Claude API anahtarı:** Akıllı modu açar. Bu modda sorguları ve sıralamayı Claude yapar.
- **GitHub token'ı:** Dakikada 10 aramalık sınırı artırır.

Anahtarlar yalnızca senin tarayıcında saklanır. Motor testleri: `node --test "test/*.test.js"`.

| Sekme | İçerik |
|---|---|
| Modeller | Laboratuvar duyuruları (OpenAI, Anthropic, DeepMind, Mistral, xAI…), OpenRouter'a gelen yeni API modelleri, Hugging Face'e yüklenen yeni açık modeller, Claude Code / Codex / Cursor sürümleri |
| Haberler | Reuters, The Information, Techmeme, TechCrunch, The Verge, Ars Technica, MIT Tech Review, IEEE Spectrum, The Guardian, TestingCatalog, Hacker News, Reddit |
| Uygulamalar | Product Hunt, Show HN, BetaList, GitHub Trending, yeni yükselen repolar, HF Spaces |
| Fikirler | Simon Willison, Ethan Mollick, Lenny's, Trends.vc, Starter Story, Ben's Bites, r/SideProject… |
| Öğren | Anthropic Engineering/Research, OpenAI Developers, The Batch, Raschka, Lilian Weng, Karpathy, HF Daily Papers… |
| Videolar | 20 Türkçe kanal (Avenox, Forn Yapay Zeka, Ozan Sihay…) ve 31 yabancı kanal (AI Search, Matt Wolfe, Fireship…) |
| Türkçe | Webrazzi, AA, LOG, Teknoblog, CHIP, DonanımHaber, Google Haberler TR… |

## Ayarlar

- Kaynak eklemek veya çıkarmak için `sources.js` dosyasını düzenle. Genel kaynaklarda `aiOnly: true` yalnızca yapay zeka içeriklerini alır.
- Detay özetleri `details.js` ile çıkarılır. Makalenin tamamı kopyalanmaz; kısa bir alıntı ve kaynağa bağlantı verilir.
- X (Twitter) doğrudan çekilmiyor, çünkü ücretsiz ve güvenilir bir yolu kalmadı. Takip listesi Kaynak Rehberi'nde.
