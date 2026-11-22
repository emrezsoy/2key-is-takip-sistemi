"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Copy, Loader2, Plus, Trash2 } from "lucide-react";
import { createAdCampaign, getComposerData } from "@/lib/actions/adManage";
import {
  BID_STRATEGIES,
  CONVERSION_EVENTS,
  MESSAGE_DESTINATIONS,
  OBJECTIVES,
  SPECIAL_CATEGORIES,
  newAd,
  newAdSet,
  type AdSetDraft,
  type CampaignDraft,
  type ComposerAccount,
  type ComposerContext,
  type MessageDestination,
  type ObjectiveKey,
} from "@/lib/adsTypes";
import { AdEditor } from "./AdEditor";
import { AudienceEditor } from "./AudienceEditor";
import { Field, Modal, Section, btnGhost, btnPrimary, errorBox, fromLocalInput, inputCls, isoToLocalInput, money, parseMoney } from "./ui";

const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const DAYS = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
const rid = () => Math.random().toString(36).slice(2);
// Pencere kapanır ya da sayfa yenilenirse girilenler kaybolmasın diye taslak tarayıcıda saklanır (oluşturulunca silinir).
const DRAFT_KEY = "adComposerDraft:v1";
type SavedDraft = { accountId: string; draft: CampaignDraft; nameTouched: boolean; savedAt: number };
function readSaved(): SavedDraft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as SavedDraft;
    // 7 günden eski taslak kullanılmaz.
    return v && v.draft && Date.now() - v.savedAt < 7 * 86400e3 ? v : null;
  } catch {
    return null;
  }
}
function clearSaved() {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // yoksay
  }
}

function locLabel(s: AdSetDraft) {
  const l = s.audience.locations;
  if (l.length === 0) return "Türkiye";
  const n = l.map((x) => x.name.replace(/ \(.+\)$/, ""));
  return n.length > 2 ? `${n.slice(0, 2).join(", ")} +${n.length - 2}` : n.join(", ");
}

export function CampaignComposer({ accounts, defaultClientId }: { accounts: ComposerAccount[]; defaultClientId?: string }) {
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setRound((r) => r + 1);
          setOpen(true);
        }}
        className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700"
      >
        <Plus size={15} /> Yeni kampanya
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Yeni Meta kampanyası" size="xl">
        <ComposerForm key={round} accounts={accounts} defaultClientId={defaultClientId} onClose={() => setOpen(false)} />
      </Modal>
    </>
  );
}

function defaultEnd() {
  const d = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  d.setHours(23, 59, 0, 0);
  return d.toISOString();
}

