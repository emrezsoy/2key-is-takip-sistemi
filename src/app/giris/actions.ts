"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { prisma } from "@/lib/prisma";

export type LoginState = { error: string | null; redirectTo?: string; username?: string };

/** Sadece site içi, güvenli bir yol kabul edilir ("//evil.com" gibi dış adresler olmaz). */
function safePath(raw: string) {
  return raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/giris") ? raw : "/";
}

export async function loginAction(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const username = String(formData.get("username") ?? "");
  try {
    // Yönlendirmeyi sunucu eylemine bırakmıyoruz: oturum çerezi yazıldıktan sonra tarayıcı
    // sayfayı tamamen yeniden yükler (ilk girişte ekranın değişmeme sorununu önler).
    await signIn("credentials", {
      username,
      password: formData.get("password"),
      redirect: false,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Kullanıcı adı veya şifre hatalı.", username };
    }
    throw error;
  }

  const user = await prisma.user.findUnique({ where: { username }, select: { role: true } });
  const callback = safePath(String(formData.get("callbackUrl") ?? "/"));
  const inPortal = callback === "/panel" || callback.startsWith("/panel/");

  // Müşteri hesapları müşteri paneline, ekip hesapları ekip paneline iner.
  const redirectTo = user?.role === "CLIENT" ? (inPortal ? callback : "/panel") : inPortal ? "/" : callback;
  return { error: null, redirectTo };
}
