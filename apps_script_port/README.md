# Apps Script port — Ensar Mermer (MVP)

Bu klasör Apps Script için hızlı bir başlangıç scaffold'udur. Amaç: uygulamanın UI ve sunucu tarafını Apps Script HTML Service içinde çalıştırmak.

İçerik
- `Code.gs` — sunucu tarafı fonksiyonlar (listRecords / upsertRecord / deleteRecord) ve `doGet`/`doPost` API.
- `Index.html` — basit UI (form + liste) ve `client.js` ile iletişim.
- `client.js` — `google.script.run` kullanarak sunucu çağrılarını yapar.
- `styles.css` — temel stiller.
- `appsscript.json` — manifest.

Nasıl deploy edilir (hızlı):
1. https://script.google.com/ adresine gir, yeni bir Apps Script projesi oluştur.
2. `Code.gs` içeriğini yapıştır.
3. `Index.html` dosyasını oluştur (New > Html file) ve içeriği yapıştır.
4. `client.js` ve `styles.css` dosyalarını da aynı şekilde HTML içinde veya ayrı HTML dosyaları olarak ekleyebilirsin. (Biz `Index.html` içine CSS/JS linki koyduk; Apps Script ortamında bunları `<?!= include('client.js') ?>` gibi include ile de gömebilirsin.)
5. Publish > Deploy as web app (veya yeni arayüzde Deploy > New deployment) seç, "Execute the app as": Me (owner), "Who has access": Anyone (if you want public link) veya Organization.
6. Deploy edip açtığın URL, hem UI hem de API (GET?action=list, POST action=upsert) işlevlerini sağlar.

Notlar ve kısıtlar
- Bu MVP küçük veri setleri için `PropertiesService` kullanır; büyük miktarda veri için Google Sheet veya Drive tabanlı storage tercih edin.
- Güvenlik: deploy ayarlarınıza dikkat edin. "Anyone" erişimi verdiğinizde API anonim çağrılara açık olur.
- Geliştirme: daha sonra ID oluşturma/çakış, versiyon kontrolü, kullanıcı tabanlı veri gibi özellikler ekleyebiliriz.

Sonraki adımlar (isteğe bağlı)
- UI'yi mevcut `app.js` içindeki tüm ekranlara genişletme (birebir görsel eşleme).
- Veritabanını Google Sheets'e taşıma.
- Mevcut backup/yerel verileri Apps Script'e migrate etme (ben yardımcı olurum).

