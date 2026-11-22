"use client";

import { useActionState } from "react";
import { changePassword, type ChangePasswordState } from "./actions";

const initialState: ChangePasswordState = { error: null, success: false };

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changePassword, initialState);

  return (
    <form action={formAction} className="max-w-sm space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">
          Mevcut şifre
        </label>
        <input
          name="currentPassword"
          type="password"
          required
          className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-brand-500"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">
          Yeni şifre
        </label>
        <input
          name="newPassword"
          type="password"
          required
          minLength={6}
          className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-brand-500"
        />
      </div>

      {state.error && <p className="text-xs text-brand-600">{state.error}</p>}
      {state.success && (
        <p className="text-xs text-status-done">Şifre güncellendi.</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? "Güncelleniyor..." : "Şifreyi Güncelle"}
      </button>
    </form>
  );
}
