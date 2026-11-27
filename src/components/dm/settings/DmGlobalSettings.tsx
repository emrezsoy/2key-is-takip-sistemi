"use client";

import { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import {
  checkDmMetaAction,
  removeAiKeyAction,
  removeDmMetaToken,
  revealDmVerifyToken,
  saveAiDefaultsAction,
  saveDmAppAction,
  saveAiKeyAction,
  saveDmMetaToken,
  testAiModel,
} from "@/lib/actions/dmSettings";
import { useAction } from "../useAction";
import { Feedback } from "../Feedback";
import { btnPrimary, btnSecondary, inputCls, labelCls } from "../ui";

type Props = {
  metaConnected: boolean;
  appConfigured: boolean;
  appId: string | null;
  verifyConfigured: boolean;
  webhookUrl: string;
  worker: { ok: boolean; mode?: string; error?: string };
  keys: Record<"gemini" | "anthropic" | "openai", boolean>;
  defaults: Record<string, string>;
};

const Ok = ({ ok, children }: { ok: boolean; children: React.ReactNode }) => (
  <p className="flex items-center gap-1.5 text-sm">
    {ok ? <CheckCircle2 size={15} className="text-emerald-600" /> : <XCircle size={15} className="text-rose-500" />}
    {children}
  </p>
);

const PROVIDERS = [
  { key: "gemini", label: "Google Gemini", hint: "aistudio.google.com → Get API key (faturalandırması açık proje). Metin cevap ve görsel/video analizi için." },
  { key: "anthropic", label: "Anthropic (Claude)", hint: "platform.claude.com → API Keys. Kurulum analizi (Claude Sonnet 5.5) ve isteğe bağlı metin cevap (Claude Haiku 5.5)." },
  { key: "openai", label: "OpenAI", hint: "platform.openai.com → API keys. Sesli kurulum asistanı (Realtime)." },
] as const;

const JOBS = [
  { key: "text", label: "Metin cevap" },
  { key: "media", label: "Görsel / video analizi" },
  { key: "classify", label: "Sınıflandırma / takip" },
  { key: "setup", label: "Kurulum analizi" },
  { key: "embedding", label: "Ürün arama (embedding)" },
] as const;

function KeyRow({ p, has }: { p: (typeof PROVIDERS)[number]; has: boolean }) {
  const [key, setKey] = useState("");
  const { pending, error, info, run } = useAction();
  return (
    <div className="space-y-1.5 border-b border-(--color-border) py-3 last:border-0">
      <Ok ok={has}>
        <span className="font-semibold">{p.label}</span> {has ? "anahtarı kayıtlı" : "anahtarı yok"}
      </Ok>
      <p className="text-[11px] text-(--color-text-muted)">{p.hint}</p>
      <div className="flex gap-2">
        <input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} className={inputCls} placeholder={has ? "Yeni anahtarla değiştir" : "API anahtarını yapıştırın"} />
        <button type="button" disabled={pending || !key.trim()} onClick={() => run(() => saveAiKeyAction(p.key, key), "Kaydedildi (şifreli).", () => setKey(""))} className={btnSecondary}>
          Kaydet
        </button>
        {has && (
          <button type="button" disabled={pending} onClick={() => run(() => removeAiKeyAction(p.key), "Silindi.")} className="text-xs text-(--color-text-muted) hover:text-brand-600">
            Sil
          </button>
        )}
      </div>
      <Feedback error={error} info={info} />
    </div>
  );
}

/** Meta mesaj uygulamasının App ID / App Secret bilgisi ve Meta'ya girilecek webhook adresi + doğrulama anahtarı. */
function AppAndWebhook({ appId, webhookUrl }: { appId: string | null; webhookUrl: string }) {
  const [id, setId] = useState(appId ?? "");
  const [secret, setSecret] = useState("");
  const [verify, setVerify] = useState<string | null>(null);
  const { pending, error, info, run } = useAction();
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">Meta mesaj uygulaması</h3>
      <p className="text-xs text-(--color-text-muted)">developers.facebook.com → uygulama → Uygulama ayarları → Temel: App ID ve App Secret.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className={labelCls}>App ID</label>
          <input value={id} onChange={(e) => setId(e.target.value)} className={inputCls} inputMode="numeric" />
        </div>
        <div>
          <label className={labelCls}>App Secret</label>
          <input type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} className={inputCls} placeholder={appId ? "Değiştirmek için yapıştırın" : ""} />
        </div>
      </div>
      <button type="button" disabled={pending || !id.trim() || !secret.trim()} onClick={() => run(() => saveDmAppAction(id, secret), "Kaydedildi (şifreli).", () => setSecret(""))} className={btnSecondary}>
        Kaydet
      </button>
      <div className="space-y-1 rounded-lg bg-(--color-surface-muted) p-3 text-xs">
        <p className="font-semibold">Meta&apos;da Webhook ayarına girilecekler (Messenger ve Instagram ürünleri):</p>
        <p>
          Geri çağırma URL&apos;si: <code className="select-all">{webhookUrl}</code>
        </p>
        <p className="flex flex-wrap items-center gap-2">
          Doğrulama belirteci: {verify ? <code className="select-all break-all">{verify}</code> : <span>••••••••</span>}
          {verify ? (
            <button type="button" onClick={() => void navigator.clipboard.writeText(verify)} className="font-semibold text-brand-600">
              Kopyala
            </button>
          ) : (
            <button type="button" disabled={pending} onClick={() => run(async () => setVerify(await revealDmVerifyToken()))} className="font-semibold text-brand-600">
              Göster
            </button>
          )}
        </p>
      </div>
      <Feedback error={error} info={info} />
    </section>
  );
}

