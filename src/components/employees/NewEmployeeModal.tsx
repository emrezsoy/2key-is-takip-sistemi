"use client";

import { useRef, useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { createEmployee } from "@/app/(app)/calisanlar/actions";
import { ClientLeadPicker } from "./ClientLeadPicker";
import { ShareAccessField } from "./ShareAccessField";
import { AdPanelField } from "./AdPanelField";
import { ProposalAccessField } from "./ProposalAccessField";
import { ContentAccessField } from "./ContentAccessField";

type Option = { id: string; label: string };

const EMPLOYMENT_TYPES = ["Stajyer", "Parttime", "Fulltime"];

export function NewEmployeeModal({
  supervisors,
  clients,
}: {
  supervisors: Option[];
  clients: Option[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState("EMPLOYEE");
  const [paymentType, setPaymentType] = useState("DAILY");

  const close = () => dialogRef.current?.close();

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
      >
        <Plus size={16} />
        Yeni Çalışan
      </button>

      <dialog
        ref={dialogRef}
        className="w-full max-w-lg rounded-xl border border-(--color-border) bg-(--color-surface) p-0 text-(--color-text) backdrop:bg-black/50"
      >
        <form
          ref={formRef}
          action={(formData) => {
            setError(null);
            startTransition(async () => {
              try {
                await createEmployee(formData);
                formRef.current?.reset();
                setRole("EMPLOYEE");
                setPaymentType("DAILY");
                close();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Bir hata oluştu.");
              }
            });
          }}
          className="p-5"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold">Yeni Çalışan</h2>
            <button type="button" onClick={close} aria-label="Kapat">
              <X size={18} />
            </button>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">
                  Ad Soyad
                </label>
                <input
                  name="fullName"
                  required
                  className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-brand-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">
                  E-posta
                </label>
                <input
                  name="email"
                  type="email"
                  required
                  className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-brand-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">
                  Kullanıcı adı
                </label>
                <input
                  name="username"
                  required
                  className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-brand-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">
                  Şifre
                </label>
                <input
                  name="password"
                  type="password"
                  required
                  minLength={6}
                  className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-brand-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">
                  Rol
                </label>
                <select
                  name="role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm"
                >
                  <option value="EMPLOYEE">Çalışan</option>
                  <option value="SUPERVISOR">Süpervizör</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">
                  Çalışma şekli
                </label>
                <input
                  name="employmentType"
                  list="employment-types"
                  placeholder="Fulltime"
                  className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-brand-500"
                />
                <datalist id="employment-types">
                  {EMPLOYMENT_TYPES.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">
                  Ödeme şekli
                </label>
                <select
                  name="paymentType"
                  value={paymentType}
                  onChange={(e) => setPaymentType(e.target.value)}
                  className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm"
                >
                  <option value="DAILY">Günlük ücret</option>
                  <option value="MONTHLY">Aylık net ücret</option>
                </select>
              </div>
              {paymentType === "DAILY" ? (
                <div>
                  <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">
                    Günlük ücret (₺)
                  </label>
                  <input
                    name="dailyRate"
                    type="number"
                    min={0}
                    step="0.01"
                    className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-brand-500"
                  />
                </div>
              ) : (
                <div>
                  <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">
                    Aylık net ücret (₺)
                  </label>
                  <input
                    name="monthlyRate"
                    type="number"
                    min={0}
                    step="0.01"
                    className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-brand-500"
                  />
                </div>
              )}
            </div>

            {role === "EMPLOYEE" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">
                  Süpervizör (opsiyonel)
                </label>
                <select
                  name="supervisorId"
                  className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm"
                >
                  <option value="">Seçiniz</option>
                  {supervisors.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {role !== "ADMIN" && <ClientLeadPicker clients={clients} />}

            {role !== "ADMIN" && <ShareAccessField />}

            {role !== "ADMIN" && <AdPanelField />}
            <ProposalAccessField />
            {role !== "ADMIN" && <ContentAccessField />}
          </div>

          {error && <p className="mt-3 text-xs text-brand-600">{error}</p>}

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={close}
              className="rounded-lg px-4 py-2 text-sm font-medium text-(--color-text-muted) hover:bg-(--color-surface-muted)"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {pending ? "Ekleniyor..." : "Çalışanı Ekle"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
