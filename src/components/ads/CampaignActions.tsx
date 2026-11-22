"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, Copy, ExternalLink, Eye, Loader2, Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import {
  addAdAction,
  copyAdCampaign,
  duplicateAdSetAction,
  getAdCampaignDetail,
  getAdSetContext,
  getAdSetForEdit,
  getAdTextAction,
  getComposerData,
  removeAdObject,
  setAdObjectStatus,
  updateAdCampaign,
  updateAdSetAction,
  updateAdTextAction,
} from "@/lib/actions/adManage";
import { CTA_OPTIONS, newAd, type AdDraft, type AudienceDraft, type CampaignDetail, type ComposerContext, type MessageDestination, type ObjectiveKey } from "@/lib/adsTypes";
import type { AdSetEdit, AdTextEdit } from "@/lib/metaAds";
import { AdEditor } from "./AdEditor";
import { AudienceEditor } from "./AudienceEditor";
import { CAMPAIGN_STATUS_CHIP, CAMPAIGN_STATUS_CHIP_DEFAULT, CAMPAIGN_STATUS_LABEL, OBJECTIVE_LABEL } from "./stats";
import { Field, Modal, btnGhost, btnPrimary, errorBox, fromLocalInput, inputCls, isoToLocalInput, money, parseMoney, toLocalInput } from "./ui";

export type ActionCampaign = {
  metaId: string;
  name: string;
  /** Kampanyanın Meta'daki ayarı: ACTIVE | PAUSED */
  status: string;
  effectiveStatus: string;
  dailyBudget: number | null;
  startTime: string | null;
  stopTime: string | null;
};

const btnIcon =
  "inline-flex h-7 w-7 items-center justify-center rounded-md border border-(--color-border) text-(--color-text-muted) hover:bg-(--color-surface-muted) hover:text-(--color-text) disabled:opacity-50";
