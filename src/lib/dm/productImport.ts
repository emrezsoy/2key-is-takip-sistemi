// Ürün içe aktarma: CSV ve Excel (.xlsx). Saf fonksiyonlar; testleri: productImport.test.ts.
// Sütunlar (başlık satırı, büyük/küçük harf önemsiz): Ad*, Açıklama, Fiyat, Para birimi, Bağlantı, Görsel, SKU, Varyant, Stok.
// Her satır bir varyanttır; aynı "Ad" satırları tek ürünün varyantları olarak birleşir. Varyant: "Beden: M; Renk: Siyah".
import { strFromU8, unzipSync } from "fflate";

export type ImportedVariant = { sku?: string; title?: string; options?: Record<string, string>; price?: number; stock?: number };
export type ImportedProduct = { name: string; description?: string; price?: number; currency?: string; url?: string; images: string[]; variants: ImportedVariant[] };

const norm = (s: string) => s.trim().toLocaleLowerCase("tr-TR").replace(/\s+/g, " ");
const COLS: Record<string, string[]> = {
  name: ["ad", "ürün adı", "urun adi", "ürün", "name", "title"],
  description: ["açıklama", "aciklama", "description"],
  price: ["fiyat", "price"],
  currency: ["para birimi", "currency"],
  url: ["bağlantı", "baglanti", "link", "url"],
  image: ["görsel", "gorsel", "resim", "image", "görsel url"],
  sku: ["sku", "stok kodu"],
  variant: ["varyant", "variant", "seçenek"],
  stock: ["stok", "stock", "adet"],
};

export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

const decodeXml = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

/** .xlsx'in ilk sayfasını satırlara çevirir (paylaşılan metinler ve satır içi metinler desteklenir). */
export function parseXlsx(buf: Uint8Array): string[][] {
  const files = unzipSync(buf);
  const shared: string[] = [];
  const ss = files["xl/sharedStrings.xml"];
  if (ss) {
    for (const si of strFromU8(ss).match(/<si>[\s\S]*?<\/si>/g) ?? []) {
      shared.push(decodeXml((si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, "")).join("")));
    }
  }
  const sheetName = Object.keys(files).filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f)).sort()[0];
  if (!sheetName) throw new Error("Excel dosyasında sayfa bulunamadı.");
  const xml = strFromU8(files[sheetName]);
  const rows: string[][] = [];
  for (const r of xml.match(/<row[^>]*>[\s\S]*?<\/row>/g) ?? []) {
    const row: string[] = [];
    for (const c of r.match(/<c [^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) ?? []) {
      const ref = /r="([A-Z]+)\d+"/.exec(c)?.[1] ?? "A";
      const col = ref.split("").reduce((a, ch) => a * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
      const type = /t="(\w+)"/.exec(c)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(c)?.[1];
      const inline = /<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/.exec(c)?.[1];
      row[col] = type === "s" ? shared[Number(v)] ?? "" : decodeXml(inline ?? v ?? "");
    }
    rows.push(Array.from(row, (x) => x ?? ""));
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

const num = (s: string | undefined) => {
  if (!s?.trim()) return undefined;
  const t = s.replace(/[^\d.,-]/g, "");
  const n = Number(t.includes(",") && t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
};

export function rowsToProducts(rows: string[][]): { products: ImportedProduct[]; errors: string[] } {
  if (rows.length < 2) return { products: [], errors: ["Dosyada başlık satırı ve en az bir ürün olmalı."] };
  const header = rows[0].map(norm);
  const idx = (k: keyof typeof COLS) => header.findIndex((h) => COLS[k].includes(h));
  const at = (r: string[], k: keyof typeof COLS) => (idx(k) >= 0 ? (r[idx(k)] ?? "").trim() : "");
  if (idx("name") < 0) return { products: [], errors: ['"Ad" sütunu bulunamadı.'] };
  const byName = new Map<string, ImportedProduct>();
  const errors: string[] = [];
  rows.slice(1).forEach((r, i) => {
    const name = at(r, "name");
    if (!name) { errors.push(`${i + 2}. satır: ürün adı boş, atlandı.`); return; }
    const p = byName.get(name) ?? { name, images: [], variants: [] };
    p.description ||= at(r, "description") || undefined;
    p.price ??= num(at(r, "price"));
    p.currency ||= at(r, "currency") || undefined;
    p.url ||= at(r, "url") || undefined;
    const img = at(r, "image");
    if (img && !p.images.includes(img)) p.images.push(img);
    const variantText = at(r, "variant");
    const options: Record<string, string> = {};
    for (const part of variantText.split(/[;|]/)) {
      const [k, ...v] = part.split(":");
      if (k?.trim() && v.length) options[k.trim()] = v.join(":").trim();
      else if (k?.trim()) options["Seçenek"] = k.trim();
    }
    const sku = at(r, "sku");
    const stock = num(at(r, "stock"));
    if (variantText || sku || stock !== undefined) {
      p.variants.push({ sku: sku || undefined, title: variantText || undefined, options: Object.keys(options).length ? options : undefined, price: num(at(r, "price")), stock: stock !== undefined ? Math.round(stock) : undefined });
    }
    byName.set(name, p);
  });
  return { products: [...byName.values()], errors };
}
