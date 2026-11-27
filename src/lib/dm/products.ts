// Ürün / stok modülü: katalog (elle, Excel/CSV, Shopify), anlamsal arama (embedding, JSON + kosinüs), canlı stok.
// Fiyat ve stok asla uydurulmaz: AI yalnızca bu araçların sonucunu söyler. Stok sorgusu başarısızsa insana devredilir.
import crypto from "node:crypto";
import type { DmProduct, DmProductVariant, DmStoreConnection, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { registerTool } from "./tools";
import { aiDescribe, aiEmbed } from "./ai";
import { sendToConversation } from "./send";
import type { ImportedProduct } from "./productImport";

const SHOPIFY_VERSION = process.env.SHOPIFY_API_VERSION ?? "2025-10";
const EMBED_TAG = "metin";

type Creds = { accessToken?: string; clientId?: string; clientSecret?: string; apiKey?: string; storeCode?: string };
const credsOf = (c: DmStoreConnection): Creds => (c.credentials ? (JSON.parse(decryptSecret(c.credentials)) as Creds) : {});

export const cosine = (a: number[], b: number[]) => {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
};

const images = (p: DmProduct) => (Array.isArray(p.images) ? (p.images as string[]) : []);
const money = (v: Prisma.Decimal | null, cur: string) => (v === null ? "fiyat bilgisi yok" : `${Number(v).toLocaleString("tr-TR")} ${cur === "TRY" ? "TL" : cur}`);

// ---------- Shopify ----------
async function shopify<T>(c: DmStoreConnection, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const { accessToken } = credsOf(c);
  if (!c.shopDomain || !accessToken) throw new Error("Shopify mağaza adresi ya da erişim anahtarı eksik.");
  const res = await fetch(`https://${c.shopDomain.replace(/^https?:\/\//, "").replace(/\/$/, "")}/admin/api/${SHOPIFY_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": accessToken },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as { data?: T; errors?: unknown } | null;
  if (!res.ok || !json?.data) throw new Error(`Shopify hatası (${res.status}): ${JSON.stringify(json?.errors ?? "").slice(0, 200)}`);
  return json.data;
}

type ShopifyProducts = {
  products: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: {
      id: string; title: string; description: string; onlineStoreUrl: string | null; status: string;
      media: { nodes: { preview?: { image?: { url: string } | null } | null }[] };
      variants: { nodes: { id: string; sku: string | null; title: string; price: string; inventoryQuantity: number | null; selectedOptions: { name: string; value: string }[] }[] };
    }[];
  };
};

async function syncShopify(c: DmStoreConnection) {
  const seen = new Set<string>();
  let cursor: string | null = null;
  for (let page = 0; page < 40; page++) {
    const data: ShopifyProducts = await shopify<ShopifyProducts>(
      c,
      `query($cursor: String) { products(first: 50, after: $cursor) { pageInfo { hasNextPage endCursor } nodes {
        id title description onlineStoreUrl status
        media(first: 3) { nodes { preview { image { url } } } }
        variants(first: 50) { nodes { id sku title price inventoryQuantity selectedOptions { name value } } } } } }`,
      { cursor }
    );
    for (const p of data.products.nodes) {
      seen.add(p.id);
      const firstPrice = p.variants.nodes[0]?.price;
      const product = await prisma.dmProduct.upsert({
        where: { connectionId_externalId: { connectionId: c.id, externalId: p.id } },
        create: {
          clientId: c.clientId, connectionId: c.id, externalId: p.id, name: p.title, description: p.description?.slice(0, 4000) || null,
          price: firstPrice ? Number(firstPrice) : null, url: p.onlineStoreUrl,
          images: p.media.nodes.map((m) => m.preview?.image?.url).filter(Boolean) as string[], isActive: p.status === "ACTIVE",
        },
        update: {
          name: p.title, description: p.description?.slice(0, 4000) || null, price: firstPrice ? Number(firstPrice) : null, url: p.onlineStoreUrl,
          images: p.media.nodes.map((m) => m.preview?.image?.url).filter(Boolean) as string[], isActive: p.status === "ACTIVE",
        },
      });
      await prisma.dmProductVariant.deleteMany({ where: { productId: product.id } });
      await prisma.dmProductVariant.createMany({
        data: p.variants.nodes.map((v) => ({
          productId: product.id, externalId: v.id, sku: v.sku, title: v.title, price: Number(v.price),
          options: Object.fromEntries(v.selectedOptions.map((o) => [o.name, o.value])),
        })),
      });
    }
    if (!data.products.pageInfo.hasNextPage) break;
    cursor = data.products.pageInfo.endCursor;
  }
  await prisma.dmProduct.updateMany({ where: { connectionId: c.id, externalId: { notIn: [...seen] } }, data: { isActive: false } });
}

/** Mağaza senkronu (SYNC_PRODUCTS işi): ürünleri günceller, eksik embedding'leri hazırlar. */
export async function syncStore(connectionId: string) {
  const c = await prisma.dmStoreConnection.findUnique({ where: { id: connectionId } });
  if (!c || !c.isActive) return;
  try {
    if (c.platform === "SHOPIFY") await syncShopify(c);
    else if (c.platform === "IKAS" || c.platform === "TICIMAX") {
      throw new Error(`${c.platform === "IKAS" ? "İkas" : "Ticimax"} senkronu henüz hazır değil (API ilk müşteri kurulurken doğrulanacak). Şimdilik ürünleri Excel/CSV ile yükleyin.`);
    }
    await prisma.dmStoreConnection.update({ where: { id: c.id }, data: { lastSyncAt: new Date(), lastError: null } });
  } catch (e) {
    await prisma.dmStoreConnection.update({ where: { id: c.id }, data: { lastError: (e instanceof Error ? e.message : String(e)).slice(0, 500) } });
    throw e;
  }
  await ensureEmbeddings(c.clientId);
}

/** Ürün metni (+ ilk görselin AI tarifi) için embedding; ürün değişmediyse yeniden üretilmez. */
export async function ensureEmbeddings(clientId: string, limit = 200) {
  const products = await prisma.dmProduct.findMany({
    where: { clientId, isActive: true },
    include: { variants: true, embeddings: true },
    take: 2000,
  });
  let done = 0;
  for (const p of products) {
    if (done >= limit) break;
    // İçerik özeti değişmediyse (ad, açıklama, seçenekler, ilk görsel) yeniden üretilmez; senkron her ürünü güncellese de maliyet oluşmaz.
    const img = images(p)[0];
    const contentKey = crypto.createHash("sha1").update([p.name, p.description ?? "", p.variants.map((v) => v.title ?? "").join(","), img ?? ""].join("|")).digest("hex").slice(0, 16);
    if (p.embeddings.some((e) => e.imageUrl === EMBED_TAG && e.model.endsWith(`|${contentKey}`))) continue;
    let imageText = "";
    if (img) {
      try {
        const res = await fetch(img);
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          if (buf.length < 8 * 1024 * 1024) {
            const d = await aiDescribe(null, "Bu bir ürün fotoğrafı. Ürünü kısa ve ayırt edici şekilde tarif et (tür, renk, desen, malzeme, model).", { mimeType: res.headers.get("content-type")?.split(";")[0] ?? "image/jpeg", data: buf.toString("base64") }, { clientId, kind: "EMBEDDING" });
            imageText = d.text;
          }
        }
      } catch {
        // görsel tarif edilemezse yalnızca metin kullanılır
      }
    }
    const text = [p.name, p.description, p.variants.map((v) => v.title).filter(Boolean).join(", "), imageText].filter(Boolean).join(". ").slice(0, 6000);
    try {
      const { vector, ref } = await aiEmbed(text, { clientId, kind: "EMBEDDING" });
      await prisma.dmProductEmbedding.deleteMany({ where: { productId: p.id, imageUrl: EMBED_TAG } });
      await prisma.dmProductEmbedding.create({ data: { productId: p.id, imageUrl: EMBED_TAG, model: `${ref}|${contentKey}`, vector } });
      done++;
    } catch {
      break; // anahtar yoksa ya da hata: sonraki senkronda tekrar denenir
    }
  }
  return done;
}

export async function searchProducts(clientId: string, query: string, max = 5) {
  const products = await prisma.dmProduct.findMany({ where: { clientId, isActive: true }, include: { variants: true, embeddings: true }, take: 2000 });
  if (!products.length) return [];
  const tokens = query.toLocaleLowerCase("tr-TR").split(/\s+/).filter((t) => t.length > 2);
  let qv: number[] | null = null;
  if (products.some((p) => p.embeddings.length)) {
    try {
      qv = (await aiEmbed(query, { clientId, kind: "EMBEDDING" })).vector;
    } catch {
      qv = null;
    }
  }
  const scored = products.map((p) => {
    const hay = `${p.name} ${p.description ?? ""} ${p.variants.map((v) => v.title ?? "").join(" ")}`.toLocaleLowerCase("tr-TR");
    const text = tokens.length ? tokens.filter((t) => hay.includes(t)).length / tokens.length : 0;
    const emb = qv && p.embeddings[0] ? cosine(qv, p.embeddings[0].vector as number[]) : 0;
    return { p, score: emb * 0.7 + text * 0.6 };
  });
  return scored.filter((s) => s.score > 0.05).sort((a, b) => b.score - a.score).slice(0, max).map((s) => s.p);
}

const describeProduct = (p: DmProduct & { variants: DmProductVariant[] }) =>
  `[${p.id}] ${p.name} · ${money(p.price, p.currency)}${p.url ? ` · ${p.url}` : ""}${p.variants.length ? ` · seçenekler: ${p.variants.slice(0, 12).map((v) => v.title ?? JSON.stringify(v.options)).join(", ")}` : ""}${p.description ? ` · ${p.description.slice(0, 160)}` : ""}`;

/** Canlı stok: mağaza bağlıysa anlık sorgu, elle girilmiş üründe kayıtlı stok. */
export async function checkStock(clientId: string, productId: string, variantQuery?: string) {
  const p = await prisma.dmProduct.findFirst({ where: { id: productId, clientId }, include: { variants: true, connection: true } });
  if (!p) return { ok: false as const, text: "Ürün bulunamadı." };
  const matches = variantQuery
    ? p.variants.filter((v) => `${v.title ?? ""} ${JSON.stringify(v.options ?? {})} ${v.sku ?? ""}`.toLocaleLowerCase("tr-TR").includes(variantQuery.toLocaleLowerCase("tr-TR")))
    : p.variants;
  const list = matches.length ? matches : p.variants;
  if (p.connection?.platform === "SHOPIFY") {
    try {
      const out: string[] = [];
      for (const v of list.slice(0, 20)) {
        if (!v.externalId) continue;
        const d = await shopify<{ productVariant: { inventoryQuantity: number | null; title: string } | null }>(p.connection, `query($id: ID!) { productVariant(id: $id) { inventoryQuantity title } }`, { id: v.externalId });
        out.push(`${d.productVariant?.title ?? v.title}: ${d.productVariant?.inventoryQuantity ?? "bilinmiyor"}`);
      }
      return { ok: true as const, text: `${p.name} canlı stok → ${out.join("; ")}` };
    } catch {
      return { ok: false as const, text: "Mağazadan stok bilgisi alınamadı. Stok rakamı söyleme; handoff_to_human ile ekibe devret." };
    }
  }
  if (!list.length || list.every((v) => v.stock === null)) return { ok: false as const, text: "Bu ürün için stok bilgisi tutulmuyor. Stok rakamı söyleme; gerekirse ask_owner ile sor." };
  return { ok: true as const, text: `${p.name} stok → ${list.map((v) => `${v.title ?? "tek seçenek"}: ${v.stock ?? "bilinmiyor"}`).join("; ")}` };
}

registerTool({
  module: "products",
  readOnly: true,
  def: {
    name: "search_products",
    description: "Ürün kataloğunda arar (ad, açıklama, görsel tarifi). Kişi görsel gönderdiyse görselin tarifini sorgu olarak ver.",
    parameters: { type: "object", properties: { query: { type: "string", description: "Aranan ürün / tarif" } }, required: ["query"] },
  },
  async run(args, ctx) {
    const q = typeof args.query === "string" ? args.query.trim() : "";
    if (!q) return "Sorgu boş.";
    const found = await searchProducts(ctx.clientId, q);
    if (!found.length) return "Eşleşen ürün bulunamadı. Uydurma; kişiye ürün bulunamadığını söyle ya da ask_owner ile sor.";
    return `Adaylar (en uygundan başlayarak; köşeli parantezdeki id check_stock / send_product_images için):\n${found.map(describeProduct).join("\n")}`;
  },
});

registerTool({
  module: "products",
  readOnly: true,
  def: {
    name: "check_stock",
    description: "Bir ürünün (ve isteğe bağlı beden/renk seçeneğinin) stok durumunu canlı sorgular.",
    parameters: { type: "object", properties: { productId: { type: "string" }, variant: { type: "string", description: "Ör. 'M', 'Siyah', '38'" } }, required: ["productId"] },
  },
  async run(args, ctx) {
    return (await checkStock(ctx.clientId, String(args.productId ?? ""), typeof args.variant === "string" ? args.variant : undefined)).text;
  },
});

registerTool({
  module: "products",
  def: {
    name: "send_product_images",
    description: "Emin olamadığında 'şu modeli mi kastettiniz?' diye sormak için en fazla 3 aday ürünün görselini kişiye gönderir.",
    parameters: { type: "object", properties: { productIds: { type: "array", items: { type: "string" } } }, required: ["productIds"] },
  },
  async run(args, ctx) {
    const ids = (Array.isArray(args.productIds) ? args.productIds : []).map(String).slice(0, 3);
    const products = await prisma.dmProduct.findMany({ where: { id: { in: ids }, clientId: ctx.clientId } });
    let sent = 0;
    for (const p of products) {
      const img = images(p)[0];
      if (!img) continue;
      try {
        await sendToConversation({ conversationId: ctx.conversationId, imageUrl: img, sender: "AI" });
        sent++;
      } catch {
        // görsel gönderilemezse metinle devam
      }
    }
    return sent ? `${sent} ürün görseli gönderildi. Kişiye hangisini kastettiğini sor.` : "Görsel gönderilemedi; ürünleri adlarıyla sor.";
  },
});

/** Excel / CSV'den gelen ürünleri MANUAL bağlantıya yazar (aynı adlı ürün güncellenir). */
export async function importProducts(clientId: string, items: ImportedProduct[]) {
  let manual = await prisma.dmStoreConnection.findFirst({ where: { clientId, platform: "MANUAL" } });
  manual ??= await prisma.dmStoreConnection.create({ data: { clientId, platform: "MANUAL", name: "Elle / Excel" } });
  let created = 0, updated = 0;
  for (const it of items) {
    const existing = await prisma.dmProduct.findFirst({ where: { clientId, connectionId: manual.id, name: it.name } });
    const data = {
      name: it.name.slice(0, 300), description: it.description?.slice(0, 4000) ?? null, price: it.price ?? null,
      currency: it.currency || "TRY", url: it.url ?? null, images: it.images, isActive: true,
    };
    const p = existing ? await prisma.dmProduct.update({ where: { id: existing.id }, data }) : await prisma.dmProduct.create({ data: { ...data, clientId, connectionId: manual.id } });
    if (existing) updated++;
    else created++;
    await prisma.dmProductVariant.deleteMany({ where: { productId: p.id } });
    if (it.variants.length) {
      await prisma.dmProductVariant.createMany({
        data: it.variants.map((v) => ({ productId: p.id, sku: v.sku ?? null, title: v.title ?? null, options: v.options ?? undefined, price: v.price ?? null, stock: v.stock ?? null })),
      });
    }
  }
  await prisma.dmStoreConnection.update({ where: { id: manual.id }, data: { lastSyncAt: new Date() } });
  return { created, updated };
}
