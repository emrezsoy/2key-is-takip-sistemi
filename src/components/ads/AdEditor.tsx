"use client";

import { useEffect, useState, useTransition } from "react";
import { Eye, Film, ImageIcon, Loader2, Plus, Trash2, Upload, X } from "lucide-react";
import { createAdLeadForm, getExistingPosts, previewAdCreative, uploadAdMedia } from "@/lib/actions/adManage";
import {
  CTA_OPTIONS,
  LEAD_CTAS,
  supportsVariants,
  type AdDraft,
  type ComposerContext,
  type ExistingPost,
  type MessageDestination,
  type ObjectiveKey,
  type UploadedMedia,
} from "@/lib/adsTypes";
import { Field, Tabs, btnGhost, errorBox, inputCls } from "./ui";

const LINK_REQUIRED: ObjectiveKey[] = ["TRAFFIC", "LANDING", "CONVERSIONS"];
const LINK_OPTIONAL: ObjectiveKey[] = ["REACH", "VIDEO_VIEWS", "POST_ENGAGEMENT"];
const PREVIEW_FORMATS = [
  { value: "INSTAGRAM_STANDARD", label: "Instagram akış" },
  { value: "INSTAGRAM_STORY", label: "Instagram hikaye" },
  { value: "INSTAGRAM_REELS", label: "Instagram Reels" },
  { value: "MOBILE_FEED_STANDARD", label: "Facebook akış (mobil)" },
  { value: "FACEBOOK_STORY_MOBILE", label: "Facebook hikaye" },
  { value: "DESKTOP_FEED_STANDARD", label: "Facebook akış (masaüstü)" },
];
const LEAD_QUESTIONS = [
  { value: "FULL_NAME", label: "Ad soyad" },
  { value: "PHONE", label: "Telefon" },
  { value: "EMAIL", label: "E-posta" },
  { value: "CITY", label: "Şehir" },
  { value: "COMPANY_NAME", label: "Şirket adı" },
  { value: "JOB_TITLE", label: "Unvan" },
];

type Ctx = Pick<ComposerContext, "media" | "leadForms" | "leadTosAccepted" | "leadTosUrl">;

/** Görsel / video seçici: Paylaşım Takvimi'nden ya da bilgisayardan; seçilince hemen Meta'ya yüklenir. */
export function MediaField({
  label,
  hint,
  accountId,
  library,
  value,
  onChange,
  onPickText,
}: {
  label: string;
  hint?: string;
  accountId: string;
  library: ComposerContext["media"];
  value: UploadedMedia | null;
  onChange: (m: UploadedMedia | null) => void;
  onPickText?: (text: string) => void;
}) {
  const [mode, setMode] = useState<null | "library">(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  const upload = (fd: FormData, preview: string | null, text?: string | null) => {
    setError(null);
    fd.set("account", accountId);
    start(async () => {
      const r = await uploadAdMedia(fd);
      if (!r.ok) return setError(r.error);
      setLocalPreview(preview);
      onChange(r.media);
      if (text && onPickText) onPickText(text);
      setMode(null);
    });
  };
  const shown = value ? (value.type === "image" ? value.preview || localPreview : value.thumbUrl) : null;

  return (
    <div className="space-y-2">
      <span className="block text-xs font-medium">{label}</span>
      {value ? (
        <div className="flex items-center gap-3 rounded-lg border border-(--color-border) p-2">
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown} alt="" className="h-16 w-16 rounded object-cover" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded bg-(--color-surface-muted)">{value.type === "video" ? <Film size={18} /> : <ImageIcon size={18} />}</div>
          )}
          <span className="flex-1 text-xs text-(--color-text-muted)">{value.type === "video" ? "Video Meta'ya yüklendi" : "Görsel Meta'ya yüklendi"}</span>
          <button type="button" onClick={() => onChange(null)} className={btnGhost}>
            <X size={12} /> Kaldır
          </button>
        </div>
      ) : pending ? (
        <p className="flex items-center gap-2 rounded-lg border border-dashed border-(--color-border) p-3 text-xs text-(--color-text-muted)">
          <Loader2 size={14} className="animate-spin" /> Meta&apos;ya yükleniyor... (video ise işlenmesi 1-2 dakika sürebilir)
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setMode(mode === "library" ? null : "library")} className={btnGhost}>
            <ImageIcon size={12} /> Paylaşım Takvimi&apos;nden
          </button>
          <label className={`${btnGhost} cursor-pointer`}>
            <Upload size={12} /> Bilgisayardan
            <input
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const fd = new FormData();
                fd.set("media", f);
                upload(fd, f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
              }}
            />
          </label>
        </div>
      )}
      {hint && !value && <p className="text-[11px] text-(--color-text-muted)">{hint}</p>}
      {mode === "library" && !value && !pending && (
        library.length === 0 ? (
          <p className="text-xs text-(--color-text-muted)">Bu müşterinin Paylaşım Takvimi&apos;nde son 4 ayda görsel / video yok.</p>
        ) : (
          <div className="grid max-h-64 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-6">
            {library.map((m) => (
              <button
                key={m.url}
                type="button"
                title={`${m.date} · ${m.title ?? m.name}`}
                onClick={() => {
                  const fd = new FormData();
                  fd.set("mediaUrl", m.url);
                  upload(fd, m.type === "IMAGE" ? m.url : null, m.text);
                }}
                className="relative aspect-square overflow-hidden rounded-lg border border-(--color-border) hover:border-brand-500"
              >
                {m.type === "IMAGE" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-(--color-surface-muted) p-1 text-[10px] text-(--color-text-muted)">
                    <Film size={18} />
                    <span className="line-clamp-2 text-center">{m.title ?? m.name}</span>
                  </div>
                )}
                <span className="absolute bottom-0 left-0 right-0 bg-black/55 px-1 text-[10px] text-white">{m.date.slice(5).split("-").reverse().join(".")}</span>
              </button>
            ))}
          </div>
        )
      )}
      {error && <p className={errorBox}>{error}</p>}
    </div>
  );
}

