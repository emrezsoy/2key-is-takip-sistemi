import { auth } from "@/auth";
import { NextResponse } from "next/server";

// /radyo-tv: ofisteki TV ekranı, gizli bağlantıyla (token) açılır.
const PUBLIC_PATHS = ["/giris", "/radyo-tv/"];
const PORTAL_PREFIX = "/panel";
// Müşteri tarafının ikinci bölümü: Mesaj Otomasyonu uygulaması (/mesaj).
const PORTAL_PREFIXES = [PORTAL_PREFIX, "/mesaj"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  const isLoggedIn = !!req.auth;
  const isClient = req.auth?.user?.role === "CLIENT";
  const inPortal = PORTAL_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!isLoggedIn && !isPublic) {
    const url = new URL("/giris", req.nextUrl.origin);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  if (isLoggedIn && pathname === "/giris") {
    return NextResponse.redirect(new URL(isClient ? PORTAL_PREFIX : "/", req.nextUrl.origin));
  }

  // Müşteri hesapları sadece müşteri panelini, ekip hesapları sadece ekip panelini görür.
  if (isLoggedIn && isClient && !inPortal) {
    return NextResponse.redirect(new URL(PORTAL_PREFIX, req.nextUrl.origin));
  }
  if (isLoggedIn && !isClient && inPortal) {
    return NextResponse.redirect(new URL("/", req.nextUrl.origin));
  }

  // Mesaj Otomasyonu'nu kullanan müşteri telefondan açınca doğrudan mesaj uygulamasına iner
  // (çerez /mesaj açılınca yazılır, "Sisteme dön" ile silinir).
  if (
    isClient &&
    pathname === PORTAL_PREFIX &&
    req.cookies.get("dm_home")?.value === "1" &&
    /Mobi|Android|iPhone|iPad/i.test(req.headers.get("user-agent") ?? "")
  ) {
    return NextResponse.redirect(new URL("/mesaj", req.nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|brand|icons|manifest.webmanifest|sw.js).*)",
  ],
};
