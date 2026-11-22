import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/permissions";
import { exchangeCode, syncGoogleAds } from "@/lib/googleAds";

/** Google yetkilendirme dönüşü: kodu yenileme anahtarına çevirir, ilk verileri çeker. */
export async function GET(req: NextRequest) {
  const session = await auth();
  const origin = req.nextUrl.origin;
  const done = (msg: string, ok: boolean) =>
    NextResponse.redirect(`${origin}/reklam-paneli?google=${ok ? "ok" : "hata"}&mesaj=${encodeURIComponent(msg)}`);

  if (!session?.user || !isAdmin(session.user)) return NextResponse.redirect(`${origin}/giris`);

  const jar = await cookies();
  const expected = jar.get("g_ads_state")?.value;
  jar.delete("g_ads_state");
  const state = req.nextUrl.searchParams.get("state");
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");

  if (error) return done(`Google yetkilendirmesi reddedildi: ${error}`, false);
  if (!code || !state || !expected || state !== expected) return done("Yetkilendirme doğrulanamadı, tekrar deneyin.", false);

  try {
    await exchangeCode(code);
  } catch (e) {
    return done(e instanceof Error ? e.message : "Yetkilendirme başarısız.", false);
  }
  try {
    const r = await syncGoogleAds(365);
    return done(`Bağlandı: ${r.accounts} hesap, ${r.campaigns} kampanya alındı.`, true);
  } catch (e) {
    return done(`Bağlandı ama veri çekilemedi: ${e instanceof Error ? e.message : "hata"}`, false);
  }
}
