# Port Plan — Apps Script UI port (phase plan)

Amaç: mevcut uygulamanın görsel ve işlevsel olarak Apps Script HTML Service içinde çalışır hale getirilmesi (tam rewrite). Bu dosya aşama‑aşama yapılacak işleri, tahmini süreleri ve dikkat edilmesi gerekenleri özetler.

Özet adımlar (fazlar)

Phase A — Core CRUD (1–2 saat)
- İçerik: `makineler` (machines) ve temel `bloklar` listeleme + ekleme/düzenleme formu.
- Hedef: Kullanıcılar kayıt ekleyip düzenleyebilsin, liste görebilsin.
- Tesler: ekle, düzenle, sil, listele.

Phase B — Ek sekmeler & küçük bileşenler (2–4 saat)
- İçerik: istasyon ağacı (station tree), makine grupları, CSV export, iframe lazy-load parçaları.
- Hedef: Phase A'ya görsel uyum ve kalan küçük özellikler eklenecek.

Phase C — Blok Analiz alt sayfaları (4–8 saat)
- İçerik: `blok-genel`, `blok-uretim`, `blok-verimlilik`, `blok-maliyet`, `blok-manuel` gibi ekranlar.
- Not: `blok-manuel` iframe içeriyorsa iframe içeriğinin Apps Script'e taşınması veya dış link olarak bırakılması gerekebilir.

Phase D — Data migration & validation (var.
- Yedek varsa: backup doğrulama, `migrate_backup_to_remote.js` ile kayıtları yeni WebApp'e taşıma.
- Yedek yoksa: kullanıcıdan export alındıktan sonra migration.

Phase E — Optimize & deploy (1 saat)
- PropertiesService -> Google Sheet (isteğe bağlı, veri büyükse)
- Deploy, smoke tests, erişim ayarları.

Depolama önerisi
- Şu scaffold `PropertiesService` kullanıyor — küçük dataset'ler için yeterli.
- Eğer kayıt sayısı yüzler/binler ise Google Sheet'e taşıma önerilir. Sheet'e taşıma için örnek `Code.gs` ekleyebilirim.

Uyumluluk ve notlar
- Orijinal `app.js` çok sayıda inline script içeriyor. Bunların birebir portu mümkün ama bazı DOM bağımlılıklarını (sayfa layout, element id'leri) korumak gerekir.
- `vendor` scriptler (xlsx, react vb.) varsa, Apps Script HTML Service içinde bunları CDN üzerinden include etmek veya dosya olarak eklemek gerekir. Büyük kitaplıkları gömme stratejisi projenin gereksinimine göre seçilmeli.

Güvenlik ve erişim
- Deploy sırasında "Who has access" seçimini dikkatle yap: Anyone with link arındırılmış erişim sağlar ama anonim çağrılara açık olur. Eğer şirket içi kullanım ise Organization-only tercih et.

Deploy yöntemi (manuel)
1. script.google.com adresine gir.
2. Yeni proje oluştur.
3. `Code.gs` içeriğini yapıştır.
4. Yeni HTML file `Index` oluştur, `Index.html` içeriğini yapıştır. (Ayrı `client.js` ve `styles.css` için ayrı HTML dosyaları oluşturup include etmek iyi olur.)
5. Deploy -> New deployment -> Web app. Execute as = Me (owner). Who has access = Anyone/Org.

Deploy yöntemi (clasp) — hızlı tekrar deploy
- Eğer senin ortamda `clasp` kullanmak istersen şu adımlar kullanılabilir:

```bash
npm install -g @google/clasp
clasp login
clasp create --type webapp --title "Ensar Mermer" --rootDir apps_script_port
# dosyaları apps_script_port altında uygun şekilde yerleştir
clasp push
clasp deploy --description "Initial port"
```

Not: `clasp` ile manifest ve dosya yapısının uyumlu olması gerekir; gerekirse ben `clasp`-ready yapı da hazırlayabilirim.

Sonraki adımlar (benim tarafımdan yapılacaklar)
- Onay alır almaz: Phase A'yı uygulamaya başlayacağım — `makineler` ve `bloklar` ekranlarını `Index.html` içinde birebir davranışla port edip test edeceğim.
- Phase A tamamlandığında sana deploy edilmiş bir test URL vereceğim; testleri seninle beraber çalıştırıp geri bildirim alacağım.

Lütfen onayla veya öncelik verilecek modülleri söyle (ör. "önce makineler ve istasyonlar", veya "önce blok-analiz tüm alt sekmeler")
