"use client";

import { useState } from "react";
import { saveClientDmSettings, subscribeClientPage } from "@/lib/actions/dmConfig";
import { useAction } from "../useAction";
import { Feedback } from "../Feedback";
import { btnPrimary, btnSecondary, cardCls, inputCls, labelCls } from "../ui";

type Cfg = {
  textModel: string | null; mediaModel: string | null; classifyModel: string | null; setupModel: string | null;
  waitTextSec: number; waitMediaSec: number; waitMaxSec: number; historyLimit: number;
  followUpEnabled: boolean; followUpAutoApprove: boolean; followUpSilenceMin: number; followUpNotifyTime: string;
  followUpMorningStart: string; followUpMorningEnd: string; followUpEveningStart: string; followUpEveningEnd: string;
  quietStart: string; quietEnd: string; appointmentDurationMin: number; appointmentGapMin: number;
  negativeLimit: number | null; testSpendsCredit: boolean;
};
type Page = { pageId: string; pageName: string; igUsername: string | null };

function PageRow({ clientId, page }: { clientId: string; page: Page }) {
  const [fields, setFields] = useState<string[] | null>(null);
  const { pending, error, run } = useAction();
  return (
    <li className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
      <span className="font-medium">{page.pageName}</span>
      {page.igUsername && <span className="text-xs text-(--color-text-muted)">@{page.igUsername}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() => run(async () => setFields(await subscribeClientPage(clientId, page.pageId)))}
        className={`${btnSecondary} ml-auto text-xs`}
      >
        Mesajlara abone et
      </button>
      {fields && <span className="w-full text-xs text-emerald-700 dark:text-emerald-300">Abone: {fields.join(", ") || "—"}</span>}
      <span className="w-full">
        <Feedback error={error} info={null} />
      </span>
    </li>
  );
}

export function ClientDmSettings({ clientId, cfg, defaults, pages }: { clientId: string; cfg: Cfg; defaults: Record<string, string>; pages: Page[] }) {
  const { pending, error, info, run } = useAction();
  const num = (name: keyof Cfg, label: string, min: number, max: number) => (
    <div>
      <label className={labelCls}>{label}</label>
      <input name={name} type="number" min={min} max={max} defaultValue={cfg[name] as number} className={inputCls} required />
    </div>
  );
  const time = (name: keyof Cfg, label: string) => (
    <div>
      <label className={labelCls}>{label}</label>
      <input name={name} type="time" defaultValue={cfg[name] as string} className={inputCls} required />
    </div>
  );
  const model = (name: keyof Cfg, label: string, def: string) => (
    <div>
      <label className={labelCls}>{label}</label>
      <input name={name} defaultValue={(cfg[name] as string | null) ?? ""} placeholder={`Varsayılan: ${def}`} className={inputCls} />
    </div>
  );
  return (
    <div className="space-y-4">
      <section className={cardCls}>
        <h3 className="text-sm font-bold">Bağlı sayfalar</h3>
        <p className="mb-1 text-xs text-(--color-text-muted)">
          Sosyal Medya bölümünde bu müşteriye bağlanan Facebook sayfası ve Instagram hesabı. Gerçek mesajların gelmesi için sayfa, mesaj uygulamasına abone edilmelidir
          (Ayarlar&apos;da Meta bağlantısı gerekir).
        </p>
        {pages.length === 0 ? <p className="text-xs text-(--color-text-muted)">Bağlı sayfa yok.</p> : <ul>{pages.map((p) => <PageRow key={p.pageId} clientId={clientId} page={p} />)}</ul>}
      </section>

      <form
        className={`${cardCls} space-y-4`}
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          run(() => saveClientDmSettings(clientId, fd), "Ayarlar kaydedildi.");
        }}
      >
        <div>
          <h3 className="text-sm font-bold">AI modelleri</h3>
          <p className="text-xs text-(--color-text-muted)">&quot;sağlayıcı:model&quot; biçiminde (ör. gemini:gemini-3.6-flash, anthropic:claude-haiku-5-5). Boş bırakılırsa genel varsayılan kullanılır.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {model("textModel", "Metin cevap", defaults.text)}
          {model("mediaModel", "Görsel / video analizi", defaults.media)}
          {model("classifyModel", "Sınıflandırma / takip", defaults.classify)}
          {model("setupModel", "Kurulum analizi", defaults.setup)}
        </div>

        <h3 className="text-sm font-bold">Bekleme ve toplama</h3>
        <div className="grid gap-3 sm:grid-cols-4">
          {num("waitTextSec", "Metinden sonra (sn)", 1, 120)}
          {num("waitMediaSec", "Medyadan sonra (sn)", 1, 300)}
          {num("waitMaxSec", "En fazla (sn)", 5, 600)}
          {num("historyLimit", "Geçmiş mesaj sayısı", 5, 200)}
        </div>

        <h3 className="text-sm font-bold">Takip mesajları</h3>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="followUpEnabled" defaultChecked={cfg.followUpEnabled} className="h-4 w-4" /> Takip mesajları açık
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="followUpAutoApprove" defaultChecked={cfg.followUpAutoApprove} className="h-4 w-4" /> Onay beklemeden gönder
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          {num("followUpSilenceMin", "Sessizlik eşiği (dk)", 30, 1440)}
          {time("followUpNotifyTime", "Onay bildirimi saati")}
          {time("followUpMorningStart", "Sabah aralığı başı")}
          {time("followUpMorningEnd", "Sabah aralığı sonu")}
          {time("followUpEveningStart", "Akşam aralığı başı")}
          {time("followUpEveningEnd", "Akşam aralığı sonu")}
          {time("quietStart", "Gönderim yok: başlangıç")}
          {time("quietEnd", "Gönderim yok: bitiş")}
        </div>

        <h3 className="text-sm font-bold">Randevu ve kredi</h3>
        <div className="grid gap-3 sm:grid-cols-4">
          {num("appointmentDurationMin", "Randevu süresi (dk)", 5, 600)}
          {num("appointmentGapMin", "Randevular arası (dk)", 0, 240)}
          <div>
            <label className={labelCls}>Eksi bakiye limiti</label>
            <input name="negativeLimit" type="number" min={0} max={100} defaultValue={cfg.negativeLimit ?? ""} placeholder="Genel ayar" className={inputCls} />
          </div>
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input type="checkbox" name="testSpendsCredit" defaultChecked={cfg.testSpendsCredit} className="h-4 w-4" /> Test kutusu kredi harcasın
          </label>
        </div>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={pending} className={btnPrimary}>
            Kaydet
          </button>
          <Feedback error={error} info={info} />
        </div>
      </form>
    </div>
  );
}
