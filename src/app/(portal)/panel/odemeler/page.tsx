import { prisma } from "@/lib/prisma";
import { requirePortalUser } from "@/lib/clientPortal";
import { getClientPayments } from "@/lib/clientPayments";
import { formatCurrency } from "@/lib/format";
import { monthTitle } from "@/lib/portalText";

function Stat({ label, value, alert }: { label: string; value: number; alert?: boolean }) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        alert ? "border-brand-500/50 bg-brand-50 dark:bg-brand-900/10" : "border-(--color-border) bg-(--color-surface)"
      }`}
    >
      <p className="text-xs text-(--color-text-muted)">{label}</p>
      <p className={`mt-1 text-xl font-extrabold ${alert ? "text-brand-600" : ""}`}>{formatCurrency(value)}</p>
    </div>
  );
}

function StatusBadge({ paid, overdue, partial }: { paid: boolean; overdue: boolean; partial: boolean }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        paid
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
          : overdue
            ? "bg-brand-600 text-white"
            : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
      }`}
    >
      {paid ? "Ödendi" : overdue ? "Gecikmiş" : partial ? "Kısmen ödendi" : "Bekliyor"}
    </span>
  );
}

export default async function PortalPayments() {
  const user = await requirePortalUser();
  const client = await prisma.client.findUniqueOrThrow({
    where: { id: user.clientId },
    select: { id: true, name: true, paymentDueDay: true },
  });
  const p = await getClientPayments(client);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Ödemeler</h1>
        <p className="text-sm text-(--color-text-muted)">
          Tutarlar KDV dahildir.
          {client.paymentDueDay ? ` Ödeme günü: her ayın ${client.paymentDueDay}. günü.` : ""}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Toplam" value={p.totalAmount} />
        <Stat label="Ödenen" value={p.totalCollected} />
        <Stat label="Kalan" value={p.totalRemaining} />
        <Stat label="Gecikmiş" value={p.overdueAmount} alert={p.overdueCount > 0} />
      </div>

      <ul className="space-y-2 md:hidden">
        {p.rows.map((r) => {
          const paid = r.remaining <= 0.009;
          return (
            <li key={r.id} className="rounded-xl border border-(--color-border) bg-(--color-surface) p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">{monthTitle(r.year, r.month)}</p>
                <StatusBadge paid={paid} overdue={r.overdue} partial={r.collected > 0} />
              </div>
              {r.service && <p className="text-xs text-(--color-text-muted)">{r.service}</p>}
              <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <dt className="text-(--color-text-muted)">Tutar</dt>
                  <dd className="font-medium">{formatCurrency(r.amount)}</dd>
                </div>
                <div>
                  <dt className="text-(--color-text-muted)">Ödenen</dt>
                  <dd className="font-medium">{formatCurrency(r.collected)}</dd>
                </div>
                <div>
                  <dt className="text-(--color-text-muted)">Kalan</dt>
                  <dd className="font-semibold">{formatCurrency(r.remaining)}</dd>
                </div>
              </dl>
            </li>
          );
        })}
        {p.rows.length === 0 && (
          <li className="rounded-xl border border-dashed border-(--color-border) p-6 text-center text-sm text-(--color-text-muted)">
            Henüz ödeme kaydı yok.
          </li>
        )}
      </ul>

      <div className="hidden overflow-x-auto rounded-xl border border-(--color-border) bg-(--color-surface) md:block">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-(--color-surface-muted) text-xs uppercase text-(--color-text-muted)">
            <tr>
              <th className="px-4 py-3 font-semibold">Dönem</th>
              <th className="px-4 py-3 font-semibold">Hizmet</th>
              <th className="px-4 py-3 text-right font-semibold">Tutar</th>
              <th className="px-4 py-3 text-right font-semibold">Ödenen</th>
              <th className="px-4 py-3 text-right font-semibold">Kalan</th>
              <th className="px-4 py-3 font-semibold">Durum</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-(--color-border)">
            {p.rows.map((r) => {
              const paid = r.remaining <= 0.009;
              return (
                <tr key={r.id}>
                  <td className="px-4 py-3 whitespace-nowrap">{monthTitle(r.year, r.month)}</td>
                  <td className="px-4 py-3 text-(--color-text-muted)">{r.service ?? "—"}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">{formatCurrency(r.amount)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">{formatCurrency(r.collected)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap font-medium">{formatCurrency(r.remaining)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge paid={paid} overdue={r.overdue} partial={r.collected > 0} />
                  </td>
                </tr>
              );
            })}
            {p.rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-(--color-text-muted)">
                  Henüz ödeme kaydı yok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
