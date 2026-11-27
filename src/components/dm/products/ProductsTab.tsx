import { prisma } from "@/lib/prisma";
import { cardCls, fmtDateTime } from "../ui";
import { ImportProducts, ManualProductForm, ProductToggle, StoreConnectionForm } from "./ProductForms";

/** Ürünler sekmesi: mağaza bağlantısı, Excel/CSV, elle ekleme ve ürün listesi. */
export async function ProductsTab({ clientId }: { clientId: string }) {
  const [conns, products] = await Promise.all([
    prisma.dmStoreConnection.findMany({ where: { clientId } }),
    prisma.dmProduct.findMany({ where: { clientId }, orderBy: [{ isActive: "desc" }, { name: "asc" }], take: 500, include: { variants: true, connection: { select: { platform: true } }, embeddings: { select: { id: true } } } }),
  ]);
  const shopify = conns.find((c) => c.platform === "SHOPIFY");
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1.3fr]">
      <div className="space-y-4">
        <StoreConnectionForm
          clientId={clientId}
          shopify={shopify ? { id: shopify.id, domain: shopify.shopDomain, lastSyncAt: shopify.lastSyncAt ? fmtDateTime(shopify.lastSyncAt) : null, lastError: shopify.lastError } : null}
        />
        <ImportProducts clientId={clientId} />
        <ManualProductForm clientId={clientId} />
        {conns.filter((c) => c.platform !== "SHOPIFY" && c.platform !== "MANUAL" && c.lastError).map((c) => (
          <p key={c.id} className="text-xs text-amber-700">{c.platform}: {c.lastError}</p>
        ))}
      </div>
      <section className={cardCls}>
        <h3 className="mb-1 text-sm font-bold">Ürünler ({products.length})</h3>
        <p className="mb-2 text-xs text-(--color-text-muted)">AI yalnızca aktif ürünleri önerir. Fiyat ve stok buradan / mağazadan okunur, asla uydurulmaz.</p>
        {products.length === 0 && <p className="text-xs text-(--color-text-muted)">Henüz ürün yok.</p>}
        <ul className="divide-y divide-(--color-border) text-sm">
          {products.map((p) => {
            const img = Array.isArray(p.images) ? (p.images as string[])[0] : undefined;
            return (
              <li key={p.id} className={`flex gap-3 py-2 ${p.isActive ? "" : "opacity-50"}`}>
                {img ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={img} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />
                ) : (
                  <span className="h-12 w-12 shrink-0 rounded bg-(--color-surface-muted)" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{p.name}</p>
                  <p className="truncate text-xs text-(--color-text-muted)">
                    {p.price ? `${Number(p.price).toLocaleString("tr-TR")} ${p.currency === "TRY" ? "TL" : p.currency}` : "fiyat yok"} · {p.connection?.platform === "SHOPIFY" ? "Shopify" : "elle"}
                    {p.variants.length ? ` · ${p.variants.map((v) => `${v.title ?? "—"}${v.stock !== null ? ` (${v.stock})` : ""}`).join(", ")}` : ""}
                    {p.embeddings.length ? "" : " · arama hazırlanıyor"}
                  </p>
                </div>
                <ProductToggle id={p.id} active={p.isActive} />
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
