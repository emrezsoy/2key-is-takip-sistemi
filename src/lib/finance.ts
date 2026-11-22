// Gelir-gider tablosundaki (Google E-Tablolar) formüllerin birebir karşılığı:
//   KDV           = fatura kesildiyse Tutar x %20
//   NET GELİR     = Ciro - KDV - Genel Gider
//   ORTAK KAR PAYI= Net Gelir / 2
//   Tahsil Edilen Ciro            = tahsil edilen kısımların toplamı
//   Tahsilat Sonrası Kasa         = Tahsil Edilen Ciro - Tahsil Edilenin KDV'si
//   Genel Gider Sonrası Kasa      = Tahsilat Sonrası Kasa - Genel Gider
//   Kalan Ortak Kar Payı          = Genel Gider Sonrası Kasa / 2

export const VAT_RATE = 0.2;
export const PARTNER_COUNT = 2;

/** Çalışanların puantajdan gelen sabit gider satırları bu aydan itibaren çıkar;
 * öncesindeki aylar tablodaki rakamlarla aynen korunur. */
export const FIXED_EXPENSES_START = { year: 2026, month: 11 };

/** Ay sıralaması için tek sayı (2026 Kasım -> 24322). */
export const monthIndex = (year: number, month: number) => year * 12 + month;

/** Bir ayın sabit gider satırı: ya şablondan (kira...) ya da puantajdan gelen çalışan ödemesi. */
export type FixedLine = {
  key: string;
  kind: "template" | "employee";
  refId: string;
  label: string;
  unitPrice: number;
  quantity: number;
  total: number;
  note: string | null;
};

export type CollectionKey = "NONE" | "HALF" | "FULL" | "PARTIAL";

export const COLLECTION_LABEL: Record<CollectionKey, string> = {
  NONE: "Bekliyor",
  HALF: "Yarısı tahsil edildi",
  FULL: "Tahsil edildi",
  PARTIAL: "Kısmi tahsilat",
};

// Kısmi tahsilattan tıklayınca tamamı tahsil edildi sayılır.
export const COLLECTION_NEXT: Record<CollectionKey, CollectionKey> = {
  NONE: "HALF",
  HALF: "FULL",
  FULL: "NONE",
  PARTIAL: "FULL",
};

export type IncomeLike = {
  amount: number;
  invoiced: boolean;
  collection: CollectionKey;
  /** Doluysa otomatik %20 yerine bu KDV tutarı kullanılır. */
  vatOverride?: number | null;
  /** collection = PARTIAL iken tahsil edilen özel tutar. */
  collectedAmount?: number | null;
};

export type ExpenseLike = { unitPrice: number; quantity: number };

export const round2 = (n: number) => Math.round(n * 100) / 100;

export function collectionFactor(c: CollectionKey) {
  return c === "FULL" ? 1 : c === "HALF" ? 0.5 : 0;
}

/** Tahsil edilen tutar: kısmi tahsilatta girilen özel tutar (tutarı aşamaz), diğerlerinde orana göre. */
export function collectedOf(i: Pick<IncomeLike, "amount" | "collection" | "collectedAmount">) {
  if (i.collection === "PARTIAL") {
    return Math.min(Math.max(i.collectedAmount ?? 0, 0), i.amount);
  }
  return i.amount * collectionFactor(i.collection);
}

/** Tahsil edilen payın oranı (0-1); tahsil edilen KDV bu oranla hesaplanır. */
export function collectedRatio(i: Pick<IncomeLike, "amount" | "collection" | "collectedAmount">) {
  return i.amount > 0 ? collectedOf(i) / i.amount : 0;
}

export const incomeVat = (i: Pick<IncomeLike, "amount" | "invoiced" | "vatOverride">) =>
  !i.invoiced ? 0 : i.vatOverride != null ? round2(i.vatOverride) : round2(i.amount * VAT_RATE);

export const expenseTotal = (e: ExpenseLike) => round2(e.unitPrice * e.quantity);

export type FinanceSummary = ReturnType<typeof summarize>;

export function summarize(incomes: IncomeLike[], expenses: ExpenseLike[]) {
  const ciro = incomes.reduce((s, i) => s + i.amount, 0);
  const kdv = incomes.reduce((s, i) => s + incomeVat(i), 0);
  const gider = expenses.reduce((s, e) => s + expenseTotal(e), 0);

  const tahsil = incomes.reduce((s, i) => s + collectedOf(i), 0);
  const tahsilKdv = incomes.reduce((s, i) => s + incomeVat(i) * collectedRatio(i), 0);

  const net = ciro - kdv - gider;
  const tahsilatKasa = tahsil - tahsilKdv;
  const giderSonrasiKasa = tahsilatKasa - gider;

  return {
    ciro: round2(ciro),
    kdv: round2(kdv),
    gider: round2(gider),
    net: round2(net),
    ortakPayi: round2(net / PARTNER_COUNT),
    tahsil: round2(tahsil),
    tahsilKdv: round2(tahsilKdv),
    bekleyen: round2(ciro - tahsil),
    tahsilatKasa: round2(tahsilatKasa),
    giderSonrasiKasa: round2(giderSonrasiKasa),
    kalanOrtakPayi: round2(giderSonrasiKasa / PARTNER_COUNT),
  };
}
