"use client";

import { useActionState, useEffect } from "react";
import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = { error: null };

export function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  // Giriş başarılı: sayfayı tamamen yeniden yükleyerek doğru panele geç.
  useEffect(() => {
    if (state.redirectTo) window.location.assign(state.redirectTo);
  }, [state.redirectTo]);
  const redirecting = !!state.redirectTo;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />

      <div>
        <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">
          Kullanıcı adı
        </label>
        <input
          name="username"
          defaultValue={state.username}
          required
          autoFocus
          autoComplete="username"
          className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2.5 text-sm outline-none focus:border-brand-500"
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
          autoComplete="current-password"
          className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2.5 text-sm outline-none focus:border-brand-500"
        />
      </div>

      {state.error && <p className="text-xs text-brand-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending || redirecting}
        className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {pending || redirecting ? "Giriş yapılıyor..." : "Giriş Yap"}
      </button>
    </form>
  );
}
