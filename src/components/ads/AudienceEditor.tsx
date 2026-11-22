"use client";

import { useState, useTransition } from "react";
import { Loader2, MapPin, Plus } from "lucide-react";
import { createAdAudience, searchAdDetailed, searchAdLocales, searchAdLocations } from "@/lib/actions/adManage";
import { PLACEMENTS, placementId, type AudienceDraft, type LocationPick } from "@/lib/adsTypes";
import { Chip, Field, SearchPick, Tabs, btnGhost, errorBox, inputCls } from "./ui";

const LOC_TYPE: Record<LocationPick["type"], string> = {
  country: "Ülke",
  region: "İl",
  city: "Şehir (yarıçaplı)",
  medium_geo_area: "İlçe",
  neighborhood: "Semt",
};
const DETAIL_TYPE: Record<string, string> = {
  interests: "İlgi alanı",
  behaviors: "Davranış",
  family_statuses: "Ebeveynlik",
  life_events: "Yaşam olayı",
  education_statuses: "Eğitim",
  education_schools: "Okul",
  education_majors: "Bölüm",
  work_positions: "Unvan",
  work_employers: "İşveren",
  industries: "Sektör",
  relationship_statuses: "İlişki durumu",
  income: "Gelir",
  user_adclusters: "Grup",
};
const PLATFORM_LABEL: Record<string, string> = { facebook: "Facebook", instagram: "Instagram", messenger: "Messenger", audience_network: "Audience Network" };

export type AudienceOption = { id: string; name: string; type: string; size: number | null };

