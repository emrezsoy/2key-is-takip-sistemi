import { BadgeCheck } from "lucide-react";

const shortDate = (d: Date | string) =>
  new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", timeZone: "Europe/Istanbul" }).format(new Date(d));

/** İş kartlarında "Müşteri onayladı" rozeti: iş müşteri tarafından onaylandı, paylaşım takvimine eklenebilir. */
export function ClientApprovedBadge({
  approval,
  className = "",
}: {
  approval?: { at: Date | null; by: string | null } | null;
  className?: string;
}) {
  if (!approval) return null;
  return (
    <span
      title={approval.by ? `${approval.by} onayladı` : "Müşteri onayladı"}
      className={`inline-flex items-center gap-1 rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 ${className}`}
    >
      <BadgeCheck size={11} />
      Müşteri onayladı{approval.at ? ` · ${shortDate(approval.at)}` : ""}
    </span>
  );
}
