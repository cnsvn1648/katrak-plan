CI Sonuçları - Kısa Özet
======================

- Tarih: 16 Aralık 2025
- Branch: remote-first-gs-port-pr
- En son workflow run: 20278672956 — conclusion: success

Detaylar:
- `Bağımlılıkları yükle (resilient, verbose)` adımı başarıyla tamamlandı.
- Uzak test adımları (sırasıyla):
  - `Duman: diag - curl GET (debug)` -> success
  - `Duman: okuma uç noktasını kontrol et` -> success
  - `Duman: test upsert` -> success

Notlar:
- CI artefaktları altında `ci-debug-logs` isimli artefakt mevcutsa, içindeki `npm-install.log` ve `remote-check.log` dosyalarını indirip daha ayrıntılı inceleyebilirim.
- İsterseniz ben bu dosyayı PR body olarak veya PR açıklamasına kopyalayabilirim.
