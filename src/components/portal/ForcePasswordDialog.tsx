"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { setFirstPassword } from "@/lib/actions/portal";

/** Geçici şifreyle ilk giriş: kapatılamayan pencere, müşteri kendi şifresini belirleyene kadar panel kullanılamaz. */
export function ForcePasswordDialog() {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  const inputClass =
    "w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2.5 text-sm outline-none focus:border-brand-500";

  return (
    <dialog
      ref={ref}
      onCancel={(e) => e.preventDefault()}
      data-no-backdrop-close
      className="m-auto w-[calc(100%-1.5rem)] max-w-sm rounded-xl border border-(--color-border) bg-(--color-surface) p-0 text-(--color-text) backdrop:bg-black/70"
    >
      <form
        className="space-y-4 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          startTransition(async () => {
            try {
              await setFirstPassword(pw, repeat);
              router.refresh();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Şifre kaydedilemedi.");
            }
          });
        }}
      >
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-600/10 text-brand-600">
          <LockKeyhole size={20} />
        </div>
        <div>
          <h2 className="text-lg font-bold">Kendi şifrenizi belirleyin</h2>
          <p className="mt-1 text-sm text-(--color-text-muted)">
            Tek kullanımlık geçici şifrenizle giriş yaptınız. Devam etmek için lütfen kendi şifrenizi belirleyin.
          </p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">Yeni şifre (en az 8 karakter)</label>
          <input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">Yeni şifre (tekrar)</label>
          <input type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} className={inputClass} />
        </div>
        {error && <p className="text-xs text-brand-600">{error}</p>}
        <button
          type="submit"
          disabled={pending || pw.length < 8 || repeat.length < 8}
          className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? "Kaydediliyor..." : "Şifremi kaydet"}
        </button>
      </form>
    </dialog>
  );
}
