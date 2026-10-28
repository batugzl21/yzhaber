# Eğitimde YZ Atlası

Küratörlü içerik `atlas/edu.json` dosyasında tutulur. Sunucu bu içeriği GitHub depo bilgileriyle zenginleştirip `public/data/edu-atlas.json` üretir. Üretilen dosyayı elle düzenlemeyin.

```powershell
node server.js --atlas
```

Bu komut Atlas'ı hemen yeniler ve çıkar; haber taraması veya HTTP sunucusu başlatmaz. İsteğe bağlı `GITHUB_TOKEN` ortam değişkeni GitHub isteklerinde kullanılır.

`node server.js --build` ve yerel sunucu başlangıcı, son başarılı derlemenin `builtAt` değeri 24 saatten eskiyse veya çıktı eksikse Atlas'ı derler. İçerik değişikliklerini hemen görmek için `--atlas` kullanın.

Depolar GitHub arama API'sine en fazla 240 karakterlik sorgularla, tekrarlar ayıklanarak gönderilir. Anahtarsız istekler arasında en az 6,5 saniye bırakılır. Başarılı aramada dönmeyen depolar çıktıdan çıkarılır; eksik yanıt veya ağ/API hatasında o sorgunun önceki depo bilgileri korunur. Hiçbir sorgu tamamlanamazsa son başarılı dosya korunur; önbellek de yoksa yeni çıktı üretilmez. Kısmi yenilemede `builtAt` ilerletilmez. Tamamlanan çıktı geçici dosyadan taşınarak yazılır.

Eğitim RSS kaynakları `sources.js` içinde `cat: 'edu'` olarak tanımlanır; Kaynak Rehberi karşılıkları `public/guide.js` içindedir. Genel eğitim yayınlarından yalnızca YZ içerikleri alınır. Diğer kaynakların eğitimle ilgili haberleri de `Eğitim` etiketi alır; salt “machine learning” ve “learning rate” ifadeleri bu etiketi tetiklemez.

Yeni RSS adreslerinin ve GitHub depolarının canlı doğrulamasını dağıtım öncesinde yapın.