const dt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("tr-TR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

function StatusChip({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${CAMPAIGN_STATUS_CHIP[status] ?? CAMPAIGN_STATUS_CHIP_DEFAULT}`}>
      {CAMPAIGN_STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function CampaignActions({ campaign, manageable }: { campaign: ActionCampaign; manageable: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState<null | "detail" | "copy" | "edit">(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isOn = campaign.status === "ACTIVE";

  const toggle = () => {
    const msg = isOn
      ? `"${campaign.name}" durdurulsun mu? Reklamlar gösterilmeyi bırakır.`
      : `"${campaign.name}" yayına alınsın mı?${campaign.dailyBudget ? ` Günlük ${money(campaign.dailyBudget)} harcama başlar.` : " Harcama başlar."}`;
    if (!window.confirm(msg)) return;
    setError(null);
    start(async () => {
      const r = await setAdObjectStatus(campaign.metaId, "campaign", isOn ? "PAUSED" : "ACTIVE");
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        <button type="button" title="Ayrıntı ve yönetim" onClick={() => setOpen("detail")} className={btnIcon}>
          <Eye size={14} />
        </button>
        {manageable && (
          <>
            <button type="button" title={isOn ? "Durdur" : "Yayına al"} onClick={toggle} disabled={pending} className={`${btnIcon} ${isOn ? "" : "text-emerald-600 dark:text-emerald-400"}`}>
              {pending ? <Loader2 size={14} className="animate-spin" /> : isOn ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <button type="button" title="Düzenle (ad, bütçe, bitiş, harcama limiti)" onClick={() => setOpen("edit")} className={btnIcon}>
              <Pencil size={14} />
            </button>
            <button type="button" title="Kopyala" onClick={() => setOpen("copy")} className={btnIcon}>
              <Copy size={14} />
            </button>
          </>
        )}
      </div>
      {error && <p className="max-w-[260px] text-right text-[11px] text-brand-600">{error}</p>}

      <Modal open={open === "detail"} onClose={() => setOpen(null)} title={campaign.name} size="lg">
        <DetailBody metaId={campaign.metaId} manageable={manageable} onChanged={() => router.refresh()} onClose={() => setOpen(null)} />
      </Modal>
      <Modal open={open === "copy"} onClose={() => setOpen(null)} title="Kampanyayı kopyala">
        <CopyBody
          campaign={campaign}
          onDone={() => {
            setOpen(null);
            router.refresh();
          }}
        />
      </Modal>
      <Modal open={open === "edit"} onClose={() => setOpen(null)} title="Kampanyayı düzenle">
        <EditBody
          campaign={campaign}
          onDone={() => {
            setOpen(null);
            router.refresh();
          }}
        />
      </Modal>
    </div>
  );
}

// ---- Ayrıntı ve yönetim -------------------------------------------------------------------

function DetailBody({ metaId, manageable, onChanged, onClose }: { metaId: string; manageable: boolean; onChanged: () => void; onClose: () => void }) {
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | { kind: "adset"; id: string } | { kind: "addAd"; adsetId: string } | { kind: "text"; adId: string }>(null);

  useEffect(() => {
    let alive = true;
    getAdCampaignDetail(metaId).then((r) => {
      if (!alive) return;
      if (r.ok) setDetail(r.detail);
      else setError(r.error);
    });
    return () => {
      alive = false;
    };
  }, [metaId, version]);

  const reload = () => {
    setVersion((v) => v + 1);
    onChanged();
  };
  const run = async (key: string, fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(key);
    setActionError(null);
    const r = await fn();
    setBusy(null);
    if (!r.ok) setActionError(r.error ?? "İşlem yapılamadı.");
    else reload();
  };

  if (error) return <p className={errorBox}>{error}</p>;
  if (!detail)
    return (
      <p className="flex items-center gap-2 text-sm text-(--color-text-muted)">
        <Loader2 size={14} className="animate-spin" /> Meta&apos;dan okunuyor...
      </p>
    );

  const spin = (k: string) => busy === k;
  const smallBtn = "inline-flex items-center gap-1 rounded-md border border-(--color-border) px-2 py-1 text-[11px] font-medium hover:bg-(--color-surface-muted) disabled:opacity-50";

  return (
    <div className="space-y-5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip status={detail.effectiveStatus} />
        <span className="text-(--color-text-muted)">{OBJECTIVE_LABEL[detail.objective] ?? detail.objective}</span>
        {detail.dailyBudget != null && <span className="text-(--color-text-muted)">· Günlük {money(detail.dailyBudget)} (kampanya bütçesi)</span>}
        {detail.lifetimeBudget != null && <span className="text-(--color-text-muted)">· Toplam {money(detail.lifetimeBudget)}</span>}
        {detail.spendCap != null && <span className="text-(--color-text-muted)">· Harcama limiti {money(detail.spendCap)}</span>}
        <a href={detail.managerUrl} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
          Meta Reklam Yöneticisi&apos;nde aç <ExternalLink size={12} />
        </a>
      </div>
      {actionError && <p className={errorBox}>{actionError}</p>}

      {detail.adsets.map((s) => {
        const on = s.status === "ACTIVE";
        return (
          <section key={s.id} className="rounded-lg border border-(--color-border)">
            <div className="flex flex-wrap items-center gap-2 border-b border-(--color-border) px-3 py-2">
              <p className="font-semibold">{s.name}</p>
              <StatusChip status={s.effectiveStatus} />
              <span className="text-xs text-(--color-text-muted)">
                {s.dailyBudget != null ? `Günlük ${money(s.dailyBudget)}` : s.lifetimeBudget != null ? `Toplam ${money(s.lifetimeBudget)}` : ""}
              </span>
              {manageable && (
                <div className="ml-auto flex flex-wrap gap-1">
                  <button type="button" className={smallBtn} disabled={!!busy} onClick={() => run(`s-${s.id}`, () => setAdObjectStatus(s.id, "adset", on ? "PAUSED" : "ACTIVE"))}>
                    {spin(`s-${s.id}`) ? <Loader2 size={11} className="animate-spin" /> : on ? <Pause size={11} /> : <Play size={11} />} {on ? "Durdur" : "Aç"}
                  </button>
                  <button type="button" className={smallBtn} onClick={() => setDialog({ kind: "adset", id: s.id })}>
                    <Pencil size={11} /> Düzenle / hedef kitle
                  </button>
                  <button
                    type="button"
                    className={smallBtn}
                    disabled={!!busy}
                    onClick={() => {
                      const name = window.prompt("Yeni reklam setinin adı:", `${s.name} - Kopya`);
                      if (name) run(`d-${s.id}`, () => duplicateAdSetAction(s.id, name));
                    }}
                  >
                    {spin(`d-${s.id}`) ? <Loader2 size={11} className="animate-spin" /> : <Copy size={11} />} Çoğalt
                  </button>
                  <button type="button" className={smallBtn} onClick={() => setDialog({ kind: "addAd", adsetId: s.id })}>
                    <Plus size={11} /> Reklam ekle
                  </button>
                  <button
                    type="button"
                    className={`${smallBtn} text-brand-600`}
                    disabled={!!busy}
                    onClick={() => window.confirm(`"${s.name}" reklam seti kalıcı olarak silinsin mi?`) && run(`x-${s.id}`, () => removeAdObject(s.id, "delete"))}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              )}
            </div>
            <dl className="grid grid-cols-1 gap-x-4 gap-y-1 px-3 py-2 text-xs sm:grid-cols-2">
              <div>
                <dt className="inline text-(--color-text-muted)">Tarih: </dt>
                <dd className="inline">
                  {dt(s.startTime)} → {s.endTime ? dt(s.endTime) : "bitiş yok"}
                </dd>
              </div>
              <div>
                <dt className="inline text-(--color-text-muted)">Konum: </dt>
                <dd className="inline">{s.targeting.locations.join(", ") || "—"}</dd>
              </div>
              <div>
                <dt className="inline text-(--color-text-muted)">Yaş / cinsiyet: </dt>
                <dd className="inline">
                  {s.targeting.age} · {s.targeting.gender}
                </dd>
              </div>
              <div>
                <dt className="inline text-(--color-text-muted)">Advantage+ kitle: </dt>
                <dd className="inline">{s.targeting.advantage ? "Açık" : "Kapalı"}</dd>
              </div>
              <div>
                <dt className="inline text-(--color-text-muted)">Yerleşim: </dt>
                <dd className="inline">{s.targeting.placements}</dd>
              </div>
              {s.targeting.audiences.length > 0 && (
                <div>
                  <dt className="inline text-(--color-text-muted)">Özel kitle: </dt>
                  <dd className="inline">{s.targeting.audiences.join(", ")}</dd>
                </div>
              )}
              {s.targeting.interests.length > 0 && (
                <div className="sm:col-span-2">
                  <dt className="inline text-(--color-text-muted)">Detaylı hedefleme: </dt>
                  <dd className="inline">{s.targeting.interests.join(", ")}</dd>
                </div>
              )}
            </dl>
            <ul className="divide-y divide-(--color-border) border-t border-(--color-border)">
              {detail.ads
                .filter((a) => a.adsetId === s.id)
                .map((a) => {
                  const aon = a.status === "ACTIVE";
                  return (
                    <li key={a.id} className="flex gap-3 px-3 py-2.5">
                      {a.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={a.thumbnail} alt="" className="h-16 w-16 shrink-0 rounded-md object-cover" />
                      ) : (
                        <div className="h-16 w-16 shrink-0 rounded-md bg-(--color-surface-muted)" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-medium">{a.name}</p>
                          <StatusChip status={a.effectiveStatus} />
                        </div>
                        {a.title && <p className="text-xs font-semibold">{a.title}</p>}
                        {a.body && <p className="line-clamp-3 whitespace-pre-line text-xs text-(--color-text-muted)">{a.body}</p>}
                        {a.issues.map((i, n) => (
                          <p key={n} className="mt-1 text-xs text-brand-600">
                            ⚠ {i}
                          </p>
                        ))}
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          {a.previewUrl && (
                            <a href={a.previewUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline">
                              Önizle <ExternalLink size={11} />
                            </a>
                          )}
                          {manageable && (
                            <>
                              <button type="button" className={smallBtn} disabled={!!busy} onClick={() => run(`a-${a.id}`, () => setAdObjectStatus(a.id, "ad", aon ? "PAUSED" : "ACTIVE"))}>
                                {spin(`a-${a.id}`) ? <Loader2 size={11} className="animate-spin" /> : aon ? <Pause size={11} /> : <Play size={11} />} {aon ? "Durdur" : "Aç"}
                              </button>
                              {a.editable && (
                                <button type="button" className={smallBtn} onClick={() => setDialog({ kind: "text", adId: a.id })}>
                                  <Pencil size={11} /> Metni düzenle
                                </button>
                              )}
                              <button
                                type="button"
                                className={`${smallBtn} text-brand-600`}
                                disabled={!!busy}
                                onClick={() => window.confirm(`"${a.name}" reklamı kalıcı olarak silinsin mi?`) && run(`y-${a.id}`, () => removeAdObject(a.id, "delete"))}
                              >
                                <Trash2 size={11} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
            </ul>
          </section>
        );
      })}

      {manageable && (
        <div className="flex flex-wrap justify-end gap-2 border-t border-(--color-border) pt-3">
          <button
            type="button"
            className={btnGhost}
            disabled={!!busy}
            onClick={async () => {
              if (!window.confirm("Kampanya arşivlensin mi? Durur ve listeden kalkar (Meta'da arşivde görünür).")) return;
              await run("arch", () => removeAdObject(detail.id, "archive"));
              onClose();
            }}
          >
            <Archive size={12} /> Arşivle
          </button>
          <button
            type="button"
            className={`${btnGhost} text-brand-600`}
            disabled={!!busy}
            onClick={async () => {
              if (!window.confirm("Kampanya reklam setleri ve reklamlarıyla kalıcı olarak silinsin mi? Geri alınamaz.")) return;
              await run("del", () => removeAdObject(detail.id, "delete"));
              onClose();
            }}
          >
            <Trash2 size={12} /> Kampanyayı sil
          </button>
        </div>
      )}

      <Modal open={dialog?.kind === "adset"} onClose={() => setDialog(null)} title="Reklam setini düzenle" size="lg">
        {dialog?.kind === "adset" && (
          <AdSetEditBody
            adsetId={dialog.id}
            onDone={() => {
              setDialog(null);
              reload();
            }}
          />
        )}
      </Modal>
      <Modal open={dialog?.kind === "addAd"} onClose={() => setDialog(null)} title="Reklam setine yeni reklam" size="lg">
        {dialog?.kind === "addAd" && (
          <AddAdBody
            adsetId={dialog.adsetId}
            onDone={() => {
              setDialog(null);
              reload();
            }}
          />
        )}
      </Modal>
      <Modal open={dialog?.kind === "text"} onClose={() => setDialog(null)} title="Reklam metnini düzenle">
        {dialog?.kind === "text" && (
          <AdTextBody
            adId={dialog.adId}
            onDone={() => {
              setDialog(null);
              reload();
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function AdSetEditBody({ adsetId, onDone }: { adsetId: string; onDone: () => void }) {
  const [data, setData] = useState<{ edit: AdSetEdit; accountId: string; audiences: ComposerContext["audiences"] } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [budget, setBudget] = useState("");
  const [endAt, setEndAt] = useState("");
  const [audience, setAudience] = useState<AudienceDraft | null>(null);
  const [touchedAudience, setTouchedAudience] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getAdSetForEdit(adsetId).then(async (r) => {
      if (!alive) return;
      if (!r.ok) return setLoadError(r.error);
      const c = await getComposerData(r.accountId);
      if (!alive) return;
      setData({ edit: r.edit, accountId: r.accountId, audiences: c.ok ? c.ctx.audiences : [] });
      setName(r.edit.name);
      setBudget(String(r.edit.dailyBudget ?? r.edit.lifetimeBudget ?? ""));
      setEndAt(isoToLocalInput(r.edit.endTime));
      setAudience(r.edit.audience);
    });
    return () => {
      alive = false;
    };
  }, [adsetId]);

  if (loadError) return <p className={errorBox}>{loadError}</p>;
  if (!data || !audience)
    return (
      <p className="flex items-center gap-2 text-sm text-(--color-text-muted)">
        <Loader2 size={14} className="animate-spin" /> Yükleniyor...
      </p>
    );
  const e = data.edit;
  const submit = () => {
    setError(null);
    const input: { name?: string; budget?: number | null; endTime?: string | null; audience?: AudienceDraft } = {};
    if (name.trim() !== e.name) input.name = name;
    const b = budget ? parseMoney(budget) : null;
    if (b != null && b !== (e.dailyBudget ?? e.lifetimeBudget) && (e.dailyBudget != null || e.lifetimeBudget != null)) input.budget = b;
    if (endAt !== isoToLocalInput(e.endTime)) input.endTime = fromLocalInput(endAt);
    if (touchedAudience) input.audience = audience;
    start(async () => {
      const r = await updateAdSetAction(adsetId, input);
      if (!r.ok) setError(r.error);
      else onDone();
    });
  };
  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Reklam seti adı">
          <input value={name} onChange={(ev) => setName(ev.target.value)} className={inputCls} />
        </Field>
        <Field label={e.lifetimeBudget != null ? "Toplam bütçe (₺)" : "Günlük bütçe (₺)"} hint={e.dailyBudget == null && e.lifetimeBudget == null ? "Bütçe kampanya düzeyinde." : undefined}>
          <input inputMode="decimal" value={budget} onChange={(ev) => setBudget(ev.target.value)} disabled={e.dailyBudget == null && e.lifetimeBudget == null} className={inputCls} />
        </Field>
        <Field label="Bitiş" hint="Boş = durdurulana kadar">
          <input type="datetime-local" value={endAt} onChange={(ev) => setEndAt(ev.target.value)} className={inputCls} />
        </Field>
      </div>
      <div className="border-t border-(--color-border) pt-4">
        <p className="mb-3 text-xs font-bold uppercase text-(--color-text-muted)">Hedef kitle ve yerleşim</p>
        <AudienceEditor
          value={audience}
          onChange={(a) => {
            setAudience(a);
            setTouchedAudience(true);
          }}
          accountId={data.accountId}
          audiences={data.audiences}
          special={e.special}
        />
      </div>
      {error && <p className={errorBox}>{error}</p>}
      <div className="flex justify-end">
        <button type="button" onClick={submit} disabled={pending} className={btnPrimary}>
          {pending && <Loader2 size={14} className="animate-spin" />} Kaydet
        </button>
      </div>
    </div>
  );
}

function AddAdBody({ adsetId, onDone }: { adsetId: string; onDone: () => void }) {
  const [ctx, setCtx] = useState<{ objective: ObjectiveKey; destination: MessageDestination; accountId: string; composer: ComposerContext | null } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ad, setAd] = useState<AdDraft>(() => newAd(1));
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    getAdSetContext(adsetId).then(async (r) => {
      if (!alive) return;
      if (!r.ok) return setLoadError(r.error);
      const c = await getComposerData(r.accountId);
      if (alive) setCtx({ objective: r.objective, destination: r.destination, accountId: r.accountId, composer: c.ok ? c.ctx : null });
    });
    return () => {
      alive = false;
    };
  }, [adsetId]);
  if (loadError) return <p className={errorBox}>{loadError}</p>;
  if (!ctx)
    return (
      <p className="flex items-center gap-2 text-sm text-(--color-text-muted)">
        <Loader2 size={14} className="animate-spin" /> Yükleniyor...
      </p>
    );
  return (
    <div className="space-y-4 text-sm">
      <AdEditor ad={ad} onChange={setAd} accountId={ctx.accountId} objective={ctx.objective} destination={ctx.destination} ctx={ctx.composer} />
      {error && <p className={errorBox}>{error}</p>}
      <div className="flex justify-end">
        <button
          type="button"
          disabled={pending}
          className={btnPrimary}
          onClick={() => {
            setError(null);
            start(async () => {
              const r = await addAdAction(adsetId, ad);
              if (!r.ok) setError(r.error);
              else onDone();
            });
          }}
        >
          {pending && <Loader2 size={14} className="animate-spin" />} Reklamı ekle
        </button>
      </div>
    </div>
  );
}

function AdTextBody({ adId, onDone }: { adId: string; onDone: () => void }) {
  const [edit, setEdit] = useState<AdTextEdit | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState({ text: "", headline: "", description: "", link: "", cta: "" });
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    getAdTextAction(adId).then((r) => {
      if (!alive) return;
      if (!r.ok) return setLoadError(r.error);
      setEdit(r.edit);
      setForm({ text: r.edit.text, headline: r.edit.headline, description: r.edit.description, link: r.edit.link, cta: r.edit.cta ?? "" });
    });
    return () => {
      alive = false;
    };
  }, [adId]);
  if (loadError) return <p className={errorBox}>{loadError}</p>;
  if (!edit)
    return (
      <p className="flex items-center gap-2 text-sm text-(--color-text-muted)">
        <Loader2 size={14} className="animate-spin" /> Yükleniyor...
      </p>
    );
  if (!edit.editable) return <p className="text-sm text-(--color-text-muted)">{edit.reason}</p>;
  const webCta = CTA_OPTIONS.some((c) => c.value === form.cta);
  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-(--color-text-muted)">Kaydedince reklam yeni metinle yeniden incelemeye girer; öğrenme süreci sıfırlanabilir.</p>
      <Field label="Ana metin">
        <textarea value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} rows={6} className={inputCls} />
      </Field>
      <Field label="Başlık">
        <input value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} className={inputCls} />
      </Field>
      <Field label="Açıklama">
        <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputCls} />
      </Field>
      {webCta && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Field label="Bağlantı" className="sm:col-span-2">
            <input value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Buton">
            <select value={form.cta} onChange={(e) => setForm({ ...form, cta: e.target.value })} className={inputCls}>
              {CTA_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}
      {error && <p className={errorBox}>{error}</p>}
      <div className="flex justify-end">
        <button
          type="button"
          disabled={pending}
          className={btnPrimary}
          onClick={() => {
            setError(null);
            start(async () => {
              const r = await updateAdTextAction(adId, { ...form, cta: form.cta || null });
              if (!r.ok) setError(r.error);
              else onDone();
            });
          }}
        >
          {pending && <Loader2 size={14} className="animate-spin" />} Kaydet
        </button>
      </div>
    </div>
  );
}

// ---- Kopyala / Düzenle --------------------------------------------------------------------

function CopyBody({ campaign, onDone }: { campaign: ActionCampaign; onDone: () => void }) {
  // Varsayılan bitiş: kaynak kampanyanın süresi kadar sonrası.
  const duration = campaign.startTime && campaign.stopTime ? new Date(campaign.stopTime).getTime() - new Date(campaign.startTime).getTime() : null;
  const [name, setName] = useState(`${campaign.name} - Kopya`);
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState(() => {
    if (!duration || duration <= 0) return "";
    const d = new Date(Date.now() + duration);
    d.setMinutes(0, 0, 0);
    return toLocalInput(d);
  });
  const [budget, setBudget] = useState("");
  const [activate, setActivate] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    start(async () => {
      const r = await copyAdCampaign(campaign.metaId, { name, startTime: fromLocalInput(startAt), endTime: fromLocalInput(endAt), dailyBudget: budget ? parseMoney(budget) : null, activate });
      if (!r.ok) return setError(r.error);
      if (r.skipped.length) setWarn(`Kopyalandı. Şu reklamlar kopyalanamadı: ${r.skipped.join(", ")}`);
      else onDone();
    });
  };

  if (warn)
    return (
      <div className="space-y-3 text-sm">
        <p className="text-amber-700 dark:text-amber-300">{warn}</p>
        <button type="button" onClick={onDone} className={btnPrimary}>
          Tamam
        </button>
      </div>
    );

  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-(--color-text-muted)">
        Hedef kitle, özel kitleler, yerleşimler, reklam setleri ve reklamlar (görsel, metin, buton) aynen kopyalanır. Yeni kampanya duraklatılmış kurulur; istersen hemen yayına alabilirsin.
      </p>
      <Field label="Yeni kampanya adı">
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Başlangıç" hint="Boş = hemen">
          <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Bitiş" hint="Boş = durdurulana kadar">
          <input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} className={inputCls} />
        </Field>
      </div>
      <Field label="Günlük bütçe (₺)">
        <input inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder={campaign.dailyBudget ? `Aynı kalsın (${campaign.dailyBudget})` : "Aynı kalsın"} className={inputCls} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={activate} onChange={(e) => setActivate(e.target.checked)} className="h-4 w-4" />
        Kopyalayınca hemen yayına al (harcama başlar)
      </label>
      {error && <p className={errorBox}>{error}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={submit} disabled={pending} className={btnPrimary}>
          {pending && <Loader2 size={14} className="animate-spin" />}
          {pending ? "Meta'da kopyalanıyor..." : "Kopyala"}
        </button>
      </div>
    </div>
  );
}

function EditBody({ campaign, onDone }: { campaign: ActionCampaign; onDone: () => void }) {
  const initialEnd = toLocalInput(campaign.stopTime ? new Date(campaign.stopTime) : null);
  const [name, setName] = useState(campaign.name);
  const [budget, setBudget] = useState(campaign.dailyBudget != null ? String(campaign.dailyBudget) : "");
  const [endAt, setEndAt] = useState(initialEnd);
  const [cap, setCap] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    const input: { dailyBudget?: number | null; endTime?: string | null; name?: string; spendCap?: number | null } = {};
    if (name.trim() !== campaign.name) input.name = name;
    const b = budget ? parseMoney(budget) : null;
    if (b != null && b !== campaign.dailyBudget) input.dailyBudget = b;
    if (endAt !== initialEnd) input.endTime = fromLocalInput(endAt);
    if (cap.trim()) input.spendCap = cap.trim() === "0" ? null : parseMoney(cap);
    if (Object.keys(input).length === 0) return onDone();
    start(async () => {
      const r = await updateAdCampaign(campaign.metaId, input);
      if (!r.ok) setError(r.error);
      else onDone();
    });
  };

  return (
    <div className="space-y-3 text-sm">
      <Field label="Kampanya adı">
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
      </Field>
      <Field label="Günlük bütçe (₺)" hint="Boş bırakırsan değişmez. Bütçe birden fazla reklam setine bölünmüşse Ayrıntı > reklam seti Düzenle'den değiştirilir.">
        <input inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="Reklam seti bütçesi" className={inputCls} />
      </Field>
      <Field label="Bitiş tarihi" hint="Silip boş bırakırsan kampanya durdurulana kadar yayında kalır.">
        <input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} className={inputCls} />
      </Field>
      <Field label="Harcama limiti (₺)" hint="Boş = değiştirme, 0 = limiti kaldır.">
        <input inputMode="decimal" value={cap} onChange={(e) => setCap(e.target.value)} className={inputCls} />
      </Field>
      {error && <p className={errorBox}>{error}</p>}
      <div className="flex justify-end">
        <button type="button" onClick={submit} disabled={pending} className={btnPrimary}>
          {pending && <Loader2 size={14} className="animate-spin" />}
          Kaydet
        </button>
      </div>
    </div>
  );
}
