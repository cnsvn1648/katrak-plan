Başlık: CI Duman Kontrolleri ve temiz port dalı (GS webapp koruması)

Açıklama
Bu PR, CI duman testlerini (smoke checks) Türkçe isimlendirilmiş adımlar ve güvenlik kontrolleriyle kararlı hale getirmeyi amaçlar. Ayrıca, port ile ilgili büyük dosyaları hariç tutarak temiz bir branch oluşturma işlemi gerçekleştirildi.

Yapılan değişiklikler
- CI iş akışı yeniden düzenlendi:
  - Workflow adı: "CI Duman Kontrolleri".
  - Job/step isimleri Türkçeleştirildi (ör. "Duman: okuma uçlarını kontrol et", "Duman: test upsert", "Atlama uyarısı: GS_EXEC_URL eksik").
  - `secrets.GS_EXEC_URL` kontrolü eklendi; eksikse duman testleri atlanır ve bilgilendirici bir echo mesajı gösterilir.
  - `API_TABAN` environment olarak `secrets.GS_EXEC_URL` ile sağlanır ve tırnak içine alınmıştır.
  - Node.js 18 kullanımı kesinleştirildi (actions/setup-node@v4 ile).
  - `npm ci --silent` ile deterministik kurulum için `package-lock.json` kullanımı zorunlu hale getirildi.

- CI adımları:
  - Ön kontrol: YAML geçerlilik ve isimlendirme temizliği.
  - Duman: okuma uçlarının (`node tools/check_remote.js "$API_BASE"`) çalıştırılması (sadece `GS_EXEC_URL` mevcutsa).
  - Duman: yazma/upsert testi (`node tools/test_upsert.js "$API_BASE"`) (sadece `GS_EXEC_URL` mevcutsa).

- Repo temizliği:
  - `chore(clean)`: Portla ilgili dosyaları içeren temiz bir dal oluşturuldu; büyük/ikincil dosyalar hariç tutuldu.
  - Push / PR kuralları: yalnızca `main` ve üst düzey (top-level) hedefler için kısıtlamalar uygulandı.

Neden
- CI duman testleri, Apps Script WebApp ile entegrasyonun sağlıklı olduğunu doğrulamak için önemlidir. Ancak deploy sırasında gizli exec URL yoksa testler hata veriyor; bu nedenle guard eklenerek hatalı runs engellendi ve beklenmeyen başarısızlıklar önlendi.
- Node sürümü ve `npm ci` ile tutarlı, tekrarlanabilir CI kurulumu hedeflendi.
- Büyük dosyaların gereksiz yere repoya dahil edilmesi engellendi; push reddi hatalarının tekrarı azaltıldı.

Testler
- Yerel smoke testler `tools/check_remote.js` ve `tools/test_upsert.js` ile çalıştırıldı (doğrulandı).
- CI guard'ı olmadan çalışacak şekilde `GS_EXEC_URL` secret'ı eklenmişse runner üzerinde de testler çalışacaktır.

İşlem sonrası
- Lütfen repository Settings → Secrets and variables → Actions altında `GS_EXEC_URL` secret'ının bulunduğunu doğrulayın (CI'nın gerçek endpoint ile test etmesi için gereklidir).
- Eğer CI'da hâlâ bir failing run varsa, ilgili job log'unu buraya yapıştırın; ben hızlıca inceleyip hedefli bir düzeltme yapacağım.

Kısa özet
- Workflow adı: "CI Duman Kontrolleri"
- Türkçe job/step isimleri
- `GS_EXEC_URL` guard (eksikse atla)
- Node 18 + `npm ci`
- Port-only temiz dal oluşturuldu

--

Not: Bu dosya PR açıklamasını saklamak ve PR açarken metni kopyalamayı kolaylaştırmak için repo içinde tutuluyor. Eğer farklı bir konuma taşımamı istersen belirt.
