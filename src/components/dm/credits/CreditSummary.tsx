import { AlertTriangle, Coins } from "lucide-react";
import { SUB_LABEL, cardCls, chip, fmtDate } from "../ui";

export type CreditStateView = {
  total: number;
  balance: { plan: number; permanent: number };
  approxReplies: number;
  canReply: boolean;
  subscription: string;
  paidThrough: Date | null;
  graceEndsAt: Date | null;
  monthlyCredits: number | null;
  negativeLimit: number;
};

/** Kalan kredi, abonelik durumu ve uyarılar (admin ve müşteri panelinde ortak). */
export function CreditSummary({ state, compact = false }: { state: CreditStateView; compact?: boolean }) {
  const sub = SUB_LABEL[state.subscription] ?? SUB_LABEL.NONE;
  return (
    <div className={`${cardCls} space-y-3`}>
      <div className="flex flex-wrap items-center gap-3">
        <Coins size={20} className="text-brand-600" />
        <div>
          <p className="text-2xl font-bold leading-none">{state.total}</p>
          <p className="text-xs text-(--color-text-muted)">kalan kredi · yaklaşık {state.approxReplies} cevap</p>
        </div>
        <span className={`${chip} ${sub.cls} ml-auto`}>{sub.text}</span>
      </div>
      {!compact && (
        <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <div>
            <dt className="text-(--color-text-muted)">Paket kredisi</dt>
            <dd className="font-semibold">{state.balance.plan}</dd>
          </div>
          <div>
            <dt className="text-(--color-text-muted)">Kalıcı kredi</dt>
            <dd className="font-semibold">{state.balance.permanent}</dd>
          </div>
          <div>
            <dt className="text-(--color-text-muted)">Aylık paket</dt>
            <dd className="font-semibold">{state.monthlyCredits ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-(--color-text-muted)">Ödenmiş dönem sonu</dt>
            <dd className="font-semibold">{fmtDate(state.paidThrough)}</dd>
          </div>
        </dl>
      )}
      {!state.canReply && (
        <p className="flex items-start gap-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-800 dark:bg-rose-900/20 dark:text-rose-200">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          Kredi bitti: AI yeni mesajlara cevap vermiyor. Mesajlar gelen kutusunda &quot;insan bekliyor&quot; olarak duruyor; mesaj atan kişiye
          otomatik bir şey gönderilmiyor.
        </p>
      )}
      {state.subscription === "GRACE" && (
        <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          Abonelik dönemi bitti, ödeme bekleniyor. Ek süre {fmtDate(state.graceEndsAt)} tarihinde bitiyor; sonra paket kredisi yenilenmez.
        </p>
      )}
    </div>
  );
}
