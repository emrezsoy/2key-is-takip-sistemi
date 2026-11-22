// 2026 Gelir Gider Tablosu (Google E-Tablolar) -> Finans modülü, tek seferlik içe aktarma.
// Çalıştırma:  npx tsx prisma/import-finance-2026.ts
// Güvenlik: 2026 için zaten gelir/gider kaydı varsa HİÇBİR ŞEY yazmadan durur.

import { PrismaClient, type CollectionStatus } from "@prisma/client";
import { summarize } from "../src/lib/finance";

const prisma = new PrismaClient();
const YEAR = 2026;

type Inc = {
  client: string;
  service?: string;
  amount: number;
  /** Faturalı ise KDV: sayı = tabloda yazan KDV tutarı, "auto" = %20 */
  vat?: number | "auto";
  collection?: CollectionStatus;
  note?: string;
};
type Exp = [label: string, unitPrice: number, quantity?: number, note?: string];

const F: CollectionStatus = "FULL";
const N: CollectionStatus = "NONE";

const incomes: Record<number, Inc[]> = {
  1: [
    { client: "Dynamic", amount: 24000, vat: 4000, collection: F },
    { client: "Anında Kolay", amount: 25000, collection: F },
    { client: "Sigorta Şirketi", service: "Çekim", amount: 17500, collection: F },
    { client: "Diyetisyen Emel", service: "Ajanda", amount: 9000, collection: F },
  ],
  2: [
    { client: "Dynamic", amount: 24000, vat: 4000, collection: F },
    { client: "Anında Kolay", amount: 25000, collection: F },
    { client: "Kent Yapı", service: "Sosyal Medya", amount: 36000, vat: 6000, collection: F },
    { client: "Kent Yapı", service: "Çekim", amount: 30000, vat: 5000, collection: F },
    { client: "Yapısan", service: "Web Site", amount: 10000, collection: F },
    { client: "Merve Kampanya", amount: 10000, collection: F },
    { client: "Mariner Ödeme", amount: 15000, collection: F },
  ],
  3: [
    { client: "Dynamic", amount: 24000, vat: 4000, collection: F },
    { client: "Anında Kolay", amount: 25000, collection: F },
    { client: "Kent Yapı", service: "Sosyal Medya", amount: 72000, vat: 12000, collection: F },
    { client: "Yapısan", service: "Web Site", amount: 10000, collection: F },
    { client: "Kent Yapı", service: "Web 1.Part", amount: 42000, vat: 7000, collection: F },
    {
      client: "EkoHesap",
      amount: 57425.75,
      vat: 22800,
      collection: F,
      note: "Tabloda KDV elle girilmişti: 10.000 + 10.000 + 2.800",
    },
  ],
  4: [
    { client: "Dynamic", amount: 24000, vat: 4000, collection: F },
    { client: "Anında Kolay", amount: 25000, collection: F },
    { client: "Kent Yapı", service: "Sosyal Medya", amount: 72000, vat: 12000, collection: F },
    { client: "Kent Yapı", service: "Web 2.Part", amount: 42000, vat: 7000, collection: F },
    { client: "EkoHesap", amount: 60000, vat: 10000, collection: F },
    { client: "Çağrı Şengül Gelinlik", amount: 10000, collection: F },
    { client: "PUDO", amount: 22800, vat: 2800, collection: F },
    { client: "EkoHesap", service: "Kısa Videolar", amount: 24000, vat: 4000, collection: F },
    { client: "Vize Go & Event", service: "Google Ads", amount: 12000, vat: 4000, collection: F },
  ],
  5: [
    { client: "Dynamic", amount: 24000, vat: 4000, collection: F },
    { client: "Anında Kolay", amount: 25000, collection: F },
    { client: "Kent Yapı", service: "Sosyal Medya", amount: 72000, vat: 12000, collection: F },
    { client: "Alin Exclusive", amount: 20000, collection: F },
    { client: "Kent Yapı", service: "Çekim", amount: 30000, vat: 5000, collection: F },
  ],
  6: [
    { client: "Dynamic", amount: 24000, vat: 4000, collection: F },
    { client: "Anında Kolay", amount: 25000, collection: F },
  ],
  7: [
    { client: "Dynamic", amount: 24000, vat: 4000, collection: F },
    { client: "Anında Kolay", amount: 25000, collection: F },
    { client: "Letgo", service: "Çekim", amount: 72000, vat: 12000, collection: F },
    { client: "Elçin Ukulele", amount: 20000, collection: F },
    { client: "Emel", service: "Sosyal Medya", amount: 25000, collection: F },
    { client: "Sevil Duysak Çekim", service: "Çekim", amount: 20000, collection: F },
  ],
  8: [
    { client: "Dynamic", service: "Sosyal Medya", amount: 20000, vat: "auto", collection: F },
    { client: "Anında Kolay", service: "Sosyal Medya", amount: 25000, collection: F },
    { client: "Kent Yapı", service: "Sosyal Medya", amount: 35000, vat: "auto", collection: F },
    { client: "Ukulele", service: "Çekim", amount: 20000, collection: F },
    { client: "Sevil Duysak Çekim", service: "Çekim", amount: 20000, collection: F },
  ],
  9: [
    { client: "Dynamic", service: "Sosyal Medya", amount: 20000, vat: "auto", collection: F },
    { client: "Anında Kolay", service: "Sosyal Medya", amount: 25000, collection: F },
    { client: "Kent Yapı", service: "Sosyal Medya", amount: 35000, vat: "auto", collection: F },
    { client: "Hamur Çamur Atölye", service: "Sosyal Medya", amount: 15000, collection: F },
    { client: "Bilgisayar Al Sat", service: "Sosyal Medya", amount: 17500, collection: F },
    { client: "Tenis Hocası", service: "Reklam Yönetimi", amount: 5000, collection: F },
  ],
  10: [
    { client: "Dynamic", service: "Sosyal Medya", amount: 20000, vat: "auto", collection: N },
    { client: "Anında Kolay", service: "Sosyal Medya", amount: 25000, collection: N },
    { client: "Taşı Hadi CO", amount: 140000, vat: "auto", collection: F },
    {
      client: "Hamur Çamur Atölye",
      service: "Sosyal Medya",
      amount: 15000,
      collection: N,
      note: "Tabloda 'yarı' sütunu işaretli (tahsilat toplamına dahil değildi)",
    },
    {
      client: "Bilgisayar Al Sat",
      service: "Sosyal Medya",
      amount: 17500,
      collection: N,
      note: "Tabloda 'yarı' sütunu işaretli (tahsilat toplamına dahil değildi)",
    },
    {
      client: "Sevil Duysak Çekim",
      service: "Çekim",
      amount: 20000,
      collection: N,
      note: "Tabloda 'yarı' sütunu işaretli (tahsilat toplamına dahil değildi)",
    },
    { client: "Taşı Hadi CO", service: "Reklam Yönetimi", amount: 15000, vat: "auto", collection: N },
    { client: "Sercan Songurtekin", service: "Web Site", amount: 20000, vat: "auto", collection: F },
    { client: "Sercan Songurtekin", service: "SEO Bot", amount: 2500, vat: "auto", collection: F },
    {
      client: "Sercan Songurtekin",
      service: "Hosting/Domain",
      amount: 4873.99,
      vat: "auto",
      collection: F,
    },
    { client: "Sercan Songurtekin", service: "Google Yönetimi", amount: 7000, collection: N },
  ],
  11: [
    { client: "Dynamic", service: "Sosyal Medya", amount: 20000, vat: "auto", collection: N },
    { client: "Anında Kolay", service: "Sosyal Medya", amount: 25000, collection: N },
    { client: "Bilgisayar Al Sat", service: "Sosyal Medya", amount: 17500, collection: N },
    { client: "Hamur Çamur Atölye", service: "Sosyal Medya", amount: 15000, collection: N },
    { client: "Sevil Duysak Çekim", service: "Çekim", amount: 20000, collection: F },
    { client: "Pop and Sushi (3 ay)", service: "Çekim/SM", amount: 32500, collection: N },
    { client: "Kent Yapı", service: "Sosyal Medya", amount: 35000, vat: "auto", collection: N },
    { client: "Kent Yapı", service: "Çekim", amount: 25000, vat: "auto", collection: N },
  ],
};

