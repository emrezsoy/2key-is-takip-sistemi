import { auth } from "@/auth";
import { NextResponse } from "next/server";

// /radyo-tv: ofisteki TV ekranı, gizli bağlantıyla (token) açılır.
const PUBLIC_PATHS = ["/giris", "/radyo-tv/"];
const PORTAL_PREFIX = "/panel";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  const isLoggedIn = !!req.auth;
  const isClient = req.auth?.user?.role === "CLIENT";
  const inPortal = pathname === PORTAL_PREFIX || pathname.startsWith(`${PORTAL_PREFIX}/`);

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

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|brand|icons|manifest.webmanifest|sw.js).*)",
  ],
};
