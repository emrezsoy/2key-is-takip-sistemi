export type ProposalFileRow = {
  id: string;
  version: number;
  /** REPORT | PROPOSAL | REVISION */
  type: string;
  url: string;
  name: string;
  /** YYYY-MM-DD */
  date: string;
  uploadedByName: string | null;
};

export type ProposalRow = {
  id: string;
  companyName: string;
  companySize: string;
  kind: string;
  fromReport: boolean;
  services: string[];
  customService: string | null;
  contactName: string | null;
  contactPhone: string | null;
  date: string;
  status: string;
  resultNote: string | null;
  createdByName: string | null;
  /** Yeni sürümden eskiye (ilk eleman son iletilen). */
  files: ProposalFileRow[];
};

export const fmtDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("tr-TR", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
