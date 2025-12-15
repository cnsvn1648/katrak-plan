PR Kontrol Listesi — remote-first refactor

- [ ] Kod gözden geçirme: `app.js`'de `remoteFetch` kullanımı ve fallback yolları incelendi
- [ ] Lokal smoke testleri çalıştırıldı
  - `API_BASE=<exec_url> node tools/check_remote.js` → OK
  - `API_BASE=<exec_url> node tools/test_upsert.js` → OK
- [ ] CI secret `GS_EXEC_URL` eklendi (Settings → Secrets)
- [ ] Branch temiz (no unrelated changes)
- [ ] Rollback adımları gözden geçirildi (`ROLLBACK.md`)
- [ ] Release notu incelendi (`RELEASE_NOTE_REMOTE_FIRST.md`)
- [ ] Merge sonrası 24 saat izleme/telemetri planı hazır

Not: PR'ı merge etmeden önce `GS_EXEC_URL` secret'ını ayarlamayı unutmayın; aksi takdirde CI smoke job başarısız olur.
