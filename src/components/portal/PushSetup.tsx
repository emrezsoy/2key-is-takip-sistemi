"use client";

import { useEffect, useState, useTransition } from "react";
import { BellRing, Download, Share } from "lucide-react";
import { removePushSubscription, savePushSubscription, sendTestPush } from "@/lib/actions/portal";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void> };

/** Service worker kaydı + "uygulamayı yükle" + telefona bildirim açma/kapama. */
export function PushSetup({ vapidPublicKey }: { vapidPublicKey: string }) {
  const [supported, setSupported] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [ios, setIos] = useState(false);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const iosDevice = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const ok = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

    const onInstall = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onInstall);

    // Başlangıç durumunu tarayıcıdan okuyup state'e yansıtıyoruz (dış sistemle eşitleme).
    /* eslint-disable react-hooks/set-state-in-effect */
    setIos(iosDevice);
    setStandalone(isStandalone);
    setSupported(ok);
    if (ok) {
      setPermission(Notification.permission);
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then((reg) => reg.pushManager.getSubscription())
        .then((sub) => setSubscribed(!!sub))
        .catch(() => {});
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => window.removeEventListener("beforeinstallprompt", onInstall);
  }, []);

  const enable = () =>
    startTransition(async () => {
      setMessage(null);
      try {
        const perm = await Notification.requestPermission();
        setPermission(perm);
        if (perm !== "granted") {
          setMessage("Bildirim izni verilmedi. Tarayıcı/telefon ayarlarından izin verebilirsiniz.");
          return;
        }
        const reg = await navigator.serviceWorker.ready;
        const sub =
          (await reg.pushManager.getSubscription()) ??
          (await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
          }));
        await savePushSubscription(JSON.parse(JSON.stringify(sub)));
        setSubscribed(true);
        setMessage("Bildirimler bu cihazda açıldı.");
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Bildirim açılamadı.");
      }
    });

  const disable = () =>
    startTransition(async () => {
      setMessage(null);
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await removePushSubscription(sub.endpoint);
          await sub.unsubscribe();
        }
        setSubscribed(false);
        setMessage("Bildirimler bu cihazda kapatıldı.");
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Bildirim kapatılamadı.");
      }
    });

  const test = () =>
    startTransition(async () => {
      setMessage(null);
      try {
        await sendTestPush();
        setMessage("Deneme bildirimi gönderildi.");
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Gönderilemedi.");
      }
    });

  return (
    <div className="space-y-4">
      <section data-tour="install" className="scroll-mt-24 rounded-xl border border-(--color-border) bg-(--color-surface) p-4">
        <h3 className="flex items-center gap-2 text-sm font-bold">
          <Download size={15} /> Telefona uygulama olarak ekle
        </h3>
        {standalone ? (
          <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-300">Uygulama bu cihaza kurulu, uygulama olarak açıyorsunuz.</p>
        ) : installEvent ? (
          <button
            type="button"
            onClick={() => void installEvent.prompt()}
            className="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Ana ekrana ekle
          </button>
        ) : ios ? (
          <p className="mt-2 flex flex-wrap items-center gap-1 text-sm text-(--color-text-muted)">
            iPhone&apos;da Safari&apos;de <Share size={14} className="inline" /> Paylaş düğmesine dokunun, ardından{" "}
            <strong>&quot;Ana Ekrana Ekle&quot;</strong> seçin. Bildirimler için uygulamayı ana ekrandan açmanız gerekir.
          </p>
        ) : (
          <p className="mt-2 text-sm text-(--color-text-muted)">
            Tarayıcı menüsünden (⋮) <strong>&quot;Ana ekrana ekle&quot;</strong> veya <strong>&quot;Uygulamayı yükle&quot;</strong> seçeneğini kullanın.
          </p>
        )}
      </section>

      <section className="rounded-xl border border-(--color-border) bg-(--color-surface) p-4">
        <h3 className="flex items-center gap-2 text-sm font-bold">
          <BellRing size={15} /> Telefona bildirim
        </h3>
        {!supported ? (
          <p className="mt-2 text-sm text-(--color-text-muted)">
            Bu tarayıcı anlık bildirimi desteklemiyor.{" "}
            {ios && "iPhone'da önce uygulamayı ana ekrana ekleyip oradan açın."}
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {subscribed ? (
              <>
                <span className="text-sm text-emerald-700 dark:text-emerald-300">Bu cihazda açık</span>
                <button type="button" disabled={pending} onClick={test} className="rounded-lg border border-(--color-border) px-3 py-1.5 text-xs font-semibold hover:bg-(--color-surface-muted)">
                  Deneme gönder
                </button>
                <button type="button" disabled={pending} onClick={disable} className="rounded-lg px-3 py-1.5 text-xs font-medium text-(--color-text-muted) hover:text-brand-600">
                  Kapat
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={pending || permission === "denied"}
                onClick={enable}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
              >
                Bildirimleri aç
              </button>
            )}
            {permission === "denied" && (
              <span className="text-xs text-brand-600">Bildirimler tarayıcıdan engellenmiş; ayarlardan izin verin.</span>
            )}
          </div>
        )}
        {message && <p className="mt-2 text-xs text-(--color-text-muted)">{message}</p>}
      </section>
    </div>
  );
}