function TextList({ label, values, onChange, max, multiline, placeholder }: { label: string; values: string[]; onChange: (v: string[]) => void; max: number; multiline?: boolean; placeholder?: string }) {
  return (
    <div className="space-y-1.5">
      <span className="block text-xs font-medium">{label}</span>
      {values.map((v, i) => (
        <div key={i} className="flex gap-1.5">
          {multiline ? (
            <textarea value={v} rows={i === 0 ? 5 : 3} onChange={(e) => onChange(values.map((x, j) => (j === i ? e.target.value : x)))} className={inputCls} placeholder={i === 0 ? placeholder : `Seçenek ${i + 1}`} />
          ) : (
            <input value={v} onChange={(e) => onChange(values.map((x, j) => (j === i ? e.target.value : x)))} className={inputCls} placeholder={i === 0 ? placeholder : `Seçenek ${i + 1}`} />
          )}
          {i > 0 && (
            <button type="button" onClick={() => onChange(values.filter((_, j) => j !== i))} className="self-start rounded-md p-2 text-(--color-text-muted) hover:bg-(--color-surface-muted)">
              <X size={14} />
            </button>
          )}
        </div>
      ))}
      {values.length < max && (
        <button type="button" onClick={() => onChange([...values, ""])} className="text-xs font-medium text-brand-600 hover:underline">
          + Seçenek ekle (Meta en iyi sonucu vereni öne çıkarır)
        </button>
      )}
    </div>
  );
}

function ExistingPostPicker({ accountId, value, onChange }: { accountId: string; value: ExistingPost | null; onChange: (p: ExistingPost | null) => void }) {
  const [posts, setPosts] = useState<ExistingPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    getExistingPosts(accountId).then((r) => {
      if (!alive) return;
      if (r.ok) setPosts(r.posts);
      else setError(r.error);
    });
    return () => {
      alive = false;
    };
  }, [accountId]);
  if (error) return <p className={errorBox}>{error}</p>;
  if (!posts)
    return (
      <p className="flex items-center gap-2 text-xs text-(--color-text-muted)">
        <Loader2 size={13} className="animate-spin" /> Gönderiler yükleniyor...
      </p>
    );
  if (posts.length === 0) return <p className="text-xs text-(--color-text-muted)">Gönderi bulunamadı.</p>;
  return (
    <div className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-5">
      {posts.map((p) => (
        <button
          key={`${p.kind}-${p.id}`}
          type="button"
          onClick={() => onChange(value?.id === p.id ? null : p)}
          title={p.text ?? ""}
          className={`relative aspect-square overflow-hidden rounded-lg border-2 ${value?.id === p.id ? "border-brand-500" : "border-transparent"}`}
        >
          {p.thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-(--color-surface-muted) p-1 text-[10px] text-(--color-text-muted)">{(p.text ?? "").slice(0, 60)}</div>
          )}
          <span className={`absolute left-1 top-1 rounded px-1 text-[10px] font-bold text-white ${p.kind === "ig" ? "bg-pink-600" : "bg-blue-600"}`}>{p.kind === "ig" ? "IG" : "FB"}</span>
          <span className="absolute bottom-0 left-0 right-0 bg-black/55 px-1 text-[10px] text-white">{new Date(p.date).toLocaleDateString("tr-TR")}</span>
        </button>
      ))}
    </div>
  );
}

