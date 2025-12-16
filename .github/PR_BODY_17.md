Başlık: chore(ci): CI Duman Kontrolleri ve temiz port dalı (#17)

Açıklama
Bu PR (#17) CI duman testlerini (smoke checks) Türkçe isimlendirilmiş adımlar ve güvenlik kontrolleriyle kararlı hale getirmeyi amaçlar. Ayrıca, port ile ilgili büyük dosyaları hariç tutarak temiz bir branch oluşturma işlemi gerçekleştirilmiştir.

Yapılan değişiklikler
- CI iş akışı yeniden düzenlendi:
  - Workflow adı: "CI Duman Kontrolleri".
  - Job/step isimleri Türkçeleştirildi (ör. "Duman: okuma uçlarını kontrol et", "Duman: test upsert", "Atlama uyarısı: GS_EXEC_URL eksik").
  - `secrets.GS_EXEC_URL` kontrolü job seviyesinde `env.API_BASE` olarak tanımlandı ve step `if` ifadeleri `env.API_BASE` üzerinden kontrol ediliyor.
  - Node.js 18 kullanımı kesinleştirildi (actions/setup-node@v4 ile).
  - `npm ci --silent` ile deterministik kurulum için `package-lock.json` kullanımı zorunlu hale getirildi.

- CI adımları:
  - Ön kontrol: YAML geçerlilik ve isimlendirme temizliği.
  - Duman: okuma uçlarının (`node tools/check_remote.js "$API_BASE"`) çalıştırılması (sadece `GS_EXEC_URL` secret'ı mevcutsa).
  - Duman: yazma/upsert testi (`node tools/test_upsert.js "$API_BASE"`) (sadece `GS_EXEC_URL` mevcutsa).

- Repo temizliği:
  - `chore(clean)`: Portla ilgili dosyaları içeren temiz bir dal oluşturuldu; büyük/ikincil dosyalar hariç tutuldu.

Neden
- CI duman testleri, Apps Script WebApp ile entegrasyonun sağlıklı olduğunu doğrulamak için önemlidir. Ancak deploy sırasında gizli exec URL yoksa testler hata veriyor; bu nedenle guard eklenerek hatalı runs engellendi ve beklenmeyen başarısızlıklar önlendi.

Testler
- Yerel smoke testler `tools/check_remote.js` ve `tools/test_upsert.js` ile çalıştırıldı (doğrulandı).

İşlem sonrası
- Lütfen repository Settings → Secrets and variables → Actions altında `GS_EXEC_URL` secret'ının bulunduğunu doğrulayın (CI'nın gerçek endpoint ile test etmesi için gereklidir).
- Eğer CI'da hâlâ bir failing run varsa, ilgili job log'unu buraya yapıştırın; ben hızlıca inceleyip hedefli bir düzeltme yapacağım.

Kısa özet
- Workflow adı: "CI Duman Kontrolleri"
- `env.API_BASE` üzerinden secrets kullanımı
- Node 18 + `npm ci`

CI Sonuçları (özet)
-------------------
- Tarih: 16 Aralık 2025
- En son workflow run: 20278672956 (branch: remote-first-gs-port-pr) — conclusion: success
- Özet: `Bağımlılıkları yükle` adımı başarılı şekilde tamamlandı; uzak test adımları `Duman: diag - curl GET (debug)`, `Duman: okuma uç noktasını kontrol et` ve `Duman: test upsert` hepsi `success` döndürdü.

Not: Ayrıntılı loglar `ci-debug-logs` artefaktında bulunuyor; isterseniz indirip analiz edebilirim.
