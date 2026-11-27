"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { completePortalTour } from "@/lib/actions/portal";
import { InstallPopup, type BeforeInstallPromptEvent } from "./InstallPopup";

type Step = {
  id: string;
  /** Menüdeki öğenin data-tour değeri ya da özel hedef. */
  target?: string;
  href?: string;
  title: string;
  body: string;
};

export const TOUR_EVENT = "portal-tour-start";
const INSTALL_SEEN_KEY = "portal-install-popup-seen";

function buildSteps(o: { social: boolean; ads: boolean; dm?: boolean }): Step[] {
  const s: Step[] = [
    {
      id: "hos",
      title: "Hoş geldiniz! 👋",
      body: "Müşteri panelinizi birkaç adımda tanıtalım. Sadece “İleri” düğmesine basmanız yeterli; her adımda o bölümü açıp ne işe yaradığını anlatacağız.",
    },
    {
      id: "ozet",
      target: "/panel",
      href: "/panel",
      title: "Özet",
      body: "Açılış sayfanız. Devam eden işleriniz, onay bekleyen talepleriniz, yaklaşan paylaşımlarınız ve bakiyeniz tek bakışta burada.",
    },
    {
      id: "isler",
      target: "/panel/isler",
      href: "/panel/isler",
      title: "İşlerim",
      body: "Sizin için yürüttüğümüz işlerin listesi. Hangisi sırada, hangisi devam ediyor, hangisi tamamlandı buradan takip edersiniz.",
    },
  ];
  if (o.social) {
    s.push(
      {
        id: "talepler",
        target: "/panel/talepler",
        href: "/panel/talepler",
        title: "Talepler",
        body: "Bizden yeni bir iş istemek için buradan talep oluşturursunuz: başlık, iş detayı, referans görsel, not ve aciliyet. Ekibimiz onaylayınca talebiniz işe dönüşür ve durumunu buradan izlersiniz.",
      },
      {
        id: "icerik",
        target: "/panel/icerik",
        href: "/panel/icerik",
        title: "İçerik",
        body: "Sosyal medya içeriklerinizi tablo ya da düz yazı olarak yazabilir, görselleri editöre sürükleyip bırakabilirsiniz. Bizim sizin için hazırladığımız içerikler de burada görünür.",
      }
    );
  }
  if (o.ads) {
    s.push({
      id: "reklamlar",
      target: "/panel/reklamlar",
      href: "/panel/reklamlar",
      title: "Reklamlar",
      body: "Ajansımızın yönettiği reklamların harcama, tıklama ve sonuç özetini grafiklerle görürsünüz. Bu bölüm sadece görüntüleme içindir.",
    });
  }
  if (o.social) {
    s.push({
      id: "takvim",
      target: "/panel/takvim",
      href: "/panel/takvim",
      title: "Paylaşım Takvimi",
      body: "Hangi gün hangi içeriğin paylaşılacağını görseliyle birlikte takvimde görürsünüz; paylaşılanlar işaretlenir. Bu bölüm de sadece görüntüleme içindir.",
    });
  }
  if (o.dm) {
    s.push({
      id: "mesajlar",
      target: "/panel/mesajlar",
      href: "/panel/mesajlar",
      title: "Mesajlar",
      body: "Instagram ve Facebook mesajlarınızı AI asistanınız yanıtlar. Buradan tüm konuşmaları görür, istediğinizde devralıp kendiniz cevap verir, AI'ı açıp kapatır ve kalan kredinizi takip edersiniz.",
    });
  }
  s.push(
    {
      id: "odemeler",
      target: "/panel/odemeler",
      href: "/panel/odemeler",
      title: "Ödemeler",
      body: "Aylık ödemeleriniz, ödenen ve kalan tutarlar ile varsa gecikmiş bakiyeniz burada. Tutarlar KDV dahildir.",
    },
    {
      id: "hesabim",
      target: "/panel/hesabim",
      href: "/panel/hesabim",
      title: "Hesabım",
      body: "Şifrenizi değiştirebilir, koyu modu açabilir ve telefona bildirimleri buradan yönetebilirsiniz.",
    },
    {
      id: "kur",
      target: "install",
      href: "/panel/hesabim",
      title: "Son adım: Telefonunuza ekleyin 📱",
      body: "Paneli bir uygulama gibi telefonunuzun ana ekranına ekleyebilirsiniz; tek dokunuşla açılır ve bildirimleri alırsınız. “Bitir”e bastığınızda nasıl ekleyeceğinizi gösteren bir pencere açılacak.",
    }
  );
  return s;
}

