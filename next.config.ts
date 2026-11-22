import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
