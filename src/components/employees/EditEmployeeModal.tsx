"use client";

import { useRef, useState, useTransition } from "react";
import { Eye, EyeOff, Pencil, X } from "lucide-react";
import { updateEmployee } from "@/app/(app)/calisanlar/actions";
import { ClientLeadPicker } from "./ClientLeadPicker";
import { ShareAccessField } from "./ShareAccessField";
import { AdPanelField } from "./AdPanelField";
import { ProposalAccessField } from "./ProposalAccessField";
import { ContentAccessField } from "./ContentAccessField";

type Option = { id: string; label: string };

const EMPLOYMENT_TYPES = ["Stajyer", "Parttime", "Fulltime"];

export function EditEmployeeModal({
  user,
  supervisors,
  clients,
}: {
  user: {
    id: string;
    fullName: string;
    email: string;
    role: string;
    employmentType: string | null;
    paymentType: string;
    dailyRate: number | null;
    monthlyRate: number | null;
    supervisorId: string | null;
    isActive: boolean;
    emailNotificationsEnabled: boolean;
    shareCalendarAccess: string;
    adPanelAccess: boolean;
    adManageAccess: boolean;
    proposalAccess: boolean;
    contentAccess: boolean;
    leadClientIds: string[];
  };
  supervisors: Option[];
  clients: Option[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState(user.role);
  const [paymentType, setPaymentType] = useState(user.paymentType);
  const [showPassword, setShowPassword] = useState(false);

  const close = () => dialogRef.current?.close();

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        aria-label="Düzenle"
        className="rounded p-1.5 text-(--color-text-muted) hover:bg-(--color-surface-muted) hover:text-brand-600"
      >
        <Pencil size={14} />
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
                await updateEmployee(user.id, formData);
                close();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Bir hata oluştu.");
              }
            });
          }}
          className="p-5"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold">Çalışanı Düzenle</h2>
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
                  defaultValue={user.fullName}
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
                  defaultValue={user.email}
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
                  list="employment-types-edit"
                  defaultValue={user.employmentType ?? ""}
                  className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-brand-500"
                />
                <datalist id="employment-types-edit">
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
                    defaultValue={user.dailyRate ?? ""}
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
                    defaultValue={user.monthlyRate ?? ""}
                    className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-brand-500"
                  />
                </div>
              )}
            </div>

            {role === "EMPLOYEE" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">
                  Süpervizör
                </label>
                <select
                  name="supervisorId"
                  defaultValue={user.supervisorId ?? ""}
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

            {role !== "ADMIN" && (
              <ClientLeadPicker clients={clients} selectedIds={user.leadClientIds} />
            )}

            {role !== "ADMIN" && <ShareAccessField defaultValue={user.shareCalendarAccess} />}
            {role !== "ADMIN" && <AdPanelField defaultChecked={user.adPanelAccess} manageDefault={user.adManageAccess} />}
            {role !== "ADMIN" && <ContentAccessField defaultChecked={user.contentAccess} />}
            <ProposalAccessField defaultChecked={user.proposalAccess} />

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="isActive"
                defaultChecked={user.isActive}
                className="h-4 w-4 rounded border-(--color-border)"
              />
              Aktif
            </label>

            {(role === "ADMIN" || role === "SUPERVISOR") && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="emailNotificationsEnabled"
                  defaultChecked={user.emailNotificationsEnabled}
                  className="h-4 w-4 rounded border-(--color-border)"
                />
                E-posta bildirimlerini al
              </label>
            )}

            <div className="border-t border-(--color-border) pt-3">
              <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">
                Yeni şifre belirle (opsiyonel)
              </label>
              <div className="relative">
                <input
                  name="newPassword"
                  type={showPassword ? "text" : "password"}
                  minLength={6}
                  placeholder="Değiştirmek istemiyorsan boş bırak"
                  className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 pr-9 text-sm outline-none focus:border-brand-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-(--color-text-muted) hover:text-(--color-text)"
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
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
              {pending ? "Kaydediliyor..." : "Kaydet"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