const expenses: Record<number, Exp[]> = {
  1: [["Kira", 13000], ["Muhasebe", 3600]],
  2: [
    ["Kira", 13000],
    ["Muhasebe", 3600],
    ["Emre Ölmez Reklam Yönetimi Kent", 5000],
    ["Emre Ölmez Komisyon", 3000],
    ["Hosting Maliyeti", 1000],
    ["Birnur Reklam Yönetimi Merve", 5000],
  ],
  3: [
    ["Kira", 10000],
    ["Muhasebe", 3600],
    ["Emre Ölmez Reklam Yönetimi Kent", 5000],
    ["Emre Ölmez Komisyon", 6000],
    ["Google Workspace", 1220],
    ["Subs", 837.83],
    ["Freepic", 559],
    ["Elevenlabs", 220.48],
    ["Nergiz Freelancer", 250, 29],
    ["Musluk", 930],
    ["Vestiyer", 490],
    ["Sercan Web Site", 10000],
  ],
  4: [
    ["Kira", 10000],
    ["Muhasebe", 3600],
    ["Emre Ölmez Reklam Yönetimi", 5000, 4],
    ["Emre Ölmez Komisyon", 6000],
    ["Google Workspace", 1220],
    ["Subs", 837.83],
    ["Freepic", 559],
    ["Elevenlabs", 220.48],
    ["Nergis Freelancer", 250, 27],
    ["İyzico Ekohesap Ödeme Kesintisi", 2574.25],
    ["İyzico Kesinti", 1029.85],
    ["Sermaye", 57882.16],
  ],
  5: [
    ["Kira", 10000],
    ["Muhasebe", 3600],
    ["Emre Ölmez Reklam Yönetimi", 5000, 2],
    ["Emre Ölmez Kent Komisyon", 6000],
    ["Google Workspace", 1220],
    ["Subs", 837.83],
    ["Freepic", 559],
    ["Elevenlabs", 220.48],
    ["Sercan Web Freelancer", 10000],
    ["Halil", 7000],
  ],
  6: [
    ["Kira", 10000],
    ["Muhasebe", 3600],
    ["Google Workspace", 1220],
    ["Subs", 837.83],
    ["Freepic", 559],
    ["Elevenlabs", 220.48],
  ],
  7: [
    ["Kira", 10000, 1, "23'ünde ödendi"],
    ["Muhasebe", 3600, 1, "23'ünde ödendi"],
    ["Aidat", 2000],
    ["Garanti Kredi Kartı Ödeme", 29348.61, 1, "23'ünde ödendi"],
    ["Halk Kredi Kartı Ödeme", 4990.19, 1, "31'inde ödendi"],
    ["KDV Ödeme", 3236.4, 1, "23'ünde ödendi"],
  ],
  8: [["Kira", 13000], ["Muhasebe", 3600], ["Aidat", 2000], ["Kart Ödemesi", 32528.19]],
  9: [["Kira", 13000], ["Muhasebe", 3600], ["Aidat", 2000], ["Kart", 25700]],
  10: [
    ["Kira", 13000],
    ["Muhasebe", 3600],
    ["Aidat", 2000, 2],
    ["Kart", 44250],
    ["Stajyerler", 15000],
    ["Fatih Komisyon", 20000],
    ["Sercan Songurtekin Domain Alımı", 448.79],
  ],
  // Kasım: Kira / Muhasebe / Aidat sabit gider şablonu, Stajyerler yerine puantaj satırları.
  11: [["Kart", 30000], ["Ecem Komisyon Sushi", 3250]],
};