export function DmGlobalSettings(props: Props) {
  const [token, setToken] = useState("");
  const [perm, setPerm] = useState<{ ok: boolean; missing: string[]; error?: string } | null>(null);
  const [defaults, setDefaults] = useState(props.defaults);
  const [testResult, setTestResult] = useState<string | null>(null);
  const meta = useAction();
  const def = useAction();

  return (
    <div className="space-y-5 rounded-xl border border-(--color-border) bg-(--color-surface) p-5">
      <div>
        <h2 className="text-sm font-bold">Mesaj Otomasyonu</h2>
        <p className="text-xs text-(--color-text-muted)">Instagram / Facebook mesajlarını AI ile yanıtlama için bağlantılar. Anahtarlar veritabanında şifreli saklanır.</p>
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Durum</h3>
        <Ok ok={props.worker.ok}>
          Arka plan servisi (dm-worker) {props.worker.ok ? `çalışıyor${props.worker.mode === "fake" ? " · SAHTE mod (mesajlar Meta'ya gitmez)" : ""}` : `çalışmıyor${props.worker.error ? ` (${props.worker.error})` : ""}`}
        </Ok>
        <Ok ok={props.appConfigured}>Meta mesaj uygulaması {props.appId ? `(App ID ${props.appId})` : "bilgileri girilmemiş"}</Ok>
      </section>

      <AppAndWebhook appId={props.appId} webhookUrl={props.webhookUrl} />

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Meta (mesaj uygulaması) System User token&apos;ı</h3>
        <Ok ok={props.metaConnected}>{props.metaConnected ? "Token kayıtlı" : "Token girilmemiş"}</Ok>
        <div className="flex gap-2">
          <input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} className={inputCls} placeholder="Kalıcı System User token'ı" />
          <button type="button" disabled={meta.pending || !token.trim()} onClick={() => meta.run(async () => { setPerm(await saveDmMetaToken(token)); setToken(""); }, "Token kaydedildi.")} className={btnSecondary}>
            Kaydet
          </button>
        </div>
        <div className="flex gap-3">
          <button type="button" disabled={meta.pending} onClick={() => meta.run(async () => setPerm(await checkDmMetaAction()))} className="text-xs font-semibold text-brand-600">
            İzinleri kontrol et
          </button>
          {props.metaConnected && (
            <button type="button" disabled={meta.pending} onClick={() => meta.run(() => removeDmMetaToken(), "Token silindi.")} className="text-xs text-(--color-text-muted) hover:text-brand-600">
              Token&apos;ı sil
            </button>
          )}
        </div>
        {perm && (
          <p className={`text-xs ${perm.ok ? "text-emerald-700 dark:text-emerald-300" : "text-rose-600"}`}>
            {perm.ok ? "Tüm gerekli izinler var." : perm.error ?? `Eksik izinler: ${perm.missing.join(", ")}`}
          </p>
        )}
        <Feedback error={meta.error} info={meta.info} />
      </section>

      <section>
        <h3 className="text-sm font-semibold">AI anahtarları</h3>
        {PROVIDERS.map((p) => (
          <KeyRow key={p.key} p={p} has={props.keys[p.key]} />
        ))}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Varsayılan modeller</h3>
        <p className="text-xs text-(--color-text-muted)">&quot;sağlayıcı:model&quot; biçiminde. Müşteri bazında Mesaj Otomasyonu → müşteri → Ayarlar&apos;dan değiştirilebilir.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {JOBS.map((j) => (
            <div key={j.key}>
              <label className={labelCls}>{j.label}</label>
              <input value={defaults[j.key] ?? ""} onChange={(e) => setDefaults({ ...defaults, [j.key]: e.target.value })} className={inputCls} />
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={def.pending} onClick={() => def.run(() => saveAiDefaultsAction(defaults), "Kaydedildi.")} className={btnPrimary}>
            Kaydet
          </button>
          <button type="button" disabled={def.pending} onClick={() => def.run(async () => { const r = await testAiModel(defaults.text); setTestResult(`${r.model}: ${r.text}`); })} className={btnSecondary}>
            Metin modelini dene
          </button>
          <Feedback error={def.error} info={def.info} />
        </div>
        {testResult && <p className="text-xs text-emerald-700 dark:text-emerald-300">{testResult}</p>}
      </section>
    </div>
  );
}
