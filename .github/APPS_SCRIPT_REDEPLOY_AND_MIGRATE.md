Apps Script Redeploy & Veri Migrasyon Rehberi
=============================================

Bu doküman, projedeki Apps Script (Web App) deploy ve "tüm veriyi Apps Script'e taşıma" (migration) süreci için kısa, uygulanabilir adımları ve güvenlik/geri alma (rollback) önerilerini içerir.

Amaç
-----
- Apps Script exec URL'sinin (GS_EXEC_URL) doğru deploy edilmesini sağlamak.
- Repository secret `GS_EXEC_URL` güncellendikten sonra CI duman testlerinin doğrulandığını garantilemek.
- Mevcut veriyi güvenli şekilde Apps Script tarafına taşımak için bir plan sunmak (backup → dry-run → migrate → verify → rollback).

Hızlı Redeploy Adımları
------------------------
1. Apps Script projesini açın (Google Drive → ilgili Apps Script proje dosyası).
2. `Deploy` → `Manage deployments` (eski arayüzde `New deployment`) seçin.
3. Yeni bir sürüm/deployment oluşturun:
   - `Select type` → `Web app`.
   - `Description` alanına kısa bir not yazın (örn. "CI smoke-ready redeploy 2025-12-16").
   - `Execute as` seçeneğini projenin ihtiyaçlarına göre ayarlayın:
     - "Me (owner)" — eğer script'in owner yetkilerine ihtiyacı varsa.
     - "User accessing the web app" — eğer script kullanıcı kimliği ile çalışmalıysa.
   - `Who has access`:
     - Geliştirme/CI için en basit: "Anyone, even anonymous" veya "Anyone with the link" (eğer dışarıdan çalıştırılması gerekiyorsa).
     - Güvenlik gerekçesiyle mümkünse daha kısıtlı erişim kullanın ve CI runner IP/kimlik doğrulamasını düzenleyin.
4. Deploy'u oluşturun ve "Web app URL" (exec URL) değerini kopyalayın.
5. GitHub -> Repository Settings -> Secrets and variables -> Actions bölümüne gidin ve `GS_EXEC_URL` secret'ını yeni exec URL ile güncelleyin.
6. CI çalışmasını tetikleyin (yeni commit push'ı veya GitHub Actions -> run workflow manuel tetikleme).
7. CI loglarında `Duman: diag - curl GET (debug)` ve `Duman: test upsert` adımlarını kontrol edin.

Not: Eğer deploy sonrası 403 / HTML login sayfası gibi cevaplar alıyorsanız, `Who has access` ayarını kontrol edin veya exec URL doğru mu diye teyit edin.

Migration (Veri Taşıma) Planı — Kısa
-----------------------------------
Amaç: Mevcut tüm veriyi (yerel db.json veya uygulama verileri) Apps Script tarafındaki kalıcı depolamaya (scriptProperties, Spreadsheet, veya Google Cloud Storage/Drive) güvenli şekilde taşımak.

Önemli Varsayımlar
- Apps Script tarafında depolama endpoint'leri (`action=upsert` veya benzeri) sunulmuştur ve `tools/` altında bulunan migration helper script'leri kullanılabilir.
- Her adımda yedek alınacak (lokal ve opsiyonel: Drive üzerinde snapshot).

Adım 0 — Hazırlık
- Repo kökünde `data/db.json` gibi bir backup varsa onu doğrulayın.
- CI/runner için `GS_EXEC_URL` secret'ının ayarlı olduğundan emin olun.
- `tools/` dizinindeki mevcut migration script'lerini inceleyin (örn. `migrate_backup_to_remote_clean.js`). Eğer yoksa ben önerilen bir script'i hazırlayabilirim.

Adım 1 — Backup (zorunlu)
- Lokal verinin bir kopyasını alın:
  - `cp data/db.json data/db.json.bak-$(date +%s)`
- Opsiyonel: Drive/Cloud'a da bir yedek alın.

Adım 2 — Dry-run (küçük örnek)
- Küçük bir veri parçasıyla (örn. ilk 5 öğe) migration'ı çalıştırın ve Apps Script üzerinde sonuçları doğrulayın.
- Örnek komutlar (varsa repo araçları kullanılarak):
  - `node tools/test_upsert.js "$GS_EXEC_URL" --dry-run`  (tools destekliyorsa)
  - veya özel script: `node tools/migrate_sample_to_remote.js "$GS_EXEC_URL"`

Adım 3 — Full migration (kontrollü)
- Dry-run başarılı ise, tam migration'ı başlatın; script'lerin verbose log üretmesini sağlayın.
- Örneğin: `node tools/migrate_backup_to_remote_clean.js "$GS_EXEC_URL"`

Adım 4 — Verify
- Apps Script tarafında birkaç rastgele kayıt kontrolü yapın (ID, timestamp, alan değerleri).
- CI smoke testleri (`tools/check_remote.js` ve `tools/test_upsert.js`) başarılı olmalı.

Adım 5 — Rollback planı
- Herhangi bir kritik hata görülürse:
  - Apps Script tarafındaki veriyi önceki snapshot/backup ile geri yükleyin (eğer uygulandıysa).
  - Lokal backup dosyasını geri yükleyin.
- Migration script'inin idempotent olmasına dikkat edin (aynı kayıt birkaç kez gönderilse duplicate oluşmasını önleyecek mantık tercih edin).

Kontrol Listesi (Checklist)
- [ ] `GS_EXEC_URL` secret güncellendi ve doğrulandı
- [ ] Apps Script redeploy yapıldı (exec URL alındı)
- [ ] Küçük dry-run başarıyla tamamlandı
- [ ] Tam migration çalıştırıldı ve loglar kaydedildi
- [ ] Doğrulama testleri başarılı (CI smoke testleri + manual spot checks)
- [ ] Gerekirse rollback yapıldı ve nedenleri raporlandı

Kabul Kriterleri
- CI smoke testleri `Duman: test upsert` dahil olmak üzere başarılı.
- Rastgele seçilen 20 kayıt Apps Script üzerinde doğru şekilde görünmeli.
- Migration sürecinde veri kaybı veya beklenmeyen hatalar olmamalı.

Sonraki Adımlar (Benim önerim ve ben yapabilirim)
- Onay verirseniz ben:
  1. Repo içindeki `tools/` dizinini tarayıp mevcut migration script'lerini gözden geçiririm.
  2. Eksikse idempotent, retry-dostu bir migration scripti hazırlarım ve kısa bir test seti eklerim.
  3. Sizinle birlikte dry-run yapar ve sonuçları raporlarım.

Sorular / Güvenlik Notları
- Apps Script `Who has access` ayarını geniş açmak güvenlik riskidir; mümkünse erişimi kısa süreli ve kontrollü tutun.
- Eğer hassas veriler varsa, transport (HTTPS) ve authentication seviyesini gözden geçirelim.

İlerlemek isterseniz hangisini yapmamı istersiniz?
- (1) Sadece redeploy talimatı mı istersiniz (ben sadece doküman oluşturdum),
- (2) Tools dizinini kontrol edip migration script'ini ben hazırlayayım ve dry-run yürütelim, veya
- (3) Sizin başka bir tercihiniz.
