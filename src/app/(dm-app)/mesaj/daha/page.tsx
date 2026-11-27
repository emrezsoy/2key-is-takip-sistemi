import Link from "next/link";
import { CalendarDays, ChevronRight, Coins, FlaskConical, LogOut, Package } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePortalUser } from "@/lib/clientPortal";
import { signOutAction } from "@/app/(app)/actions";
import { DmPageHeader } from "@/components/dm/app/parts";
import { LeaveRow, ThemeRow } from "@/components/dm/app/MoreActions";

export const metadata = { title: "Daha fazla" };

const group = "overflow-hidden rounded-2xl bg-(--color-surface) divide-y divide-(--color-border)";
const row = "flex items-center gap-3 px-4 py-3.5 text-[15px]";
const icon = (cls: string) => `flex h-8 w-8 items-center justify-center rounded-lg text-white ${cls}`;

export default async function DmMorePage() {
  const user = await requirePortalUser();
  const client = await prisma.client.findUniqueOrThrow({ where: { id: user.clientId }, select: { name: true, dmModuleAppointment: true, dmModuleProducts: true } });
  const items = [
    { href: "/mesaj/kredi", label: "Kredi ve AI", hint: "Kalan kredi, AI aç / kapat", icon: Coins, cls: "bg-amber-500" },
    ...(client.dmModuleAppointment && client.dmModuleProducts ? [{ href: "/mesaj/urunler", label: "Ürünler ve stok", hint: "", icon: Package, cls: "bg-emerald-600" }] : []),
    ...(client.dmModuleAppointment ? [{ href: "/mesaj/randevular#calisma-kurallari", label: "Çalışma saatleri", hint: "Randevu kuralları", icon: CalendarDays, cls: "bg-sky-600" }] : []),
    { href: "/mesaj/test", label: "AI'ı test et", hint: "", icon: FlaskConical, cls: "bg-fuchsia-600" },
  ];
  return (
    <>
      <DmPageHeader title="Daha fazla" />
      <div className="space-y-5 px-4 pt-2">
        <div className="flex items-center gap-3 rounded-2xl bg-(--color-surface) p-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-500 text-lg font-extrabold text-white">{client.name.slice(0, 1).toLocaleUpperCase("tr-TR")}</span>
          <div className="min-w-0">
            <p className="truncate text-[17px] font-bold">{client.name}</p>
            <p className="truncate text-[13px] text-(--color-text-muted)">{user.fullName} · Mesaj Otomasyonu</p>
          </div>
        </div>

        <div className={group}>
          {items.map((it) => {
            const Icon = it.icon;
            return (
              <Link key={it.href} href={it.href} className={row}>
                <span className={icon(it.cls)}>
                  <Icon size={17} />
                </span>
                {it.label}
                <span className="ml-auto flex items-center gap-1 text-[12px] text-(--color-text-muted)">
                  {it.hint}
                  <ChevronRight size={18} />
                </span>
              </Link>
            );
          })}
        </div>

        <div className={group}>
          <ThemeRow />
          <LeaveRow />
        </div>

        <form action={signOutAction} className={group}>
          <button type="submit" className={`${row} w-full text-rose-500`}>
            <span className={icon("bg-rose-500")}>
              <LogOut size={17} />
            </span>
            Çıkış yap
          </button>
        </form>
        <p className="pb-4 text-center text-[11px] text-(--color-text-muted)">2 Key Idea · Mesaj Otomasyonu</p>
      </div>
    </>
  );
}