const fixedFromNovember: Exp[] = [["Kira", 10000], ["Muhasebe", 3600], ["Aidat", 2000]];

// Tablodaki NET GELİR değerleri (karşılaştırma için).
const sheetNet: Record<number, number> = {
  1: 54900,
  2: 104400,
  3: 138518.44,
  4: 144547.89,
  5: 100562.69,
  6: 36450.15,
  7: 124712.26,
  8: 57871.81,
  9: 62200,
  10: 146100.4,
  11: 110150, // tabloda Stajyerler 15.000 dahil; uygulamada Kira/Muhasebe/Aidat + puantaj
};

async function main() {
  const [existingIncome, existingExpense, existingFixed] = await Promise.all([
    prisma.income.count({ where: { year: YEAR } }),
    prisma.expense.count({ where: { year: YEAR } }),
    prisma.fixedExpense.count(),
  ]);
  if (existingIncome + existingExpense + existingFixed > 0) {
    console.log(
      `DURDU: ${YEAR} için zaten kayıt var (gelir ${existingIncome}, gider ${existingExpense}, sabit gider ${existingFixed}). Hiçbir şey yazılmadı.`
    );
    return;
  }

  const clients = await prisma.client.findMany({ select: { id: true, name: true } });
  const clientId = (name: string) => clients.find((c) => c.name === name)?.id ?? null;

  let incomeCount = 0;
  let expenseCount = 0;

  for (const [m, rows] of Object.entries(incomes)) {
    const month = Number(m);
    for (const r of rows) {
      await prisma.income.create({
        data: {
          year: YEAR,
          month,
          clientId: clientId(r.client),
          clientName: r.client,
          service: r.service ?? null,
          amount: r.amount,
          invoiced: r.vat !== undefined,
          vatOverride: typeof r.vat === "number" ? r.vat : null,
          collection: r.collection ?? "NONE",
          note: r.note ?? null,
        },
      });
      incomeCount++;
    }
  }

  for (const [m, rows] of Object.entries(expenses)) {
    const month = Number(m);
    for (const [label, unitPrice, quantity = 1, note] of rows) {
      await prisma.expense.create({
        data: { year: YEAR, month, label, unitPrice, quantity, note: note ?? null },
      });
      expenseCount++;
    }
  }

  for (const [label, unitPrice, quantity = 1] of fixedFromNovember) {
    await prisma.fixedExpense.create({
      data: { label, unitPrice, quantity, fromYear: YEAR, fromMonth: 11 },
    });
  }

  console.log(`Eklendi: ${incomeCount} gelir, ${expenseCount} gider, ${fixedFromNovember.length} sabit gider.\n`);

  // Doğrulama: ay ay özet (Kasım'da şablonlar dahil, puantaj satırları hariç).
  const [allIncome, allExpense] = await Promise.all([
    prisma.income.findMany({ where: { year: YEAR } }),
    prisma.expense.findMany({ where: { year: YEAR } }),
  ]);
  console.log("Ay | Ciro | KDV | Gider | Net | Tablodaki net | Fark");
  for (let month = 1; month <= 11; month++) {
    const fixed =
      month >= 11 ? fixedFromNovember.map(([, p, q = 1]) => ({ unitPrice: p, quantity: q })) : [];
    const s = summarize(
      allIncome
        .filter((i) => i.month === month)
        .map((i) => ({
          amount: Number(i.amount),
          invoiced: i.invoiced,
          vatOverride: i.vatOverride == null ? null : Number(i.vatOverride),
          collection: i.collection,
        })),
      [
        ...allExpense
          .filter((e) => e.month === month)
          .map((e) => ({ unitPrice: Number(e.unitPrice), quantity: e.quantity })),
        ...fixed,
      ]
    );
    // Kasım'da tablodaki Stajyerler (15.000) uygulamada puantaj satırlarıyla değişir.
    const sheet = month === 11 ? sheetNet[month] + 15000 : sheetNet[month];
    console.log(
      `${month} | ${s.ciro} | ${s.kdv} | ${s.gider} | ${s.net} | ${sheet} | ${(s.net - sheet).toFixed(2)}`
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
