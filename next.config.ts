import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Canlıda kesintisiz güncelleme: yeni sürüm ayrı klasörde (.next-a / .next-b) derlenir, çalışan sürüm
  // o sırada eski klasörden hizmet vermeye devam eder; bitince uygulama yeni klasörle yeniden başlatılır (bkz. deploy.sh).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Sunucuda derlerken tip kontrolü atlanır (tek çekirdek / sınırlı bellek; çalışan uygulamanın yanında bellek yetmiyor).
  // Tip kontrolü canlıya göndermeden önce yerelde `npx tsc --noEmit` ile yapılır.
  typescript: { ignoreBuildErrors: process.env.NEXT_SKIP_TYPECHECK === "1" },
  async headers() {
    return [
      {
        // Service worker her zaman güncel çekilsin (telefona bildirim / uygulama kurulumu).
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
  experimental: {
    // proxy.ts (ara katman) istek gövdesini kopyalarken varsayılan olarak 10MB'da keser; bu da büyük video
    // yüklemelerinde "Unexpected end of form" hatasına yol açıyordu. Sunucu eylemi limitiyle aynı tutulur.
    proxyClientMaxBodySize: "550mb",
    serverActions: {
      // Görev dosya eki limiti 500MB (bkz. MAX_UPLOAD_SIZE_MB); üstüne küçük
      // bir pay bırakılıyor ki çok aşan istekler framework seviyesinde erkenden reddedilsin.
      bodySizeLimit: "550mb",
    },
  },
};

export default nextConfig;
