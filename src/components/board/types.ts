import type { CardTask } from "@/components/dashboard/TaskCard";

/** Müşteri kartındaki bir iş satırı için gereken tüm veri. */
export type BoardJob = CardTask & {
  clientId: string | null;
  assignedToId: string | null;
  assigneeName: string | null;
  createdAt: Date;
};

export type BoardClient = {
  /** null = hiçbir müşteriye bağlı olmayan eski işler (sadece admin görür). */
  id: string | null;
  name: string;
  /** Müşterinin renk kodu (Paylaşım Takvimi ile aynı); kart çerçevesi için. */
  color?: string;
  leads: { id: string; name: string }[];
  jobs: BoardJob[];
  canAdd: boolean;
};

export type Assignee = {
  id: string;
  name: string;
  roleLabel: string;
  activeCount: number;
};

export type Viewer = {
  id: string;
  role: "ADMIN" | "SUPERVISOR" | "EMPLOYEE";
  /** İçerik Paneli yetkisi: müşteri kartında "İçerikler" düğmesi çıkar. */
  canContent?: boolean;
};
