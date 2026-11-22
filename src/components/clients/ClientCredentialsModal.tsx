"use client";

import { useRef, useState, useTransition } from "react";
import { Eye, EyeOff, KeyRound, Copy, Trash2, Plus, X } from "lucide-react";
import {
  addClientCredential,
  updateClientCredential,
  deleteClientCredential,
  revealClientCredential,
} from "@/app/(app)/musteriler/actions";

type Credential = {
  id: string;
  label: string;
  username: string | null;
  notes: string | null;
};

function CredentialRow({ credential }: { credential: Credential }) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [revealPending, startRevealTransition] = useTransition();

  const toggleReveal = () => {
    if (revealed) {
      setRevealed(null);
      return;
    }
    startRevealTransition(async () => {
      try {
        const password = await revealClientCredential(credential.id);
        setRevealed(password);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Şifre gösterilemedi.");
      }
    });
  };

  const copyPassword = async () => {
    try {
      const password = revealed ?? (await revealClientCredential(credential.id));
      await navigator.clipboard.writeText(password);
    } catch {
      setError("Kopyalanamadı.");
    }
  };

  const handleDelete = () => {
    startTransition(async () => {
      try {
        await deleteClientCredential(credential.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Silinemedi.");
        setConfirmingDelete(false);
      }
    });
  };

  if (editing) {
    return (
      <form
        action={(formData) => {
          setError(null);
          startTransition(async () => {
            try {
              await updateClientCredential(credential.id, formData);
              setEditing(false);
              setRevealed(null);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Kaydedilemedi.");
            }
          });
        }}
        className="space-y-2 rounded-lg border border-brand-300 bg-(--color-surface-muted) p-3"
      >
        <div className="grid grid-cols-2 gap-2">
          <input
            name="label"
            required
            defaultValue={credential.label}
            placeholder="Platform (ör. Instagram)"
            className="rounded-lg border border-(--color-border) bg-(--color-bg) px-2.5 py-1.5 text-xs outline-none focus:border-brand-500"
          />
          <input
            name="username"
            defaultValue={credential.username ?? ""}
            placeholder="Kullanıcı adı"
            className="rounded-lg border border-(--color-border) bg-(--color-bg) px-2.5 py-1.5 text-xs outline-none focus:border-brand-500"
          />
        </div>
        <input
          name="password"
          type="text"
          placeholder="Yeni şifre (değiştirmek istemiyorsan boş bırak)"
          className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-2.5 py-1.5 text-xs outline-none focus:border-brand-500"
        />
        <input
          name="notes"
          defaultValue={credential.notes ?? ""}
          placeholder="Not (opsiyonel)"
          className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-2.5 py-1.5 text-xs outline-none focus:border-brand-500"
        />
        {error && <p className="text-[11px] text-brand-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-(--color-text-muted) hover:bg-(--color-surface)"
          >
            Vazgeç
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {pending ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="rounded-lg border border-(--color-border) p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{credential.label}</p>
          {credential.username && (
            <p className="truncate text-xs text-(--color-text-muted)">{credential.username}</p>
          )}
        </div>
        {confirmingDelete ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="text-[11px] text-(--color-text-muted)">Silinsin mi?</span>
            <button
              type="button"
              onClick={handleDelete}
              disabled={pending}
              className="rounded px-2 py-1 text-[11px] font-semibold text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20"
            >
              {pending ? "Siliniyor..." : "Evet, sil"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="rounded px-2 py-1 text-[11px] font-medium text-(--color-text-muted) hover:bg-(--color-surface-muted)"
            >
              Vazgeç
            </button>
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded px-2 py-1 text-[11px] font-medium text-(--color-text-muted) hover:bg-(--color-surface-muted)"
            >
              Düzenle
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              aria-label="Sil"
              className="rounded p-1.5 text-(--color-text-muted) hover:bg-(--color-surface-muted) hover:text-brand-600"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>

      <div className="mt-2 flex items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate rounded-lg border border-(--color-border) bg-(--color-surface-muted) px-2.5 py-1.5 font-mono text-xs">
          {revealPending ? "..." : revealed ?? "••••••••••"}
        </span>
        <button
          type="button"
          onClick={toggleReveal}
          disabled={revealPending}
          aria-label={revealed ? "Şifreyi gizle" : "Şifreyi göster"}
          className="rounded-lg border border-(--color-border) p-1.5 text-(--color-text-muted) hover:bg-(--color-surface-muted)"
        >
          {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
        <button
          type="button"
          onClick={copyPassword}
          aria-label="Kopyala"
          className="rounded-lg border border-(--color-border) p-1.5 text-(--color-text-muted) hover:bg-(--color-surface-muted)"
        >
          <Copy size={14} />
        </button>
      </div>

      {credential.notes && (
        <p className="mt-2 text-xs text-(--color-text-muted)">{credential.notes}</p>
      )}
      {error && <p className="mt-2 text-[11px] text-brand-600">{error}</p>}
    </div>
  );
}

export function ClientCredentialsModal({
  clientId,
  clientName,
  credentials,
}: {
  clientId: string;
  clientName: string;
  credentials: Credential[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const close = () => dialogRef.current?.close();

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        aria-label="Hesap bilgileri"
        title="Hesap bilgileri / şifreler"
        className="rounded p-1.5 text-(--color-text-muted) hover:bg-(--color-surface-muted) hover:text-brand-600"
      >
        <KeyRound size={14} />
      </button>

      <dialog
        ref={dialogRef}
        className="w-full max-w-lg rounded-xl border border-(--color-border) bg-(--color-surface) p-0 text-(--color-text) backdrop:bg-black/50"
      >
        <div className="p-5">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-lg font-bold">Hesap Bilgileri</h2>
            <button type="button" onClick={close} aria-label="Kapat">
              <X size={18} />
            </button>
          </div>
          <p className="mb-4 text-xs text-(--color-text-muted)">
            {clientName} — sosyal medya ve diğer hesapların kullanıcı adı/şifreleri
          </p>

          <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {credentials.length === 0 && (
              <p className="rounded-lg border border-dashed border-(--color-border) p-4 text-center text-xs text-(--color-text-muted)">
                Henüz kayıtlı hesap yok.
              </p>
            )}
            {credentials.map((c) => (
              <CredentialRow key={c.id} credential={c} />
            ))}
          </div>

          <form
            ref={formRef}
            action={(formData) => {
              setError(null);
              startTransition(async () => {
                try {
                  await addClientCredential(clientId, formData);
                  formRef.current?.reset();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Bir hata oluştu.");
                }
              });
            }}
            className="mt-4 space-y-2 border-t border-(--color-border) pt-4"
          >
            <p className="text-xs font-semibold text-(--color-text-muted)">Yeni hesap ekle</p>
            <div className="grid grid-cols-2 gap-2">
              <input
                name="label"
                required
                placeholder="Platform (ör. Instagram)"
                className="rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-brand-500"
              />
              <input
                name="username"
                placeholder="Kullanıcı adı"
                className="rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-brand-500"
              />
            </div>
            <input
              name="password"
              type="text"
              required
              placeholder="Şifre"
              className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
            <input
              name="notes"
              placeholder="Not (opsiyonel)"
              className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
            {error && <p className="text-xs text-brand-600">{error}</p>}
            <button
              type="submit"
              disabled={pending}
              className="flex w-fit items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              <Plus size={14} />
              {pending ? "Ekleniyor..." : "Ekle"}
            </button>
          </form>
        </div>
      </dialog>
    </>
  );
}
