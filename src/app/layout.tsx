import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { GlobalUiBehaviors } from "@/components/ui/GlobalUiBehaviors";
import { MediaLightbox } from "@/components/ui/MediaLightbox";
import { AppSplash, SPLASH_BOOT_SCRIPT } from "@/components/ui/AppSplash";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "2 Key idea | Görev & Puantaj",
  description: "Görev takibi ve puantaj/maaş hesaplama paneli",
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ff2424" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="tr"
      className={`${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Açılış animasyonu: ilk boyamadan önce ekranı kaplar (bkz. AppSplash). */}
        {/* Düz satır içi betik: sayfa çizilmeden önce çalışır (next/script telefonda sayfa göründükten sonra çalışıyordu). */}
        <script dangerouslySetInnerHTML={{ __html: SPLASH_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-(--color-bg) text-(--color-text)">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          {children}
          <GlobalUiBehaviors />
          <MediaLightbox />
          <AppSplash />
        </ThemeProvider>
      </body>
    </html>
  );
}
