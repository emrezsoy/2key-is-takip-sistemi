import { formatMoney } from "@/lib/format";
import type { FinanceSummary } from "@/lib/finance";

type Tone = "green" | "red" | "orange" | "blue" | "slate";

// Sınıf adları tam literal (Tailwind taraması için).
const TONE_BAR: Record<Tone, string> = {
  green: "bg-emerald-500",
  red: "bg-red-500",
  orange: "bg-orange-500",
  blue: "bg-sky-500",
  slate: "bg-ink-400",
};

function MoneyCard({
  label,
  value,
  hint,
  tone,
  signed = false,
}: {
  label: string;
  value: number;
  hint?: string;
  tone: Tone;
  signed?: boolean;
}) {
  const negative = signed && value < 0;
  return (
    <div className="relative overflow-hidden rounded-xl border border-(--color-border) bg-(--color-surface) p-4 pl-5">
      <span className={`absolute inset-y-0 left-0 w-1.5 ${TONE_BAR[tone]}`} />
      <p className="text-xs font-medium text-(--color-text-muted)">{label}</p>
      <p
        className={`mt-1 text-xl font-bold tracking-tight ${
          negative ? "text-red-600 dark:text-red-400" : ""
        }`}
      >
        {formatMoney(value)}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-(--color-text-muted)">{hint}</p>}
    </div>
  );
}

export function SummaryCards({ s }: { s: FinanceSummary }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="mb-2 text-sm font-bold">Ay Sonu Durumu (ciro bazlı)</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <MoneyCard label="Ciro Toplam" value={s.ciro} tone="green" />
          <MoneyCard label="KDV Toplam" value={s.kdv} tone="red" hint="Faturalı işlerin %20'si" />
          <MoneyCard label="Genel Gider" value={s.gider} tone="red" />
          <MoneyCard label="Net Gelir" value={s.net} tone="orange" signed hint="Ciro − KDV − Gider" />
          <MoneyCard label="Ortak Kar Payı" value={s.ortakPayi} tone="green" signed hint="Net gelir ÷ 2" />
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-bold">Kasa Durumu (tahsilat bazlı)</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <MoneyCard label="Tahsil Edilen Ciro" value={s.tahsil} tone="green" />
          <MoneyCard label="Bekleyen Alacak" value={s.bekleyen} tone="blue" hint="Henüz tahsil edilmeyen" />
          <MoneyCard
            label="Tahsilat Sonrası Kasa"
            value={s.tahsilatKasa}
            tone="slate"
            signed
            hint="Tahsilat − tahsil edilenin KDV'si"
          />
          <MoneyCard
            label="Genel Gider Sonrası Kasa"
            value={s.giderSonrasiKasa}
            tone="orange"
            signed
          />
          <MoneyCard label="Kalan Ortak Kar Payı" value={s.kalanOrtakPayi} tone="green" signed hint="Kasa ÷ 2" />
        </div>
      </div>
    </div>
  );
}
