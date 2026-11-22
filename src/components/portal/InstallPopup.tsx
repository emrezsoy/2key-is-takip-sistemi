"use client";

import { useState } from "react";
import { Check, Copy, Download, Share, Smartphone, X } from "lucide-react";

export type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void> };

const Step = ({ n, children }: { n: number; children: React.ReactNode }) => (
  <li className="flex gap-2.5">
    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-white">
      {n}
    </span>
    <span className="min-w-0 flex-1 text-sm text-(--color-text-muted)">{children}</span>
  </li>
);

/** Tanıtım turu bitince bir kereliğine açılan "telefona uygulama olarak ekle" penceresi:
 * İndir düğmesi + altında iPhone (Safari) adımları. */
export function InstallPopup({
  installEvent,
  ios,
  onClose,
}: {
  installEvent: BeforeInstallPromptEvent | null;
  ios: boolean;
  onClose: () => void;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [iosOpen, setIosOpen] = useState(ios);
  const [copied, setCopied] = useState(false);

  const download = async () => {
    setMsg(null);
    if (installEvent) {
      try {
        await installEvent.prompt();
        onClose();
      } catch {
        setMsg("Eklenemedi. Tarayıcı menüsünden (⋮) “Ana ekrana ekle” seçeneğini deneyin.");
      }
      return;
    }
    if (ios) {
      setIosOpen(true);
      setMsg("iPhone'da bu düğme çalışmaz; lütfen aşağıdaki adımları izleyin.");
      return;
    }
    setMsg(
      "Tarayıcınız doğrudan eklemeyi desteklemiyor. Tarayıcı menüsünden (⋮) “Ana ekrana ekle” veya “Uygulamayı yükle” seçeneğini kullanın. iPhone kullanıyorsanız aşağıdaki adımlara bakın."
    );
  };

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setMsg("Adres kopyalanamadı; Safari'nin adres çubuğuna elle yazabilirsiniz.");
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 p-3 sm:items-center">
      <div
        role="dialog"
        aria-label="Telefona uygulama olarak ekle"
        className="relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-(--color-border) bg-(--color-surface) p-5 text-(--color-text) shadow-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Kapat"
          className="absolute right-3 top-3 rounded-full p-1 text-(--color-text-muted) hover:bg-(--color-surface-muted)"
        >
          <X size={16} />
        </button>

        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-600/10 text-brand-600">
          <Smartphone size={22} />
        </div>
        <h2 className="mt-3 pr-6 text-lg font-bold">Paneli telefonunuza ekleyin</h2>
        <p className="mt-1 text-sm text-(--color-text-muted)">
          Panelimizi bir uygulama gibi ana ekranınıza ekleyin: tek dokunuşla açılır, işleriniz ve ödemelerinizle ilgili bildirimleri
          kaçırmazsınız.
        </p>

        <button
          type="button"
          onClick={download}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-base font-semibold text-white hover:bg-brand-700"
        >
          <Download size={18} /> İndir
        </button>
        {msg && <p className="mt-2 text-xs text-(--color-text-muted)">{msg}</p>}

        <div className="mt-4 rounded-xl border border-(--color-border)">
          <button
            type="button"
            onClick={() => setIosOpen((v) => !v)}
            aria-expanded={iosOpen}
            className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-bold"
          >
            <span>iPhone (iOS) kullanıyorsanız</span>
            <span className="text-xs font-medium text-brand-600">{iosOpen ? "Gizle" : "Adımları göster"}</span>
          </button>
          {iosOpen && (
            <div className="space-y-3 border-t border-(--color-border) px-4 py-3">
              <p className="text-xs text-(--color-text-muted)">
                iPhone&apos;da &quot;İndir&quot; düğmesi çalışmaz; uygulamayı Safari tarayıcısından şu adımlarla eklemeniz gerekir:
              </p>
              <ol className="space-y-3">
                <Step n={1}>
                  Bu paneli <strong className="text-(--color-text)">Safari</strong> ile açın (Chrome, WhatsApp veya e-posta içinden açıldıysa adresi
                  kopyalayıp Safari&apos;ye yapıştırın).
                  <span className="mt-1.5 flex items-center gap-2">
                    <code className="min-w-0 truncate rounded bg-(--color-surface-muted) px-2 py-1 text-xs text-(--color-text)">
                      {typeof window !== "undefined" ? window.location.host : ""}
                    </code>
                    <button
                      type="button"
                      onClick={copyAddress}
                      className="flex shrink-0 items-center gap-1 rounded-lg border border-(--color-border) px-2 py-1 text-xs font-semibold hover:bg-(--color-surface-muted)"
                    >
                      {copied ? <Check size={12} /> : <Copy size={12} />}
                      {copied ? "Kopyalandı" : "Kopyala"}
                    </button>
                  </span>
                </Step>
                <Step n={2}>
                  Ekranın altındaki <Share size={14} className="mx-0.5 inline align-text-bottom" />{" "}
                  <strong className="text-(--color-text)">Paylaş</strong> simgesine (kare ve yukarı ok) dokunun.
                </Step>
                <Step n={3}>
                  Açılan menüyü yukarı kaydırıp <strong className="text-(--color-text)">&quot;Ana Ekrana Ekle&quot;</strong> seçeneğine dokunun.
                </Step>
                <Step n={4}>
                  Sağ üstteki <strong className="text-(--color-text)">&quot;Ekle&quot;</strong> düğmesine dokunun.
                </Step>
                <Step n={5}>
                  Ana ekranınızda oluşan <strong className="text-(--color-text)">2 Key idea</strong> simgesinden paneli açın. Bildirimlerin
                  gelmesi için paneli her zaman bu simgeden açın.
                </Step>
              </ol>
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <button type="button" onClick={onClose} className="text-xs font-medium text-(--color-text-muted) hover:text-brand-600">
            Daha sonra
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-(--color-border) px-4 py-2 text-sm font-semibold hover:bg-(--color-surface-muted)"
          >
            Tamam
          </button>
        </div>
        <p className="mt-2 text-center text-[11px] text-(--color-text-muted)">
          Bunu sonra da Hesabım sayfasındaki &quot;Telefona uygulama olarak ekle&quot; bölümünden yapabilirsiniz.
        </p>
      </div>
    </div>
  );
}
