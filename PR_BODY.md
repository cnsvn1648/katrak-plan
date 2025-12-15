PR Başlığı: remote-first: centralize Apps Script API via remoteFetch and add CI smoke checks

Kısa Özet

Bu PR, istemci kodunda global fetch monkey‑patch'ini kaldırır ve onun yerine merkezi bir `remoteFetch` wrapper'ı getirir. Ayrıca kritik uzak uçlar (okuma & yazma) için lokal ve CI smoke testleri eklenmiştir.

Neden

- Global `window.fetch`'i değiştirmek, beklenmeyen yan etkilere neden olabiliyordu. Merkezi bir wrapper ile legacy URL rewrite davranışını kontrol edilebilir, test edilebilir ve geri alınabilir hale getirdik.
- Apps Script exec (WebApp) read & upsert uçlarının stabil çalıştığını otomatik testlerle doğrulamak istiyoruz.

Yapılan Değişiklikler (Öne Çıkan)

- `app.js`: global fetch monkey‑patch kaldırıldı; `window.remoteFetch` eklendi; `_fetchJsonOrExplain`, `remoteUpsert`, `remoteDelete` vb. kritik fonksiyonlar `remoteFetch` kullanacak şekilde güncellendi.
- `tools/check_remote.js`: Apps Script `?action=list&collection=bloklar_yeni_demo` için smoke test.
- `tools/test_upsert.js`: küçük upsert testi (POST action=upsert).
- `tools/test_upsert.js`, `tools/check_remote.js` ve `tools/ci_smoke.sh` ile lokal/CI smoke runner sağlandı.
- `.github/workflows/ci-smoke.yml` eklendi: push/PR üzerine smoke check çalıştırır (secret: `GS_EXEC_URL`).
- `RELEASE_NOTE_REMOTE_FIRST.md`, `ROLLBACK.md` eklendi — hızlı doğrulama ve geri alma talimatları.

Nasıl Test Edildi

- Lokal smoke testler çalıştırıldı:
  - `node tools/check_remote.js <EXEC_URL>` → JSON döndü.
  - `node tools/test_upsert.js <EXEC_URL>` → { ok:true, action:'upsert', id: 'TEST_PUSH_...' } döndü.
- Bu PR CI workflow'u ile de GitHub üzerinde aynı testleri çalıştıracak; repository secret `GS_EXEC_URL` ayarlı olmalı.

Geri Alınma (Rollback)

- `ROLLBACK.md` içinde adımlar yer alıyor. Kısa: `git checkout -- app.js` veya commit öncesi duruma dönmek için `git reset --hard <commit>`.

Deploy / Merge Adımları (öneri)

1. Bu PR'ı main/master'a merge etmeden önce aşağıdaki adımları uygula:
   - Repository Secrets → `GS_EXEC_URL` alanına Apps Script exec URL'ini ekle.
   - CI'de smoke job'un yeşil çalıştığını doğrula.
2. Merge sonrası kısa süre gözlem (örn. 24 saat) boyunca kullanıcı raporlarını izle. Hızlı rollback planı hazır.

Reviewer için Notlar

- `app.js` çok büyük; refactor küçük ve koruyucu tutuldu. İnceleme öncelikle `remoteFetch`'in doğru koşullarda çalışıp çalışmadığı, ve `remoteUpsert`/`remoteDelete` çağrılarının fallback'leri doğru kullandığı üzerinde olmalı.
- `ci-smoke.yml` CI için `GS_EXEC_URL` secret'ını bekler; test için geçici exec URL lokal olarak verildi ve başarı sağlandı.

Nasıl Denenir (lokal)

1. `API_BASE=https://script.google.com/macros/s/.../exec node tools/check_remote.js`
2. `API_BASE=https://script.google.com/macros/s/.../exec node tools/test_upsert.js`
3. Ya da tek komut: `API_BASE=https://script.../exec ./tools/ci_smoke.sh`

İstenirse ben PR'ı remote'a push edip GitHub'da PR açabilirim (push yetkin varsa). Aksi takdirde buradaki adımları takip edip kendi hesabından PR açabilirsiniz.

