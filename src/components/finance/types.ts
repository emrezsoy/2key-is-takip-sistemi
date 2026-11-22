import type { CollectionKey } from "@/lib/finance";

export type IncomeRow = {
  id: string;
  clientName: string;
  service: string | null;
  amount: number;
  invoiced: boolean;
  vatOverride: number | null;
  collection: CollectionKey;
  collectedAmount: number | null;
  note: string | null;
  /** Aylık düzenli: her ay otomatik tekrar eder. */
  recurring: boolean;
};

export type ExpenseRow = {
  id: string;
  label: string;
  unitPrice: number;
  quantity: number;
  note: string | null;
};
