"use client";

import { useRef, useState } from "react";
import { importProductsFile, saveManualProduct, saveStoreConnection, setProductActive, syncNow } from "@/lib/actions/dmModules";
import { useAction } from "../useAction";
import { Feedback } from "../Feedback";
import { btnPrimary, btnSecondary, cardCls, inputCls, labelCls } from "../ui";

export function ImportProducts({ clientId }: { clientId: string }) {
  const ref = useRef<HTMLFormElement>(null);
  const [result, setResult] = useState<string | null>(null);
  const { pending, error, run } = useAction();
  return (
    <form
      ref={ref}
      className={`${cardCls} space-y-2`}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run(async () => {
          const r = await importProductsFile(clientId, fd);
          setResult(`${r.created} yeni, ${r.updated} güncellenen ürün.${r.errors.length ? ` Uyarılar: ${r.errors.join(" ")}` : ""}`);
          ref.current?.reset();
        });
      }}
    >
      <h3 className="text-sm font-bold">Excel / CSV ile yükle</h3>
      <p className="text-xs text-(--color-text-muted)">
        Sütunlar: <b>Ad</b>, Açıklama, Fiyat, Bağlantı, Görsel, SKU, Varyant (ör. &quot;Beden: M; Renk: Siyah&quot;), Stok. Her satır bir seçenek; aynı adlı satırlar tek
        ürün olur. Aynı adlı ürün varsa güncellenir.
      </p>
      <input name="file" type="file" accept=".xlsx,.csv,text/csv" className="text-sm" required />
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? "Yükleniyor…" : "Yükle"}
        </button>
        <Feedback error={error} info={result} />
      </div>
    </form>
  );
}

export function ManualProductForm({ clientId }: { clientId: string }) {
  const empty = { name: "", description: "", price: "", url: "", image: "", variants: "", stock: "" };
  const [v, setV] = useState(empty);
  const { pending, error, info, run } = useAction();
  const f = (k: keyof typeof empty, label: string, long = false) => (
    <div className={long ? "sm:col-span-2" : ""}>
      <label className={labelCls}>{label}</label>
      {long ? <textarea rows={2} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} className={inputCls} /> : <input value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} className={inputCls} />}
    </div>
  );
  return (
    <section className={`${cardCls} space-y-2`}>
      <h3 className="text-sm font-bold">Elle ürün ekle</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        {f("name", "Ürün adı")}
        {f("price", "Fiyat (TL)")}
        {f("url", "Ürün bağlantısı")}
        {f("image", "Görsel adresi")}
        {f("description", "Açıklama", true)}
        {f("variants", "Seçenekler ve stok (her satıra bir tane, ör. \"Beden: M = 5\")", true)}
        {!v.variants.trim() && f("stock", "Stok (seçenek yoksa)")}
      </div>
      <div className="flex items-center gap-3">
        <button type="button" disabled={pending || !v.name.trim()} onClick={() => run(() => saveManualProduct(clientId, v), "Ürün kaydedildi.", () => setV(empty))} className={btnSecondary}>
          Kaydet
        </button>
        <Feedback error={error} info={info} />
      </div>
    </section>
  );
}

export function StoreConnectionForm({ clientId, shopify }: { clientId: string; shopify: { domain: string | null; lastSyncAt: string | null; lastError: string | null; id: string } | null }) {
  const [platform, setPlatform] = useState<"SHOPIFY" | "IKAS" | "TICIMAX">("SHOPIFY");
  const [domain, setDomain] = useState(shopify?.domain ?? "");
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const { pending, error, info, run } = useAction();
  return (
    <section className={`${cardCls} space-y-2`}>
      <h3 className="text-sm font-bold">Mağaza bağlantısı</h3>
      {shopify && (
        <p className="text-xs">
          Shopify: {shopify.domain} · son senkron {shopify.lastSyncAt ?? "—"}
          {shopify.lastError && <span className="block text-rose-600">{shopify.lastError}</span>}
          <button type="button" disabled={pending} onClick={() => run(() => syncNow(shopify.id), "Senkron sıraya alındı.")} className="ml-2 font-semibold text-brand-600">
            Şimdi senkronla
          </button>
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-3">
        <div>
          <label className={labelCls}>Platform</label>
          <select value={platform} onChange={(e) => setPlatform(e.target.value as typeof platform)} className={inputCls}>
            <option value="SHOPIFY">Shopify</option>
            <option value="IKAS">İkas (hazırlanıyor)</option>
            <option value="TICIMAX">Ticimax (hazırlanıyor)</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Mağaza adresi</label>
          <input value={domain} onChange={(e) => setDomain(e.target.value)} className={inputCls} placeholder={platform === "SHOPIFY" ? "magaza.myshopify.com" : "magaza adresi"} />
        </div>
        <div>
          <label className={labelCls}>{platform === "SHOPIFY" ? "Admin API erişim anahtarı" : platform === "IKAS" ? "Client ID" : "Yetki kodu"}</label>
          <input type="password" value={a} onChange={(e) => setA(e.target.value)} className={inputCls} autoComplete="off" />
        </div>
        {platform === "IKAS" && (
          <div>
            <label className={labelCls}>Client Secret</label>
            <input type="password" value={b} onChange={(e) => setB(e.target.value)} className={inputCls} autoComplete="off" />
          </div>
        )}
      </div>
      {platform !== "SHOPIFY" && <p className="text-[11px] text-amber-700 dark:text-amber-300">Bu platformun otomatik senkronu ilk müşteri kurulurken tamamlanacak; şimdilik ürünleri Excel/CSV ile yükleyin.</p>}
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={pending || !domain.trim() || !a.trim()}
          onClick={() =>
            run(
              () => saveStoreConnection(clientId, { platform, shopDomain: domain, accessToken: a, clientIdKey: a, clientSecret: b, apiKey: a }),
              "Bağlantı kaydedildi; ürünler arka planda çekiliyor.",
              () => { setA(""); setB(""); }
            )
          }
          className={btnSecondary}
        >
          Bağla
        </button>
        <Feedback error={error} info={info} />
      </div>
    </section>
  );
}

export function ProductToggle({ id, active }: { id: string; active: boolean }) {
  const { pending, run } = useAction();
  return (
    <button type="button" disabled={pending} onClick={() => run(() => setProductActive(id, !active))} className="text-xs text-(--color-text-muted) hover:text-brand-600">
      {active ? "Pasife al" : "Aktifleştir"}
    </button>
  );
}