export function AudienceEditor({
  value,
  onChange,
  accountId,
  audiences,
  onAudienceCreated,
  special,
}: {
  value: AudienceDraft;
  onChange: (v: AudienceDraft) => void;
  accountId: string;
  audiences: AudienceOption[];
  onAudienceCreated?: (a: AudienceOption) => void;
  special: boolean;
}) {
  const set = (patch: Partial<AudienceDraft>) => onChange({ ...value, ...patch });
  const nf = new Intl.NumberFormat("tr-TR", { notation: "compact" });

  const locSearch = async (q: string) => {
    const r = await searchAdLocations(q);
    return r.ok ? r.items : [];
  };
  const renderLoc = (it: LocationPick) => (
    <>
      <span>{it.name}</span>
      <span className="text-[11px] text-(--color-text-muted)">{LOC_TYPE[it.type]}</span>
    </>
  );

  return (
    <div className="space-y-4">
      {value.preservedNote && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">{value.preservedNote}</p>}

      {/* Konum */}
      <div className="space-y-2">
        <span className="block text-xs font-medium">Konum</span>
        {value.locations.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {value.locations.map((l) => (
              <Chip key={`${l.type}-${l.key}`} onRemove={() => set({ locations: value.locations.filter((x) => x !== l) })}>
                <MapPin size={11} /> {l.name}
                {l.type === "city" && (
                  <select
                    value={l.radius ?? 25}
                    onChange={(e) => set({ locations: value.locations.map((x) => (x === l ? { ...x, radius: Number(e.target.value) } : x)) })}
                    className="rounded bg-transparent text-[11px] text-(--color-text-muted) outline-none"
                  >
                    {[17, 25, 40, 60, 80].map((r) => (
                      <option key={r} value={r}>
                        +{r} km
                      </option>
                    ))}
                  </select>
                )}
              </Chip>
            ))}
          </div>
        ) : (
          <p className="text-xs text-(--color-text-muted)">Seçilmezse tüm Türkiye.</p>
        )}
        <SearchPick
          placeholder="İl, ilçe, semt ya da ülke ara (ör. İzmir, Karşıyaka)"
          search={locSearch}
          itemKey={(it) => `${it.type}-${it.key}`}
          render={renderLoc}
          onPick={(it) => !value.locations.some((v) => v.type === it.type && v.key === it.key) && set({ locations: [...value.locations, it] })}
        />
        <details className="text-xs">
          <summary className="cursor-pointer text-(--color-text-muted)">Konum hariç tut / kimleri kapsasın</summary>
          <div className="mt-2 space-y-2">
            {value.excludedLocations.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {value.excludedLocations.map((l) => (
                  <Chip key={`${l.type}-${l.key}`} tone="exclude" onRemove={() => set({ excludedLocations: value.excludedLocations.filter((x) => x !== l) })}>
                    hariç: {l.name}
                  </Chip>
                ))}
              </div>
            )}
            <SearchPick
              placeholder="Hariç tutulacak konum ara"
              search={locSearch}
              itemKey={(it) => `${it.type}-${it.key}`}
              render={renderLoc}
              onPick={(it) =>
                !value.excludedLocations.some((v) => v.type === it.type && v.key === it.key) &&
                set({ excludedLocations: [...value.excludedLocations, { ...it, radius: undefined }] })
              }
            />
            <select value={value.locationMode} onChange={(e) => set({ locationMode: e.target.value as AudienceDraft["locationMode"] })} className={inputCls}>
              <option value="all">Bu konumlarda yaşayan ya da son zamanlarda bulunan herkes</option>
              <option value="home">Sadece bu konumlarda yaşayanlar</option>
            </select>
          </div>
        </details>
      </div>

      {/* Yaş / cinsiyet / dil */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Field label="Yaş (en az)">
          <input type="number" min={13} max={65} value={value.ageMin} onChange={(e) => set({ ageMin: Number(e.target.value) })} className={inputCls} disabled={special} />
        </Field>
        <Field label="Yaş (en çok)">
          <input type="number" min={13} max={65} value={value.ageMax} onChange={(e) => set({ ageMax: Number(e.target.value) })} className={inputCls} disabled={special} />
        </Field>
        <Field label="Cinsiyet" className="col-span-2">
          <select value={value.gender} onChange={(e) => set({ gender: e.target.value as AudienceDraft["gender"] })} className={inputCls} disabled={special}>
            <option value="all">Tümü</option>
            <option value="female">Kadın</option>
            <option value="male">Erkek</option>
          </select>
        </Field>
      </div>
      <div className="space-y-2">
        <span className="block text-xs font-medium">Dil (isteğe bağlı)</span>
        {value.locales.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {value.locales.map((l) => (
              <Chip key={l.key} onRemove={() => set({ locales: value.locales.filter((x) => x.key !== l.key) })}>
                {l.name}
              </Chip>
            ))}
          </div>
        )}
        <SearchPick
          placeholder="Dil ara (ör. Türkçe, İngilizce)"
          search={async (q) => {
            const r = await searchAdLocales(q);
            return r.ok ? r.items : [];
          }}
          itemKey={(it) => String(it.key)}
          render={(it) => <span>{it.name}</span>}
          onPick={(it) => !value.locales.some((l) => l.key === it.key) && set({ locales: [...value.locales, it] })}
        />
      </div>

      {/* Detaylı hedefleme */}
      <div className="space-y-2">
        <span className="block text-xs font-medium">Detaylı hedefleme: ilgi alanı, davranış, demografi (isteğe bağlı)</span>
        {special && <p className="text-[11px] text-(--color-text-muted)">Özel kategoride detaylı hedefleme kullanılamaz.</p>}
        {value.detailed.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {value.detailed.map((d) => (
              <Chip key={`${d.type}-${d.id}`} onRemove={() => set({ detailed: value.detailed.filter((x) => x !== d) })}>
                <span className="text-(--color-text-muted)">{DETAIL_TYPE[d.type] ?? d.type}:</span> {d.name}
              </Chip>
            ))}
          </div>
        )}
        {!special && (
          <SearchPick
            placeholder="Ara (ör. bilgisayar, küçük işletme sahipleri, yeni evliler)"
            search={async (q) => {
              const r = await searchAdDetailed(accountId, q);
              return r.ok ? r.items : [];
            }}
            itemKey={(it) => `${it.type}-${it.id}`}
            render={(it) => (
              <>
                <span className="min-w-0">
                  <span className="block truncate">{it.name}</span>
                  <span className="block truncate text-[11px] text-(--color-text-muted)">{DETAIL_TYPE[it.type] ?? it.type}{it.path ? ` · ${it.path}` : ""}</span>
                </span>
                {it.size != null && <span className="shrink-0 text-[11px] text-(--color-text-muted)">{nf.format(it.size)} kişi</span>}
              </>
            )}
            onPick={(it) => !value.detailed.some((d) => d.id === it.id && d.type === it.type) && set({ detailed: [...value.detailed, { id: it.id, name: it.name, type: it.type }] })}
          />
        )}
        <p className="text-[11px] text-(--color-text-muted)">Seçilenlerden herhangi birine uyan kişiler hedeflenir. (Meta, ilgi alanı / davranış hariç tutmayı kaldırdı.)</p>
      </div>

      {/* Özel kitleler */}
      <CustomAudienceField value={value} set={set} accountId={accountId} audiences={audiences} onCreated={onAudienceCreated} />

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={value.advantage && !special} disabled={special} onChange={(e) => set({ advantage: e.target.checked })} className="mt-0.5 h-4 w-4" />
        <span>
          Advantage+ hedef kitle
          <span className="block text-xs text-(--color-text-muted)">
            Açıkken yaş, cinsiyet ve detaylı hedefleme Meta&apos;ya öneri olarak gider; daha iyi sonuç bulursa dışına çıkabilir (konum ve özel kitle hariç tutmaları hep korunur). Kesin sınır için kapat.
          </span>
        </span>
      </label>

      {/* Yerleşimler */}
      <div className="space-y-2">
        <span className="block text-xs font-medium">Yerleşimler</span>
        <Tabs
          value={value.placements.mode}
          onChange={(mode) => set({ placements: { mode, ids: mode === "manual" && value.placements.ids.length === 0 ? PLACEMENTS.slice(0, 3).map(placementId).concat(["instagram:stream", "instagram:story", "instagram:reels"]) : value.placements.ids } })}
          options={[
            { value: "auto", label: "Otomatik (önerilen)" },
            { value: "manual", label: "Elle seç" },
          ]}
        />
        {value.placements.mode === "manual" && (
          <div className="grid grid-cols-1 gap-x-4 gap-y-1 rounded-lg border border-(--color-border) p-3 sm:grid-cols-2">
            {(["facebook", "instagram", "messenger", "audience_network"] as const).map((pl) => (
              <div key={pl} className="space-y-1">
                <p className="text-[11px] font-semibold uppercase text-(--color-text-muted)">{PLATFORM_LABEL[pl]}</p>
                {PLACEMENTS.filter((p) => p.platform === pl).map((p) => {
                  const pid = placementId(p);
                  const on = value.placements.ids.includes(pid);
                  return (
                    <label key={pid} className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => set({ placements: { mode: "manual", ids: on ? value.placements.ids.filter((x) => x !== pid) : [...value.placements.ids, pid] } })}
                        className="h-3.5 w-3.5"
                      />
                      {p.label}
                    </label>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CustomAudienceField({
  value,
  set,
  accountId,
  audiences,
  onCreated,
}: {
  value: AudienceDraft;
  set: (p: Partial<AudienceDraft>) => void;
  accountId: string;
  audiences: AudienceOption[];
  onCreated?: (a: AudienceOption) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [kind, setKind] = useState<"ig" | "page" | "lookalike">("ig");
  const [days, setDays] = useState(365);
  const [ratio, setRatio] = useState(1);
  const [sourceId, setSourceId] = useState("");
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const chosen = new Set([...value.customAudiences, ...value.excludedAudiences].map((a) => a.id));
  const nf = new Intl.NumberFormat("tr-TR");

  const create = () => {
    setError(null);
    start(async () => {
      const r = await createAdAudience(accountId, { kind, days, ratio, sourceId, name });
      if (!r.ok) return setError(r.error);
      onCreated?.({ id: r.id, name: r.name, type: kind === "lookalike" ? "Benzer kitle" : "Etkileşim", size: null });
      set({ customAudiences: [...value.customAudiences, { id: r.id, name: r.name }] });
      setCreating(false);
      setName("");
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium">Özel ve benzer kitleler (isteğe bağlı)</span>
        <button type="button" onClick={() => setCreating((v) => !v)} className={btnGhost}>
          <Plus size={12} /> Kitle oluştur
        </button>
      </div>
      {(value.customAudiences.length > 0 || value.excludedAudiences.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {value.customAudiences.map((a) => (
            <Chip key={a.id} onRemove={() => set({ customAudiences: value.customAudiences.filter((x) => x.id !== a.id) })}>
              {a.name}
            </Chip>
          ))}
          {value.excludedAudiences.map((a) => (
            <Chip key={a.id} tone="exclude" onRemove={() => set({ excludedAudiences: value.excludedAudiences.filter((x) => x.id !== a.id) })}>
              hariç: {a.name}
            </Chip>
          ))}
        </div>
      )}
      {audiences.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          <select
            value=""
            onChange={(e) => {
              const a = audiences.find((x) => x.id === e.target.value);
              if (a) set({ customAudiences: [...value.customAudiences, { id: a.id, name: a.name }] });
            }}
            className={`${inputCls} flex-1`}
          >
            <option value="">+ Kitle ekle (dahil et)</option>
            {audiences.filter((a) => !chosen.has(a.id)).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.type}
                {a.size != null ? ` · ${nf.format(a.size)}+` : ""}
              </option>
            ))}
          </select>
          <select
            value=""
            onChange={(e) => {
              const a = audiences.find((x) => x.id === e.target.value);
              if (a) set({ excludedAudiences: [...value.excludedAudiences, { id: a.id, name: a.name }] });
            }}
            className={`${inputCls} flex-1`}
          >
            <option value="">− Kitle hariç tut</option>
            {audiences.filter((a) => !chosen.has(a.id)).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <p className="text-[11px] text-(--color-text-muted)">Bu reklam hesabında henüz özel kitle yok.</p>
      )}
      {creating && (
        <div className="space-y-2 rounded-lg border border-(--color-border) p-3">
          <Tabs
            value={kind}
            onChange={setKind}
            options={[
              { value: "ig", label: "Instagram etkileşimi" },
              { value: "page", label: "Facebook sayfa etkileşimi" },
              { value: "lookalike", label: "Benzer kitle" },
            ]}
          />
          {kind === "lookalike" ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Field label="Kaynak kitle" hint="Kaynakta en az 100 kişi olmalı.">
                <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} className={inputCls}>
                  <option value="">Seçin</option>
                  {audiences.filter((a) => a.type !== "Benzer kitle").map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Benzerlik (Türkiye)" hint="%1 en benzer, %10 en geniş.">
                <select value={ratio} onChange={(e) => setRatio(Number(e.target.value))} className={inputCls}>
                  {[1, 2, 3, 5, 10].map((r) => (
                    <option key={r} value={r}>
                      %{r}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          ) : (
            <Field label="Süre" hint={kind === "ig" ? "Profili ziyaret eden, gönderilerle etkileşen, mesaj atan, reklama tıklayan herkes." : "Sayfa ve gönderileriyle etkileşime giren herkes."}>
              <select value={days} onChange={(e) => setDays(Number(e.target.value))} className={inputCls}>
                {[30, 60, 90, 180, 365].map((d) => (
                  <option key={d} value={d}>
                    Son {d} gün
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Kitle adı (isteğe bağlı)">
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </Field>
          {error && <p className={errorBox}>{error}</p>}
          <button type="button" onClick={create} disabled={pending || (kind === "lookalike" && !sourceId)} className={btnGhost}>
            {pending && <Loader2 size={12} className="animate-spin" />} Oluştur ve ekle
          </button>
          <p className="text-[11px] text-(--color-text-muted)">Yeni kitlenin dolması Meta&apos;da birkaç saat sürebilir.</p>
        </div>
      )}
    </div>
  );
}