function ComposerForm({ accounts, defaultClientId, onClose }: { accounts: ComposerAccount[]; defaultClientId?: string; onClose: () => void }) {
  const router = useRouter();
  const initial = accounts.find((a) => a.clientId && a.clientId === defaultClientId) ?? accounts[0];
  const [saved] = useState<SavedDraft | null>(() => {
    const v = readSaved();
    return v && accounts.some((a) => a.metaId === v.accountId) ? v : null;
  });
  const [restored, setRestored] = useState(!!saved);
  const [accountId, setAccountId] = useState(saved?.accountId ?? initial?.metaId ?? "");
  const account = accounts.find((a) => a.metaId === accountId);

  const [draft, setDraft] = useState<CampaignDraft>(() => saved?.draft ?? ({
    name: "",
    objective: "MESSAGES",
    destination: "IG",
    pixelId: "",
    conversionEvent: "PURCHASE",
    specialCategory: "",
    budgetLevel: "adset",
    budgetType: "daily",
    campaignBudget: 200,
    bidStrategy: "LOWEST_COST_WITHOUT_CAP",
    spendCap: null,
    abTest: false,
    adsets: [{ ...newAdSet(1), endTime: defaultEnd() }],
    activate: false,
  }));
  const [nameTouched, setNameTouched] = useState(saved?.nameTouched ?? false);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ accountId, draft, nameTouched, savedAt: Date.now() } satisfies SavedDraft));
      } catch {
        // depolama kapalıysa taslak saklanmaz
      }
    }, 400);
    return () => clearTimeout(t);
  }, [accountId, draft, nameTouched]);
  const [activeSet, setActiveSet] = useState(0);
  const [activeAd, setActiveAd] = useState<Record<string, number>>({});
  const set = (patch: Partial<CampaignDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const setAdSet = (i: number, s: AdSetDraft) => setDraft((d) => ({ ...d, adsets: d.adsets.map((x, j) => (j === i ? s : x)) }));

  // Hesap verisi (sayfa, Instagram, medya, pixel, kitle, form): hesap değişince yeniden yüklenir.
  const [loaded, setLoaded] = useState<{ accountId: string; ctx: ComposerContext | null; error: string | null } | null>(null);
  useEffect(() => {
    if (!accountId) return;
    let alive = true;
    getComposerData(accountId).then((r) => {
      if (alive) setLoaded(r.ok ? { accountId, ctx: r.ctx, error: null } : { accountId, ctx: null, error: r.error });
    });
    return () => {
      alive = false;
    };
  }, [accountId]);
  const ctx = loaded?.accountId === accountId ? loaded.ctx : null;
  const ctxError = loaded?.accountId === accountId ? loaded.error : null;
  const [extraAudiences, setExtraAudiences] = useState<ComposerContext["audiences"]>([]);
  const [extraForms, setExtraForms] = useState<ComposerContext["leadForms"]>([]);
  const audiences = [...(ctx?.audiences ?? []), ...extraAudiences.filter((a) => !(ctx?.audiences ?? []).some((x) => x.id === a.id))];
  const ctxFull = ctx ? { ...ctx, leadForms: [...ctx.leadForms, ...extraForms] } : null;

  const autoName = useMemo(() => {
    const now = new Date();
    const obj = OBJECTIVES[draft.objective];
    const what = draft.objective === "MESSAGES" ? `${obj.short} (${MESSAGE_DESTINATIONS[draft.destination].label})` : obj.short;
    return [account?.clientName ?? account?.name ?? "", what, locLabel(draft.adsets[0]), `${MONTHS[now.getMonth()]} ${now.getFullYear()}`].filter(Boolean).join(" | ");
  }, [account, draft.objective, draft.destination, draft.adsets]);
  const finalName = nameTouched ? draft.name : autoName;

  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ activated: boolean; warnings: string[] } | null>(null);
  const special = !!draft.specialCategory;

  const submit = () => {
    setError(null);
    start(async () => {
      const r = await createAdCampaign(accountId, { ...draft, name: finalName });
      if (!r.ok) return setError(r.error);
      clearSaved();
      setDone({ activated: r.activated, warnings: r.warnings });
      router.refresh();
    });
  };

  if (accounts.length === 0) return <p className="text-sm text-(--color-text-muted)">Kampanya kurulabilecek reklam hesabı yok.</p>;
  if (done) {
    return (
      <div className="space-y-3 text-center">
        <CheckCircle2 size={36} className="mx-auto text-emerald-500" />
        <p className="font-semibold">{done.activated ? "Kampanya oluşturuldu ve yayına alındı." : "Kampanya duraklatılmış olarak oluşturuldu."}</p>
        <p className="text-sm text-(--color-text-muted)">
          {done.activated
            ? "Meta reklamları inceledikten sonra (genelde birkaç dakika–birkaç saat) gösterilmeye başlar."
            : "\"Bekleyen kampanyalar\" bölümünde. Ayrıntıdan kontrol edip ▶ ile yayına alabilirsin."}
        </p>
        {done.warnings.map((w, i) => (
          <p key={i} className="text-sm text-amber-700 dark:text-amber-300">
            {w}
          </p>
        ))}
        <button type="button" onClick={onClose} className={btnPrimary}>
          Tamam
        </button>
      </div>
    );
  }

  const obj = OBJECTIVES[draft.objective];
  const si = Math.min(activeSet, draft.adsets.length - 1);
  const s = draft.adsets[si];
  const ai = Math.min(activeAd[s.key] ?? 0, s.ads.length - 1);
  const ad = s.ads[ai];
  const lifetime = draft.budgetType === "lifetime";
  const needsBid = draft.bidStrategy !== "LOWEST_COST_WITHOUT_CAP";
  const totalBudget = draft.budgetLevel === "campaign" ? draft.campaignBudget : draft.adsets.reduce((n, x) => n + (x.budget || 0), 0);
  const smallSel = "rounded border border-(--color-border) bg-(--color-bg) px-1 py-0.5";

  return (
    <div className="space-y-7 text-sm">
      {restored && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
          <span>Kaydedilmemiş taslağın geri yüklendi; kaldığın yerden devam edebilirsin.</span>
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => {
              clearSaved();
              setRestored(false);
              setNameTouched(false);
              set({
                name: "",
                objective: "MESSAGES",
                destination: "IG",
                pixelId: "",
                conversionEvent: "PURCHASE",
                specialCategory: "",
                budgetLevel: "adset",
                budgetType: "daily",
                campaignBudget: 200,
                bidStrategy: "LOWEST_COST_WITHOUT_CAP",
                spendCap: null,
                abTest: false,
                adsets: [{ ...newAdSet(1), endTime: defaultEnd() }],
                activate: false,
              });
              setActiveSet(0);
            }}
          >
            Taslağı sil, baştan başla
          </button>
        </div>
      )}
      <p className="text-[11px] text-(--color-text-muted)">Girdiklerin bu cihazda otomatik saklanır; pencere kapansa ya da sayfa yenilense de kaybolmaz.</p>
      {/* 1. Kampanya */}
      <Section n={1} title="Kampanya">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Reklam hesabı">
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={inputCls}>
              {accounts.map((a) => (
                <option key={a.metaId} value={a.metaId}>
                  {a.clientName ? `${a.clientName} — ${a.name}` : a.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Özel reklam kategorisi" hint="Konut, iş ilanı, kredi ve siyaset reklamlarında zorunlu; yaş / cinsiyet / detaylı hedefleme daraltılamaz.">
            <select value={draft.specialCategory} onChange={(e) => set({ specialCategory: e.target.value as CampaignDraft["specialCategory"] })} className={inputCls}>
              {SPECIAL_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {ctxError && <p className={errorBox}>{ctxError}</p>}
        {ctx && (
          <p className="text-xs text-(--color-text-muted)">
            Reklamlar <b>{ctx.page ?? "—"}</b> sayfası{ctx.instagram ? <> ve <b>@{ctx.instagram}</b> Instagram hesabı</> : " (Instagram bağlı değil)"} adına yayınlanır.
          </p>
        )}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {(Object.keys(OBJECTIVES) as ObjectiveKey[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => set({ objective: k })}
              className={`rounded-lg border p-2.5 text-left transition ${draft.objective === k ? "border-brand-500 bg-brand-50 dark:bg-brand-900/20" : "border-(--color-border) hover:bg-(--color-surface-muted)"}`}
            >
              <p className="font-semibold">{OBJECTIVES[k].label}</p>
              <p className="text-[11px] text-(--color-text-muted)">{OBJECTIVES[k].hint}</p>
            </button>
          ))}
        </div>
        {draft.objective === "MESSAGES" && (
          <Field
            label="Mesajlar nereye gelsin?"
            hint={MESSAGE_DESTINATIONS[draft.destination].whatsapp ? "WhatsApp için sayfaya WhatsApp Business numarası bağlı olmalı (Meta Business > Sayfa ayarları > WhatsApp)." : undefined}
          >
            <select value={draft.destination} onChange={(e) => set({ destination: e.target.value as MessageDestination })} className={inputCls}>
              {(Object.keys(MESSAGE_DESTINATIONS) as MessageDestination[]).map((k) => (
                <option key={k} value={k}>
                  {MESSAGE_DESTINATIONS[k].label}
                </option>
              ))}
            </select>
          </Field>
        )}
        {draft.objective === "CONVERSIONS" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Meta pixel" hint={ctx && ctx.pixels.length === 0 ? "Bu hesapta pixel yok; önce Meta Etkinlik Yöneticisi'nden siteye pixel kurulmalı." : undefined}>
              <select value={draft.pixelId} onChange={(e) => set({ pixelId: e.target.value })} className={inputCls}>
                <option value="">Seçin</option>
                {(ctx?.pixels ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Dönüşüm olayı">
              <select value={draft.conversionEvent} onChange={(e) => set({ conversionEvent: e.target.value })} className={inputCls}>
                {CONVERSION_EVENTS.map((e) => (
                  <option key={e.value} value={e.value}>
                    {e.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
      </Section>

      {/* 2. Bütçe ve teklif */}
      <Section n={2} title="Bütçe ve teklif">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field
            label="Bütçe nerede?"
            hint={draft.budgetLevel === "campaign" ? "Advantage+ kampanya bütçesi: Meta bütçeyi reklam setleri arasında en iyi sonuca göre dağıtır." : "Her reklam setinin kendi bütçesi olur."}
          >
            <select value={draft.budgetLevel} onChange={(e) => set({ budgetLevel: e.target.value as CampaignDraft["budgetLevel"] })} className={inputCls}>
              <option value="adset">Reklam seti bütçesi</option>
              <option value="campaign">Kampanya bütçesi (Advantage+)</option>
            </select>
          </Field>
          <Field label="Bütçe türü" hint={lifetime ? "Toplam bütçede bitiş tarihi zorunlu; saatli yayın seçilebilir." : undefined}>
            <select value={draft.budgetType} onChange={(e) => set({ budgetType: e.target.value as CampaignDraft["budgetType"] })} className={inputCls}>
              <option value="daily">Günlük</option>
              <option value="lifetime">Toplam (kampanya boyunca)</option>
            </select>
          </Field>
          {draft.budgetLevel === "campaign" && (
            <Field label={lifetime ? "Toplam bütçe (₺)" : "Günlük bütçe (₺)"}>
              <input inputMode="decimal" defaultValue={draft.campaignBudget} onChange={(e) => set({ campaignBudget: parseMoney(e.target.value) || 0 })} className={inputCls} />
            </Field>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Teklif stratejisi" hint={BID_STRATEGIES.find((b) => b.value === draft.bidStrategy)?.hint}>
            <select value={draft.bidStrategy} onChange={(e) => set({ bidStrategy: e.target.value as CampaignDraft["bidStrategy"] })} className={inputCls}>
              {BID_STRATEGIES.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Kampanya harcama limiti (₺, isteğe bağlı)" hint="Bu tutara ulaşınca kampanya durur.">
            <input inputMode="decimal" defaultValue={draft.spendCap ?? ""} onChange={(e) => set({ spendCap: e.target.value ? parseMoney(e.target.value) : null })} className={inputCls} />
          </Field>
          <label className="flex items-start gap-2 pt-5 text-sm">
            <input type="checkbox" checked={draft.abTest} onChange={(e) => set({ abTest: e.target.checked })} className="mt-0.5 h-4 w-4" disabled={draft.adsets.length < 2} />
            <span>
              A/B testi
              <span className="block text-[11px] text-(--color-text-muted)">2+ reklam setini birbirinden ayrı kitlelerle karşılaştırır (Meta bölünmüş test).</span>
            </span>
          </label>
        </div>
        <p className="text-xs text-(--color-text-muted)">
          {lifetime ? "Toplam" : "Günlük"} bütçe: {money(totalBudget)}
        </p>
      </Section>

      {/* 3. Reklam setleri */}
      <Section
        n={3}
        title="Reklam setleri"
        right={
          <div className="flex gap-1.5">
            <button
              type="button"
              className={btnGhost}
              onClick={() => {
                const copy: AdSetDraft = { ...JSON.parse(JSON.stringify(s)), key: rid(), name: `${s.name} - Kopya` };
                copy.ads = copy.ads.map((a) => ({ ...a, key: rid() }));
                set({ adsets: [...draft.adsets, copy] });
                setActiveSet(draft.adsets.length);
              }}
            >
              <Copy size={12} /> Bu seti çoğalt
            </button>
            <button
              type="button"
              className={btnGhost}
              onClick={() => {
                set({ adsets: [...draft.adsets, { ...newAdSet(draft.adsets.length + 1), endTime: s.endTime }] });
                setActiveSet(draft.adsets.length);
              }}
            >
              <Plus size={12} /> Yeni set
            </button>
          </div>
        }
      >
        {draft.adsets.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {draft.adsets.map((x, i) => (
              <button key={x.key} type="button" onClick={() => setActiveSet(i)} className={`rounded-full px-3 py-1 text-xs font-medium ${i === si ? "bg-brand-600 text-white" : "bg-(--color-surface-muted)"}`}>
                {x.name || `Set ${i + 1}`}
              </button>
            ))}
          </div>
        )}
        <div key={s.key} className="space-y-4 rounded-xl border border-(--color-border) p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <Field label="Reklam seti adı" className="sm:col-span-2">
              <input value={s.name} onChange={(e) => setAdSet(si, { ...s, name: e.target.value })} className={inputCls} />
            </Field>
            {draft.budgetLevel === "adset" && (
              <Field label={lifetime ? "Toplam bütçe (₺)" : "Günlük bütçe (₺)"}>
                <input inputMode="decimal" defaultValue={s.budget} onChange={(e) => setAdSet(si, { ...s, budget: parseMoney(e.target.value) || 0 })} className={inputCls} />
              </Field>
            )}
            {needsBid && (
              <Field label={draft.bidStrategy === "COST_CAP" ? "Sonuç başı hedef (₺)" : "Teklif sınırı (₺)"}>
                <input inputMode="decimal" defaultValue={s.bidAmount ?? ""} onChange={(e) => setAdSet(si, { ...s, bidAmount: e.target.value ? parseMoney(e.target.value) : null })} className={inputCls} />
              </Field>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Başlangıç" hint="Boş = yayına alınınca hemen">
              <input type="datetime-local" value={isoToLocalInput(s.startTime)} onChange={(e) => setAdSet(si, { ...s, startTime: fromLocalInput(e.target.value) })} className={inputCls} />
            </Field>
            <Field label="Bitiş" hint={lifetime ? "Toplam bütçede zorunlu" : "Boş = durdurulana kadar"}>
              <input type="datetime-local" value={isoToLocalInput(s.endTime)} onChange={(e) => setAdSet(si, { ...s, endTime: fromLocalInput(e.target.value) })} className={inputCls} />
            </Field>
          </div>
          {lifetime && (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!s.schedule}
                  onChange={(e) => setAdSet(si, { ...s, schedule: e.target.checked ? { days: [1, 2, 3, 4, 5], startHour: 9, endHour: 21 } : null })}
                  className="h-4 w-4"
                />
                Saatli yayın (reklam sadece seçilen gün ve saatlerde gösterilir)
              </label>
              {s.schedule && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {DAYS.map((d, i) => (
                    <label key={d} className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={s.schedule!.days.includes(i)}
                        onChange={() =>
                          setAdSet(si, {
                            ...s,
                            schedule: { ...s.schedule!, days: s.schedule!.days.includes(i) ? s.schedule!.days.filter((x) => x !== i) : [...s.schedule!.days, i].sort() },
                          })
                        }
                      />
                      {d}
                    </label>
                  ))}
                  <select value={s.schedule.startHour} onChange={(e) => setAdSet(si, { ...s, schedule: { ...s.schedule!, startHour: Number(e.target.value) } })} className={smallSel}>
                    {Array.from({ length: 24 }, (_, h) => (
                      <option key={h} value={h}>
                        {String(h).padStart(2, "0")}:00
                      </option>
                    ))}
                  </select>
                  –
                  <select value={s.schedule.endHour} onChange={(e) => setAdSet(si, { ...s, schedule: { ...s.schedule!, endHour: Number(e.target.value) } })} className={smallSel}>
                    {Array.from({ length: 24 }, (_, h) => h + 1).map((h) => (
                      <option key={h} value={h}>
                        {String(h % 24).padStart(2, "0")}:00
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
          {draft.objective === "REACH" && (
            <label className="flex flex-wrap items-center gap-2 text-sm">
              <input type="checkbox" checked={!!s.frequency} onChange={(e) => setAdSet(si, { ...s, frequency: e.target.checked ? { max: 2, days: 7 } : null })} className="h-4 w-4" />
              Sıklık sınırı: aynı kişiye
              {s.frequency && (
                <>
                  <input type="number" min={1} max={90} value={s.frequency.max} onChange={(e) => setAdSet(si, { ...s, frequency: { ...s.frequency!, max: Number(e.target.value) } })} className={`w-14 ${smallSel}`} />
                  kez /
                  <input type="number" min={1} max={90} value={s.frequency.days} onChange={(e) => setAdSet(si, { ...s, frequency: { ...s.frequency!, days: Number(e.target.value) } })} className={`w-14 ${smallSel}`} />
                  gün
                </>
              )}
            </label>
          )}

          <div className="border-t border-(--color-border) pt-4">
            <p className="mb-3 text-xs font-bold uppercase text-(--color-text-muted)">Hedef kitle ve yerleşim</p>
            <AudienceEditor
              value={s.audience}
              onChange={(audience) => setAdSet(si, { ...s, audience })}
              accountId={accountId}
              audiences={audiences}
              onAudienceCreated={(a) => setExtraAudiences((x) => [...x, a])}
              special={special}
            />
          </div>

          <div className="space-y-3 border-t border-(--color-border) pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase text-(--color-text-muted)">Reklamlar</p>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  className={btnGhost}
                  onClick={() => {
                    const copy = { ...JSON.parse(JSON.stringify(ad)), key: rid(), name: `${ad.name} - Kopya` };
                    setAdSet(si, { ...s, ads: [...s.ads, copy] });
                    setActiveAd((m) => ({ ...m, [s.key]: s.ads.length }));
                  }}
                >
                  <Copy size={12} /> Reklamı çoğalt
                </button>
                <button
                  type="button"
                  className={btnGhost}
                  onClick={() => {
                    setAdSet(si, { ...s, ads: [...s.ads, newAd(s.ads.length + 1)] });
                    setActiveAd((m) => ({ ...m, [s.key]: s.ads.length }));
                  }}
                >
                  <Plus size={12} /> Reklam ekle
                </button>
              </div>
            </div>
            {s.ads.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                {s.ads.map((a, i) => (
                  <span key={a.key} className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${i === ai ? "bg-brand-600 text-white" : "bg-(--color-surface-muted)"}`}>
                    <button type="button" onClick={() => setActiveAd((m) => ({ ...m, [s.key]: i }))}>
                      {a.name || `Reklam ${i + 1}`}
                    </button>
                    <button type="button" onClick={() => setAdSet(si, { ...s, ads: s.ads.filter((_, j) => j !== i) })} className="opacity-70 hover:opacity-100" title="Reklamı kaldır">
                      <Trash2 size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <AdEditor
              key={ad.key}
              ad={ad}
              onChange={(a) => setAdSet(si, { ...s, ads: s.ads.map((x, j) => (j === ai ? a : x)) })}
              accountId={accountId}
              objective={draft.objective}
              destination={draft.destination}
              ctx={ctxFull}
              onLeadFormCreated={(f) => setExtraForms((x) => [...x, f])}
            />
          </div>

          {draft.adsets.length > 1 && (
            <button
              type="button"
              onClick={() => {
                set({ adsets: draft.adsets.filter((_, j) => j !== si) });
                setActiveSet(0);
              }}
              className="text-xs font-medium text-brand-600 hover:underline"
            >
              Bu reklam setini kaldır
            </button>
          )}
        </div>
      </Section>

      {/* 4. Kaydet */}
      <Section n={4} title="Kaydet">
        <Field label="Kampanya adı">
          <input
            value={finalName}
            onChange={(e) => {
              setNameTouched(true);
              set({ name: e.target.value });
            }}
            className={inputCls}
          />
        </Field>
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={draft.activate} onChange={(e) => set({ activate: e.target.checked })} className="mt-0.5 h-4 w-4" />
          <span>
            Oluşturunca hemen yayına al
            <span className="block text-xs text-(--color-text-muted)">İşaretlemezsen kampanya duraklatılmış kurulur, kontrol edip listeden yayına alırsın.</span>
          </span>
        </label>
        <p className="text-xs text-(--color-text-muted)">
          Özet: {obj.label}
          {draft.objective === "MESSAGES" && ` (${MESSAGE_DESTINATIONS[draft.destination].label})`} · {draft.adsets.length} reklam seti ·{" "}
          {draft.adsets.reduce((n, x) => n + x.ads.length, 0)} reklam · {lifetime ? "toplam" : "günlük"} {money(totalBudget)}
        </p>
      </Section>

      {error && <p className={errorBox}>{error}</p>}

      <div className="sticky bottom-0 z-20 -mx-5 -mb-5 flex justify-end gap-2 border-t border-(--color-border) bg-(--color-surface) px-5 py-3">
        <button type="button" onClick={onClose} className="rounded-lg border border-(--color-border) px-4 py-2 text-sm font-medium hover:bg-(--color-surface-muted)">
          Vazgeç
        </button>
        <button type="button" onClick={submit} disabled={pending || !!ctxError} className={btnPrimary}>
          {pending && <Loader2 size={14} className="animate-spin" />}
          {pending ? "Meta'da kuruluyor..." : draft.activate ? "Oluştur ve yayına al" : "Kampanyayı oluştur"}
        </button>
      </div>
    </div>
  );
}
