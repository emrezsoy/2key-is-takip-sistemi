// Mesaj Otomasyonu başlangıç verileri: varsayılan kredi fiyatları (DmPricing) ve örnek paket (DmPlan).
// Çalıştırma: npm run db:seed-dm   (tekrar çalıştırılabilir; var olan kayıtları değiştirmez)

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Fiyatlar: şemadaki varsayılanlar (metin 1, görsel 2, video 3, takip 2, önbellekli medya 1, eksi limit 2, ek süre 3 gün).
  const pricing = await prisma.dmPricing.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } });
  console.log("Kredi fiyatları:", {
    metin: pricing.textCost,
    görsel: pricing.imageCost,
    video: pricing.videoCost,
    takip: pricing.followUpCost,
    önbellekliMedya: pricing.cachedMediaCost,
    eksiLimit: pricing.negativeLimit,
    ekSüreGün: pricing.graceDays,
  });

  // Paket isimleri ve kredi miktarları gerçek maliyet verisinden sonra belirlenecek; bu sadece denemelik örnek.
  if ((await prisma.dmPlan.count()) === 0) {
    await prisma.dmPlan.create({
      data: { name: "Örnek paket", monthlyCredits: 1000, priceNote: "Örnek: panelden düzenleyin", sortOrder: 0 },
    });
    console.log("Örnek paket eklendi: Örnek paket (aylık 1000 kredi)");
  } else {
    console.log("Paketler zaten var, dokunulmadı.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