type Rect = { top: number; left: number; width: number; height: number };

/** İlk giriş tanıtım turu: gerçek sayfaları sırayla açıp menüdeki öğeyi vurgular, konuşma balonuyla anlatır. */
export function PortalTour({ autoStart, social, ads, dm = false }: { autoStart: boolean; social: boolean; ads: boolean; dm?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const steps = useMemo(() => buildSteps({ social, ads, dm }), [social, ads, dm]);
  const [open, setOpen] = useState(autoStart);
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [desktop, setDesktop] = useState(false);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(false);
  const [ios, setIos] = useState(false);
  const [showInstall, setShowInstall] = useState(false);
  const finished = useRef(false);
  // Kurulum penceresi sadece ilk girişteki turun sonunda gösterilir (Hesabım'dan yeniden başlatılan tur için değil).
  const firstRun = useRef(autoStart);

  const step = steps[idx];
  const last = idx === steps.length - 1;

  // Kurulum olayı sayfa açılır açılmaz yakalanmalı (ilk adımda kaçmasın); durum bilgileri tarayıcıdan okunur.
  useEffect(() => {
    const onInstall = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    const onStart = () => {
      finished.current = false;
      firstRun.current = false;
      setIdx(0);
      setOpen(true);
    };
    window.addEventListener("beforeinstallprompt", onInstall);
    window.addEventListener(TOUR_EVENT, onStart);
    /* eslint-disable react-hooks/set-state-in-effect */
    setIos(/iPad|iPhone|iPod/.test(navigator.userAgent));
    setStandalone(
      window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => {
      window.removeEventListener("beforeinstallprompt", onInstall);
      window.removeEventListener(TOUR_EVENT, onStart);
    };
  }, []);

  // Adım değişince ilgili sayfaya geç.
  useEffect(() => {
    if (open && step.href && pathname !== step.href) router.push(step.href);
  }, [open, step, pathname, router]);

  // Hedef öğenin konumunu izle (sayfa geçişi/yeniden boyutlandırma sonrası).
  const measure = useCallback(() => {
    setDesktop(window.matchMedia("(min-width: 1024px)").matches);
    if (!step.target) return setRect(null);
    const nodes = document.querySelectorAll<HTMLElement>(`[data-tour="${step.target}"]`);
    for (const el of nodes) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
        return;
      }
    }
    setRect(null);
  }, [step]);

  useEffect(() => {
    if (!open) return;
    const t = setInterval(measure, 200);
    window.addEventListener("resize", measure);
    return () => {
      clearInterval(t);
      window.removeEventListener("resize", measure);
    };
  }, [open, measure]);

  // Telefonda menüde olmayan öğe için hedef görünür değilse özel hedefi (kurulum kutusu) ekrana kaydır.
  useEffect(() => {
    if (open && step.target === "install") {
      const t = setTimeout(
        () => document.querySelector('[data-tour="install"]')?.scrollIntoView({ block: "start", behavior: "smooth" }),
        400
      );
      return () => clearTimeout(t);
    }
  }, [open, step]);

  const finish = () => {
    setOpen(false);
    if (finished.current) return;
    finished.current = true;
    void completePortalTour().catch(() => {});
    if (pathname !== "/panel") router.push("/panel");

    // İlk turun sonunda bir kereliğine "telefona uygulama olarak ekle" penceresi (kurulu değilse).
    if (firstRun.current && !standalone) {
      let seen = false;
      try {
        seen = localStorage.getItem(INSTALL_SEEN_KEY) === "1";
      } catch {
        // depolama kapalıysa pencere yine bir kez gösterilir
      }
      if (!seen) setShowInstall(true);
    }
    firstRun.current = false;
  };

  const closeInstall = () => {
    setShowInstall(false);
    try {
      localStorage.setItem(INSTALL_SEEN_KEY, "1");
    } catch {
      // yok sayılır
    }
  };

  if (!open) {
    return showInstall ? <InstallPopup installEvent={installEvent} ios={ios} onClose={closeInstall} /> : null;
  }

  const isNavTarget = !!rect && step.target?.startsWith("/panel");
  const side = isNavTarget && desktop; // masaüstünde menü öğesinin yanında
  const pad = 6;

  // Masaüstünde ana içerikteki hedefin (ör. kurulum kutusu) altına konur ki vurgulanan alanı kapatmasın.
  const below = !!rect && !isNavTarget && desktop;
  const balloonStyle: React.CSSProperties | undefined =
    side && rect
      ? { top: Math.min(Math.max(rect.top - 8, 16), window.innerHeight - 300), left: rect.left + rect.width + 20 }
      : below && rect
        ? { top: rect.top + rect.height + pad + 14, left: Math.min(Math.max(rect.left, 16), window.innerWidth - 400) }
        : undefined;
  const placed = side || below;

  return (
    <div className="fixed inset-0 z-[80]">
      {/* Tıklamaları engelleyen katman + vurgu deliği */}
      <div className="absolute inset-0" aria-hidden />
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-xl ring-2 ring-brand-500 transition-all duration-200"
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.6)",
          }}
        />
      ) : (
        <div className="pointer-events-none absolute inset-0 bg-black/60" />
      )}

      <div
        role="dialog"
        aria-label="Panel tanıtımı"
        style={balloonStyle}
        className={`absolute w-[calc(100%-1.5rem)] max-w-sm rounded-2xl border border-(--color-border) bg-(--color-surface) p-5 text-(--color-text) shadow-2xl ${
          placed
            ? ""
            : "bottom-20 left-1/2 -translate-x-1/2 lg:bottom-auto lg:top-1/2 lg:-translate-y-1/2"
        }`}
      >
        {side && (
          <span className="absolute -left-2 top-6 h-4 w-4 rotate-45 border-b border-l border-(--color-border) bg-(--color-surface)" />
        )}
        <button
          type="button"
          onClick={finish}
          aria-label="Turu kapat"
          className="absolute right-3 top-3 rounded-full p-1 text-(--color-text-muted) hover:bg-(--color-surface-muted)"
        >
          <X size={16} />
        </button>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-600">
          {idx + 1} / {steps.length}
        </p>
        <h2 className="mt-1 pr-6 text-base font-bold">{step.title}</h2>
        <p className="mt-1.5 text-sm text-(--color-text-muted)">{step.body}</p>

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setIdx((i) => Math.max(0, i - 1))}
            disabled={idx === 0}
            className="flex items-center gap-1 rounded-lg px-2 py-2 text-sm font-medium text-(--color-text-muted) hover:text-(--color-text) disabled:invisible"
          >
            <ChevronLeft size={16} /> Geri
          </button>
          {!last && (
            <button type="button" onClick={finish} className="text-xs text-(--color-text-muted) hover:text-brand-600">
              Turu geç
            </button>
          )}
          <button
            type="button"
            onClick={() => (last ? finish() : setIdx((i) => i + 1))}
            className="flex items-center gap-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            {last ? "Bitir" : "İleri"} {!last && <ChevronRight size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}
