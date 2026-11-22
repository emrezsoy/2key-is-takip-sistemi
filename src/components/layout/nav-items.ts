import {
  BarChart3,
  Building2,
  CalendarDays,
  CalendarHeart,
  ClipboardList,
  FileText,
  Home,
  Megaphone,
  Radio,
  TrendingUp,
  Settings,
  Wallet,
  User,
  Users,
} from "lucide-react";
import type { Role } from "@prisma/client";

export type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
};

export const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  ADMIN: [
    { href: "/", label: "Ana Sayfa", icon: Home },
    { href: "/musteriler", label: "Müşteriler", icon: Building2 },
    { href: "/talepler", label: "Müşteri Talepleri", icon: ClipboardList },
    { href: "/calisanlar", label: "Çalışanlar", icon: Users },
    { href: "/puantaj", label: "Puantaj", icon: CalendarDays },
    { href: "/finans", label: "Finans", icon: Wallet },
    { href: "/rapor", label: "Rapor", icon: BarChart3 },
    { href: "/ayarlar", label: "Ayarlar", icon: Settings },
  ],
  SUPERVISOR: [
    { href: "/", label: "Ana Sayfa", icon: Home },
    { href: "/ekibim", label: "Ekibim", icon: Users },
    { href: "/rapor", label: "Rapor", icon: BarChart3 },
    { href: "/profil", label: "Profil", icon: User },
  ],
  EMPLOYEE: [
    { href: "/", label: "Ana Sayfa", icon: Home },
    { href: "/calisma-planim", label: "Çalışma Planım", icon: CalendarDays },
    { href: "/profil", label: "Profil", icon: User },
  ],
  // Müşteri hesapları ayrı bir panel kabuğu kullanır (PortalShell).
  CLIENT: [{ href: "/panel", label: "Müşteri Paneli", icon: Home }],
};

export const SHARE_CALENDAR_NAV: NavItem = {
  href: "/paylasim-takvimi",
  label: "Paylaşım Takvimi",
  icon: CalendarHeart,
};

export const AD_PANEL_NAV: NavItem = {
  href: "/reklam-paneli",
  label: "Reklam Paneli",
  icon: Megaphone,
};

export const SOCIAL_NAV: NavItem = {
  href: "/sosyal-medya",
  label: "Sosyal Medya",
  icon: TrendingUp,
};

export const PROPOSALS_NAV: NavItem = {
  href: "/teklifler",
  label: "Teklifler",
  icon: FileText,
};

/** Ofis Radyosu: tüm ekip hesaplarında menünün sonunda. */
export const RADIO_NAV: NavItem = {
  href: "/radyo",
  label: "Ofis Radyosu",
  icon: Radio,
};

/** Yetkiye bağlı menü öğeleri (Ana Sayfa'nın altında, bu sırayla). */
export type NavAccess = { shareCalendar: boolean; adPanel: boolean; proposals?: boolean };

/** Rolün menüsü; yetkisi olanlarda Paylaşım Takvimi ve Reklam Paneli Ana Sayfa'nın hemen altına eklenir. */
export function navFor(role: Role, access: NavAccess): NavItem[] {
  const items = NAV_BY_ROLE[role];
  const extras = [
    ...(access.shareCalendar ? [SHARE_CALENDAR_NAV] : []),
    ...(access.adPanel ? [AD_PANEL_NAV, SOCIAL_NAV] : []),
    ...(access.proposals ? [PROPOSALS_NAV] : []),
  ];
  const radio = role === "CLIENT" ? [] : [RADIO_NAV];
  return [items[0], ...extras, ...items.slice(1), ...radio];
}