function LeadFormCreator({ accountId, onCreated }: { accountId: string; onCreated: (f: { id: string; name: string }) => void }) {
  const [name, setName] = useState("İletişim formu");
  const [questions, setQuestions] = useState<string[]>(["FULL_NAME", "PHONE"]);
  const [privacyUrl, setPrivacyUrl] = useState("");
  const [intro, setIntro] = useState("");
  const [thankTitle, setThankTitle] = useState("Teşekkürler!");
  const [thankBody, setThankBody] = useState("Bilgilerinizi aldık, en kısa sürede size dönüş yapacağız.");
  const [website, setWebsite] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2 rounded-lg border border-(--color-border) p-3">
      <Field label="Form adı">
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
      </Field>
      <div>
        <span className="mb-1 block text-xs font-medium">Sorular</span>
        <div className="flex flex-wrap gap-3">
          {LEAD_QUESTIONS.map((q) => (
            <label key={q.value} className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" checked={questions.includes(q.value)} onChange={() => setQuestions(questions.includes(q.value) ? questions.filter((x) => x !== q.value) : [...questions, q.value])} />
              {q.label}
            </label>
          ))}
        </div>
      </div>
      <Field label="Giriş metni (isteğe bağlı)">
        <textarea value={intro} onChange={(e) => setIntro(e.target.value)} rows={2} className={inputCls} />
      </Field>
      <Field label="Gizlilik politikası bağlantısı" hint="Meta zorunlu tutuyor.">
        <input value={privacyUrl} onChange={(e) => setPrivacyUrl(e.target.value)} placeholder="https://" className={inputCls} />
      </Field>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Field label="Teşekkür başlığı">
          <input value={thankTitle} onChange={(e) => setThankTitle(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Web sitesi (teşekkür butonu, isteğe bağlı)">
          <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" className={inputCls} />
        </Field>
      </div>
      <Field label="Teşekkür metni">
        <textarea value={thankBody} onChange={(e) => setThankBody(e.target.value)} rows={2} className={inputCls} />
      </Field>
      {error && <p className={errorBox}>{error}</p>}
      <button
        type="button"
        disabled={pending}
        className={btnGhost}
        onClick={() => {
          setError(null);
          start(async () => {
            const r = await createAdLeadForm(accountId, { name, questions, privacyUrl, privacyText: "Gizlilik politikası", intro, thankTitle, thankBody, website });
            if (!r.ok) return setError(r.error);
            onCreated({ id: r.id, name: r.name });
          });
        }}
      >
        {pending && <Loader2 size={12} className="animate-spin" />} Formu oluştur
      </button>
    </div>
  );
}

export function AdEditor({
  ad,
  onChange,
  accountId,
  objective,
  destination,
  ctx,
  onLeadFormCreated,
  allowExisting = true,
}: {
  ad: AdDraft;
  onChange: (a: AdDraft) => void;
  accountId: string;
  objective: ObjectiveKey;
  destination: MessageDestination;
  ctx: Ctx | null;
  onLeadFormCreated?: (f: { id: string; name: string; status: string }) => void;
  allowExisting?: boolean;
}) {
  const set = (patch: Partial<AdDraft>) => onChange({ ...ad, ...patch });
  const library = ctx?.media ?? [];
  const isMessage = objective === "MESSAGES";
  const isLead = objective === "LEADS_FORM";
  const variants = supportsVariants(objective);
  const linkMode = LINK_REQUIRED.includes(objective) ? "required" : LINK_OPTIONAL.includes(objective) ? "optional" : null;
  const [creatingForm, setCreatingForm] = useState(false);
  const [previewFormat, setPreviewFormat] = useState("INSTAGRAM_STANDARD");
  const [preview, setPreview] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, startPreview] = useTransition();
  const fillText = (text: string) => {
    if (!ad.texts[0]?.trim()) set({ texts: [text, ...ad.texts.slice(1)] });
  };

  return (
    <div className="space-y-4">
      <Field label="Reklam adı">
        <input value={ad.name} onChange={(e) => set({ name: e.target.value })} className={inputCls} />
      </Field>
      <Tabs
        value={ad.format}
        onChange={(format) => set({ format, ...(format === "carousel" && ad.cards.length === 0 ? { cards: [1, 2].map(() => ({ media: null, headline: "", description: "", link: "" })) } : {}) })}
        options={[
          { value: "single", label: "Tek görsel / video" },
          { value: "carousel", label: "Kaydırmalı (carousel)" },
          ...(allowExisting ? [{ value: "existing" as const, label: "Mevcut gönderiyi öne çıkar" }] : []),
        ]}
      />

      {ad.format === "single" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <MediaField label="Görsel / video (akış)" accountId={accountId} library={library} value={ad.media} onChange={(media) => set({ media })} onPickText={fillText} />
          {variants ? (
            <MediaField
              label="Hikaye / Reels için 9:16 (isteğe bağlı)"
              hint="Seçersen hikaye ve Reels'te bu, akışta diğeri gösterilir. İkisi aynı türde (görsel / video) olmalı; bu durumda tek metin / başlık kullanılır."
              accountId={accountId}
              library={library}
              value={ad.storyMedia}
              onChange={(storyMedia) => set({ storyMedia })}
            />
          ) : (
            <p className="self-center text-[11px] text-(--color-text-muted)">
              Bu amaçta Meta hikayeye özel ayrı görsel kabul etmiyor; hikaye ve Reels&apos;te aynı medya kırpılarak gösterilir. Dikey (9:16) içerik için ayrı bir reklam ekleyip yerleşimini elle hikaye / Reels seçebilirsin.
            </p>
          )}
        </div>
      )}

      {ad.format === "carousel" && (
        <div className="space-y-2">
          {ad.cards.map((c, i) => (
            <div key={i} className="space-y-2 rounded-lg border border-(--color-border) p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">Kart {i + 1}</span>
                {ad.cards.length > 2 && (
                  <button type="button" onClick={() => set({ cards: ad.cards.filter((_, j) => j !== i) })} className="text-(--color-text-muted) hover:text-brand-600">
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
              <MediaField label="Görsel / video" accountId={accountId} library={library} value={c.media} onChange={(media) => set({ cards: ad.cards.map((x, j) => (j === i ? { ...x, media } : x)) })} onPickText={fillText} />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input value={c.headline} onChange={(e) => set({ cards: ad.cards.map((x, j) => (j === i ? { ...x, headline: e.target.value } : x)) })} placeholder="Kart başlığı" className={inputCls} />
                <input value={c.description} onChange={(e) => set({ cards: ad.cards.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)) })} placeholder="Kart açıklaması" className={inputCls} />
                {linkMode && (
                  <input value={c.link} onChange={(e) => set({ cards: ad.cards.map((x, j) => (j === i ? { ...x, link: e.target.value } : x)) })} placeholder="Kart bağlantısı (boş = ana bağlantı)" className={`${inputCls} sm:col-span-2`} />
                )}
              </div>
            </div>
          ))}
          {ad.cards.length < 10 && (
            <button type="button" onClick={() => set({ cards: [...ad.cards, { media: null, headline: "", description: "", link: "" }] })} className={btnGhost}>
              <Plus size={12} /> Kart ekle
            </button>
          )}
        </div>
      )}

      {ad.format === "existing" && (
        <div className="space-y-2">
          <p className="text-xs text-(--color-text-muted)">Gönderinin beğeni ve yorumları reklamda korunur. Metin ve görsel gönderinin kendisidir.</p>
          <ExistingPostPicker accountId={accountId} value={ad.existing} onChange={(existing) => set({ existing })} />
        </div>
      )}

      {ad.format !== "existing" && (
        <>
          <TextList label="Ana metin" values={ad.texts} onChange={(texts) => set({ texts })} max={variants ? 5 : 1} multiline placeholder="Reklamın ana metni" />
          <TextList label="Başlık (isteğe bağlı)" values={ad.headlines} onChange={(headlines) => set({ headlines })} max={variants ? 5 : 1} placeholder={isMessage ? "ör. Bize yazın" : "ör. Hemen inceleyin"} />
          {!variants && <p className="text-[11px] text-(--color-text-muted)">Bu amaçta Meta tek metin / başlık kabul ediyor. Farklı metinleri denemek için &quot;Reklamı çoğalt&quot; ile ayrı reklamlar ekle.</p>}
          {(linkMode || isLead) && (
            <Field label="Açıklama (isteğe bağlı)">
              <input value={ad.description} onChange={(e) => set({ description: e.target.value })} className={inputCls} />
            </Field>
          )}
        </>
      )}

      {(linkMode || (ad.format === "existing" && !isMessage && !isLead && objective !== "PROFILE" && objective !== "PAGE_LIKES")) && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Field label={`Web sitesi bağlantısı${linkMode === "required" ? "" : " (isteğe bağlı)"}`} className="sm:col-span-2">
            <input value={ad.link} onChange={(e) => set({ link: e.target.value })} placeholder="https://" className={inputCls} />
          </Field>
          <Field label="Buton">
            <select value={ad.cta} onChange={(e) => set({ cta: e.target.value })} className={inputCls}>
              {CTA_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}

      {isLead && (
        <div className="space-y-2">
          {ctx && !ctx.leadTosAccepted && (
            <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
              Bu sayfa Meta&apos;nın potansiyel müşteri koşullarını henüz kabul etmemiş; form reklamı kurulamaz.{" "}
              {ctx.leadTosUrl && (
                <a href={ctx.leadTosUrl} target="_blank" rel="noreferrer" className="font-semibold underline">
                  Koşulları kabul et
                </a>
              )}{" "}
              (sayfa yöneticisi bir kez onaylamalı).
            </p>
          )}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Field label="Anlık form" className="sm:col-span-2">
              <select value={ad.leadFormId} onChange={(e) => set({ leadFormId: e.target.value })} className={inputCls}>
                <option value="">Seçin</option>
                {(ctx?.leadForms ?? []).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Buton">
              <select value={ad.cta} onChange={(e) => set({ cta: e.target.value })} className={inputCls}>
                {CTA_OPTIONS.filter((c) => LEAD_CTAS.includes(c.value)).map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <button type="button" onClick={() => setCreatingForm((v) => !v)} className={btnGhost}>
            <Plus size={12} /> Yeni form oluştur
          </button>
          {creatingForm && (
            <LeadFormCreator
              accountId={accountId}
              onCreated={(f) => {
                onLeadFormCreated?.({ ...f, status: "ACTIVE" });
                set({ leadFormId: f.id });
                setCreatingForm(false);
              }}
            />
          )}
        </div>
      )}

      {isMessage && (ad.format !== "existing" || ad.existing?.kind !== "fb") && (
        <div className="space-y-2">
          <Field
            label="Karşılama mesajı (isteğe bağlı)"
            hint={ad.storyMedia ? "Hikayeye özel medya seçiliyken karşılama mesajı Meta'da kullanılamaz." : `Fiyat için gereken bilgileri burada isteyin. ${ad.welcomeText.length}/300 karakter`}
          >
            <textarea
              value={ad.welcomeText}
              onChange={(e) => set({ welcomeText: e.target.value })}
              rows={4}
              maxLength={300}
              className={inputCls}
              placeholder={"ör. Merhaba! Hemen fiyat verebilmemiz için lütfen yazın:\n1. Ev/ofis, kaç oda\n2. Nereden → nereye\n3. Kat ve asansör durumu\n4. Tarih"}
            />
          </Field>
          <div className="space-y-1.5">
            <span className="block text-xs font-medium">Hazır sorular (isteğe bağlı, en fazla 4)</span>
            <p className="text-[11px] text-(--color-text-muted)">Kişi bir soruya bastığında altındaki otomatik cevap anında gönderilir (en fazla 300 karakter).</p>
            {ad.welcomeQuestions.map((q, i) => {
              const answers = ad.welcomeAnswers ?? [];
              const answer = answers[i] ?? "";
              return (
                <div key={i} className="space-y-1 rounded-md border border-(--color-border) p-2">
                  <div className="flex gap-1.5">
                    <input
                      value={q}
                      onChange={(e) => set({ welcomeQuestions: ad.welcomeQuestions.map((x, j) => (j === i ? e.target.value : x)) })}
                      className={inputCls}
                      placeholder="ör. Fiyat teklifi almak istiyorum"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        set({
                          welcomeQuestions: ad.welcomeQuestions.filter((_, j) => j !== i),
                          welcomeAnswers: ad.welcomeQuestions.map((_, j) => answers[j] ?? "").filter((_, j) => j !== i),
                        })
                      }
                      className="rounded-md p-2 text-(--color-text-muted) hover:bg-(--color-surface-muted)"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <textarea
                    value={answer}
                    onChange={(e) => set({ welcomeAnswers: ad.welcomeQuestions.map((_, j) => (j === i ? e.target.value : answers[j] ?? "")) })}
                    rows={2}
                    maxLength={300}
                    className={inputCls}
                    placeholder="Otomatik cevap (isteğe bağlı) — ör. Hemen yardımcı olalım! Lütfen nereden nereye, kaç oda, kat/asansör ve tarihi yazın."
                  />
                  {answer && <p className="text-right text-[11px] text-(--color-text-muted)">{answer.length}/300</p>}
                </div>
              );
            })}
            {ad.welcomeQuestions.length < 4 && (
              <button
                type="button"
                onClick={() => set({ welcomeQuestions: [...ad.welcomeQuestions, ""], welcomeAnswers: [...ad.welcomeQuestions.map((_, j) => (ad.welcomeAnswers ?? [])[j] ?? ""), ""] })}
                className="text-xs font-medium text-brand-600 hover:underline"
              >
                + Soru ekle
              </button>
            )}
          </div>
        </div>
      )}

      <details className="text-xs">
        <summary className="cursor-pointer text-(--color-text-muted)">Gelişmiş: UTM, kreatif iyileştirmeleri</summary>
        <div className="mt-2 space-y-2">
          <Field label="URL parametreleri (UTM)" hint="ör. utm_source=meta&utm_medium=paid&utm_campaign=kasim">
            <input value={ad.utm} onChange={(e) => set({ utm: e.target.value })} className={inputCls} />
          </Field>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={ad.enhancements} onChange={(e) => set({ enhancements: e.target.checked })} className="mt-0.5 h-4 w-4" />
            <span>
              Meta&apos;nın otomatik kreatif iyileştirmeleri
              <span className="block text-xs text-(--color-text-muted)">Parlaklık / kırpma ayarı, müzik, metin önerisi, animasyon vb. Kapalıyken reklam tam hazırladığın gibi gösterilir.</span>
            </span>
          </label>
        </div>
      </details>

      <div className="space-y-2 rounded-lg bg-(--color-surface-muted) p-3">
        <div className="flex flex-wrap items-center gap-2">
          <select value={previewFormat} onChange={(e) => setPreviewFormat(e.target.value)} className={`${inputCls} w-auto flex-1`}>
            {PREVIEW_FORMATS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={btnGhost}
            disabled={previewing}
            onClick={() => {
              setPreviewError(null);
              startPreview(async () => {
                const r = await previewAdCreative(accountId, { objective, destination }, ad, previewFormat);
                if (!r.ok) {
                  setPreview(null);
                  return setPreviewError(r.error);
                }
                setPreview(r.html);
              });
            }}
          >
            {previewing ? <Loader2 size={12} className="animate-spin" /> : <Eye size={12} />} Önizle
          </button>
        </div>
        {previewError && <p className={errorBox}>{previewError}</p>}
        {preview && <div className="flex justify-center overflow-x-auto [&_iframe]:max-w-full" dangerouslySetInnerHTML={{ __html: preview }} />}
      </div>
    </div>
  );
}
