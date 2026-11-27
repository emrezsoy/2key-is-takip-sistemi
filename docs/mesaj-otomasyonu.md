# Mesaj Otomasyonu (Faz 1): geliştirme notları

Spesifikasyon: `C:\Users\Administrator\Downloads\MESAJ_OTOMASYONU.md` (22 Kasım 2026). Çelişkide kod geçerlidir.
Çalışma dalı (yerel git): `feature/mesaj-otomasyonu`. GitHub kullanılmıyor; canlıya alma eski yöntemle yapılıyor (tar/scp).

## Kararlar (23 Kasım 2026, Emre "varsayılanla devam et" ve "kalan adımları sormadan tamamla" dedi)
- Önbellekli (daha önce analiz edilmiş) reklama gelen mesaj: 1 kredi.
- Dönem bitince 3 gün ek süre.
- Metin cevap modeli: Gemini Flash ve Claude Haiku 5.5 karşılaştırılacak (anahtarlar gelince).
- `prisma migrate` düzenine geçildi (başlangıç: `0_init`).
- Paket isimleri / kredi miktarları sonradan panelden.
- Yerel geliştirme: PostgreSQL (WSL Ubuntu, 127.0.0.1:5433, `npm run db:start`).
- AI anahtarları ve Meta DM token'ı: Ayarlar ekranından, veritabanında şifreli (`IntegrationSetting`).
- Gelen DM medyası Drive'a kopyalanmaz: Meta'nın verdiği adres + AI'ın yazılı özeti saklanır (adres süresi dolunca panelde görsel açılmayabilir, özet kalır).
- "Kredi talep et": müşteri talebi değil; adminlere bildirim + Mesaj Otomasyonu sayfasında "kredi talepleri" listesi.
- Ürün görsel benzerliği: pgvector yok; ürün görselinin metin tarifinin embedding'i JSON olarak saklanır, kosinüs uygulama içinde.

## Mimari
- `src/lib/dm/`: ortak çekirdek (kredi, abonelik, erişim, bildirim, AI sağlayıcıları, kanal adaptörleri, motor).
- `worker/`: ayrı PM2 süreci `dm-worker` (port 3005): webhook (`/api/dm/webhook`), Postgres kuyruğu, zamanlayıcılar. `tsx` ile çalışır.
- Web (Next.js): admin `/mesaj-otomasyonu`, müşteri `/panel/mesajlar`, canlı akış `/api/dm/stream` (SSE, Postgres LISTEN/NOTIFY `dm_events`).
- `DM_CHANNEL_MODE=fake`: mesajlar Meta'ya gitmez (geliştirme). Sahte webhook: `npm run dm:fake -- ...`.

## İlerleme
- [x] 1. Hazırlık (PostgreSQL yerel, migration başlangıcı, .env.example)
- [x] 2. Şema (23 tablo + ek alanlar) — canlı kopyasında denendi
- [x] 3. Kredi çekirdeği + admin kredi/ödeme ekranları + testler (npm test, npm run test:db)
- [x] 4. Worker iskeleti (npm run worker, ecosystem.config.cjs)
- [x] 5. Meta adapter + sahte webhook (npm run dm:fake)
- [x] 6. Mesaj motoru + AI sağlayıcıları (Gemini, Claude, OpenAI, sahte); npm run dm:state
- [x] 7. Gelen kutusu (portal + admin) + SSE
- [x] 8. İşletme bilgileri / prompt / test kutusu
- [x] 9. Randevu
- [x] 10. Ürün / stok (MANUAL + Excel/CSV + Shopify)
- [x] 11. Takip mesajları
- [x] 12. Sesli kurulum (OpenAI Realtime, WebRTC)
- [ ] 13. Gerçek Meta bağlantısı (Emre'nin Meta uygulaması + anahtarlar gerekiyor)
- [ ] Canlıya alma (yedek → `migrate resolve --applied 0_init` → `migrate deploy` → build → pm2; dm-worker + nginx)

## Meta belgelerinden önemli bulgular (23 Kasım 2026)
- Gönderim: `POST /me/messages` (sayfa erişim anahtarıyla), Instagram ve Facebook için aynı uç. Facebook'ta `messaging_type: RESPONSE`.
- Instagram webhook'unda `entry.id` = Instagram hesap id'si; Facebook'ta sayfa id'si. Instagram echo'ları `messages` alanıyla, `is_echo: true` olarak gelir.
- İmza: `X-Hub-Signature-256: sha256=<hex>`, ham gövdenin uygulama gizli anahtarıyla HMAC-SHA256'sı. Meta 5 sn içinde 200 bekler.
- **Standard Access yetmiyor:** Standard Access ile mesaj yalnızca uygulamada rolü olan kişilere gönderilebiliyor ve webhook'lar yalnızca onlar için geliyor. Gerçek müşteri DM'leri için `instagram_manage_messages` ve `pages_messaging` izinlerinde **Advanced Access (App Review + işletme doğrulaması)** gerekiyor. Spesifikasyondaki "App Review yok" varsayımı geçersiz.
- Instagram'da "yazıyor / görüldü" işaretlerinin desteklendiği belgelerde açıkça yazmıyor; hata verirse sessizce geçiliyor.

## Durum
Tüm Faz 1 adımları (1-12) yerel olarak tamamlandı ve denendi. 13 (gerçek Meta) Emre'nin Meta uygulaması, token ve App Review onayını bekliyor.
İkas / Ticimax otomatik senkronu: API ilk müşteri kurulurken doğrulanacak (şimdilik Excel/CSV).
