// dm-worker: Mesaj Otomasyonu arka plan süreci (ayrı PM2 süreci; web uygulamasını yüklemez).
// - Meta webhook'u (/api/dm/webhook): doğrular, kuyruğa yazar, hemen 200 döner.
// - Kuyruk (Postgres, SKIP LOCKED): toplama/cevap, medya analizi, gönderimler.
// - Zamanlayıcılar: kredi (aylık yükleme, yenileme), takip mesajları, ürün senkronu, günlük özetler.
// Çalıştırma: npm run worker  (üretimde: pm2 start ecosystem.config.cjs)
import { loadEnvConfig } from "@next/env";

// .env, Prisma istemcisi oluşturulmadan önce yüklenmeli (Next ile aynı kurallar; BOM'lu dosyayı da okur).
loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

void import("./main").then((m) => m.start());
