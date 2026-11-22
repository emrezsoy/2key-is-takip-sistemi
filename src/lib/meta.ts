import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

// Graph API sürümü ortamdan değiştirilebilir (Meta eski sürümleri belli aralıklarla kapatır).
const GRAPH_VERSION = process.env.META_GRAPH_VERSION ?? "v23.0";
const TOKEN_KEY = "meta_access_token";

export class MetaError extends Error {}

/** Kayıtlı (şifreli) erişim anahtarı; yoksa ortam değişkeni META_ACCESS_TOKEN. */
export async function getMetaToken(): Promise<string | null> {
  const row = await prisma.integrationSetting.findUnique({ where: { key: TOKEN_KEY } });
  if (row) return decryptSecret(row.value);
  return process.env.META_ACCESS_TOKEN || null;
}

/** Anahtar tanımlı mı (çözmeden, sadece varlığına bakar). */
export async function isMetaConnected(): Promise<boolean> {
  if (process.env.META_ACCESS_TOKEN) return true;
  return (await prisma.integrationSetting.count({ where: { key: TOKEN_KEY } })) > 0;
}

export async function storeMetaToken(token: string) {
  const value = encryptSecret(token);
  await prisma.integrationSetting.upsert({
    where: { key: TOKEN_KEY },
    create: { key: TOKEN_KEY, value },
    update: { value },
  });
}

export async function clearMetaToken() {
  await prisma.integrationSetting.deleteMany({ where: { key: TOKEN_KEY } });
}

type GraphPage<T> = { data: T[]; paging?: { next?: string } };

async function graphRequest<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (!res.ok || json?.error) {
    const msg = json?.error?.message ?? `Meta isteği başarısız (${res.status}).`;
    throw new MetaError(msg);
  }
  return json as T;
}

function buildUrl(path: string, params: Record<string, string>, token: string) {
  const qs = new URLSearchParams({ ...params, access_token: token });
  return `https://graph.facebook.com/${GRAPH_VERSION}/${path}?${qs.toString()}`;
}

export async function graphGet<T>(path: string, params: Record<string, string>, token: string) {
  return graphRequest<T>(buildUrl(path, params, token));
}

/** Sayfalı listeyi sonuna kadar okur. */
export async function graphGetAll<T>(
  path: string,
  params: Record<string, string>,
  token: string,
  maxPages = 50
): Promise<T[]> {
  const out: T[] = [];
  let next: string | undefined = buildUrl(path, { limit: "200", ...params }, token);
  for (let i = 0; i < maxPages && next; i++) {
    const page: GraphPage<T> = await graphRequest<GraphPage<T>>(next);
    out.push(...page.data);
    next = page.paging?.next;
  }
  return out;
}
