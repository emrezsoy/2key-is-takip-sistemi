import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

// Google Drive (Ortak Drive) istemcisi. Ağır bir kütüphane yerine servis hesabı JWT'sini
// kendimiz imzalayıp REST API'yi çağırıyoruz.

const SA_KEY = "gdrive_service_account";
const ROOT_KEY = "gdrive_root_folder";
const SCOPE = "https://www.googleapis.com/auth/drive";
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

export class DriveError extends Error {}

type ServiceAccount = { client_email: string; private_key: string; token_uri?: string };

export type DriveConfig = { account: ServiceAccount; rootId: string };

/** Bağlantı bilgileri: şifreli servis hesabı anahtarı + Ortak Drive (kök klasör) kimliği. */
export async function getDriveConfig(): Promise<DriveConfig | null> {
  const [sa, root] = await Promise.all([
    prisma.integrationSetting.findUnique({ where: { key: SA_KEY } }),
    prisma.integrationSetting.findUnique({ where: { key: ROOT_KEY } }),
  ]);
  if (!sa || !root) return null;
  return { account: JSON.parse(decryptSecret(sa.value)) as ServiceAccount, rootId: root.value };
}

export async function isDriveConfigured() {
  const count = await prisma.integrationSetting.count({ where: { key: { in: [SA_KEY, ROOT_KEY] } } });
  return count === 2;
}

export async function saveDriveConfig(serviceAccountJson: string, rootId: string) {
  let parsed: ServiceAccount;
  try {
    parsed = JSON.parse(serviceAccountJson);
  } catch {
    throw new DriveError("Anahtar dosyası geçerli bir JSON değil.");
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new DriveError("Bu dosya bir servis hesabı anahtarı gibi görünmüyor.");
  }
  const clean = { client_email: parsed.client_email, private_key: parsed.private_key, token_uri: parsed.token_uri };
  await prisma.integrationSetting.upsert({
    where: { key: SA_KEY },
    create: { key: SA_KEY, value: encryptSecret(JSON.stringify(clean)) },
    update: { value: encryptSecret(JSON.stringify(clean)) },
  });
  await prisma.integrationSetting.upsert({
    where: { key: ROOT_KEY },
    create: { key: ROOT_KEY, value: rootId },
    update: { value: rootId },
  });
  tokenCache = null;
  return clean.client_email;
}

export async function clearDriveConfig() {
  await prisma.integrationSetting.deleteMany({ where: { key: { in: [SA_KEY, ROOT_KEY] } } });
  await prisma.driveFolder.deleteMany();
  tokenCache = null;
}

let tokenCache: { token: string; expiresAt: number } | null = null;

const b64url = (input: Buffer | string) =>
  Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

async function getAccessToken(config: DriveConfig) {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;

  const now = Math.floor(Date.now() / 1000);
  const tokenUri = config.account.token_uri ?? "https://oauth2.googleapis.com/token";
  const unsigned =
    b64url(JSON.stringify({ alg: "RS256", typ: "JWT" })) +
    "." +
    b64url(
      JSON.stringify({
        iss: config.account.client_email,
        scope: SCOPE,
        aud: tokenUri,
        iat: now,
        exp: now + 3600,
      })
    );
  const signature = crypto.createSign("RSA-SHA256").update(unsigned).sign(config.account.private_key);
  const jwt = `${unsigned}.${b64url(signature)}`;

  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.access_token) {
    throw new DriveError(`Google oturumu açılamadı: ${json?.error_description ?? json?.error ?? res.status}`);
  }
  tokenCache = { token: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return tokenCache.token;
}

async function driveFetch(config: DriveConfig, url: string, init: RequestInit = {}) {
  const token = await getAccessToken(config);
  return fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } });
}

async function driveJson<T>(config: DriveConfig, url: string, init: RequestInit = {}): Promise<T> {
  const res = await driveFetch(config, url, init);
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new DriveError(json?.error?.message ?? `Drive isteği başarısız (${res.status}).`);
  }
  return json as T;
}

/** Bağlantıyı sınar: Ortak Drive'a erişilebiliyor mu. Ortak Drive'ın adını döner. */
export async function testDrive(config: DriveConfig) {
  const info = await driveJson<{ name: string }>(
    config,
    `${API}/drives/${encodeURIComponent(config.rootId)}?fields=id,name`
  );
  return info.name;
}

const escapeQuery = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
const FOLDER_MIME = "application/vnd.google-apps.folder";

async function findFolder(config: DriveConfig, parentId: string, name: string) {
  const q = `name='${escapeQuery(name)}' and '${parentId}' in parents and mimeType='${FOLDER_MIME}' and trashed=false`;
  const data = await driveJson<{ files: { id: string }[] }>(
    config,
    `${API}/files?${new URLSearchParams({
      q,
      fields: "files(id)",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
      pageSize: "1",
    })}`
  );
  return data.files[0]?.id ?? null;
}

async function createFolder(config: DriveConfig, parentId: string, name: string) {
  const data = await driveJson<{ id: string }>(config, `${API}/files?supportsAllDrives=true&fields=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
  });
  return data.id;
}

/** Klasörü bul ya da oluştur; kimliği veritabanında önbelleğe alır. Elle silinmiş klasör
 * önbellekte kalırsa `forceRefresh` ile yeniden doğrulanır. */
async function ensureFolder(
  config: DriveConfig,
  cacheKey: string,
  parentId: string,
  name: string,
  forceRefresh: boolean
) {
  if (!forceRefresh) {
    const cached = await prisma.driveFolder.findUnique({ where: { key: cacheKey } });
    if (cached) return cached.driveId;
  }
  const id = (await findFolder(config, parentId, name)) ?? (await createFolder(config, parentId, name));
  await prisma.driveFolder.upsert({
    where: { key: cacheKey },
    create: { key: cacheKey, driveId: id },
    update: { driveId: id },
  });
  return id;
}

const safeName = (s: string) => s.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim() || "Dosya";

/** "<Müşteri>/<Kasım 2026>" klasörünü hazırlar ve kimliğini döner. */
export async function ensureClientMonthFolder(
  config: DriveConfig,
  client: { id: string | null; name: string },
  monthKey: string,
  monthLabel: string,
  forceRefresh = false
) {
  const cid = client.id ?? "none";
  const clientFolder = await ensureFolder(
    config,
    `c:${cid}`,
    config.rootId,
    safeName(client.name),
    forceRefresh
  );
  const monthFolder = await ensureFolder(
    config,
    `m:${cid}:${monthKey}`,
    clientFolder,
    monthLabel,
    forceRefresh
  );
  return monthFolder;
}

/** "Teklifler/<Kasım 2026>" klasörünü hazırlar (Teklifler sayfasındaki teklif ve raporlar buraya gider). */
export async function ensureProposalMonthFolder(
  config: DriveConfig,
  monthKey: string,
  monthLabel: string,
  forceRefresh = false
) {
  const root = await ensureFolder(config, "proposals", config.rootId, "Teklifler", forceRefresh);
  return ensureFolder(config, `pm:${monthKey}`, root, monthLabel, forceRefresh);
}

export type DriveFileInfo = { id: string; name: string; mimeType: string; size: number };

const CHUNK = 8 * 1024 * 1024; // 256 KB'ın katı olmalı

/** Dosyayı klasöre yükler (kesintisiz/"resumable" yükleme). Büyük dosyalar (video) parça parça
 * gönderilir; böylece tüm dosya bir kez daha belleğe kopyalanmaz. */
export async function uploadToFolder(
  config: DriveConfig,
  folderId: string,
  fileName: string,
  mimeType: string,
  data: Blob
): Promise<DriveFileInfo> {
  const total = data.size;
  const init = await driveFetch(
    config,
    `${UPLOAD_API}/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,mimeType,size`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": mimeType,
        "X-Upload-Content-Length": String(total),
      },
      body: JSON.stringify({ name: safeName(fileName), parents: [folderId] }),
    }
  );
  if (!init.ok) {
    const json = await init.json().catch(() => null);
    throw new DriveError(json?.error?.message ?? `Drive yüklemesi başlatılamadı (${init.status}).`);
  }
  const location = init.headers.get("location");
  if (!location) throw new DriveError("Drive yükleme adresi alınamadı.");

  let offset = 0;
  while (true) {
    const end = Math.min(offset + CHUNK, total);
    const chunk = new Uint8Array(await data.slice(offset, end).arrayBuffer());
    const put = await fetch(location, {
      method: "PUT",
      redirect: "manual",
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(chunk.length),
        "Content-Range": total === 0 ? "bytes */0" : `bytes ${offset}-${end - 1}/${total}`,
      },
      body: chunk,
    });

    if (put.status === 308) {
      // Parça alındı, devam: Drive'ın bildirdiği son bayttan sürdür.
      const range = put.headers.get("range"); // "bytes=0-8388607"
      offset = range ? Number(range.split("-")[1]) + 1 : end;
      continue;
    }

    const json = await put.json().catch(() => null);
    if (!put.ok || !json?.id) {
      throw new DriveError(json?.error?.message ?? `Drive yüklemesi başarısız (${put.status}).`);
    }
    return { id: json.id, name: json.name, mimeType: json.mimeType, size: Number(json.size ?? total) };
  }
}

/** Drive'daki dosyayı (isteğe bağlı Range ile) akış olarak getirir. */
export async function downloadFromDrive(config: DriveConfig, fileId: string, range?: string | null) {
  return driveFetch(config, `${API}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, {
    headers: range ? { Range: range } : {},
  });
}


/** Drive'daki bir dosya/klasörü çöp kutusuna taşır (kalıcı silmez). */
export async function trashDriveItem(config: DriveConfig, fileId: string) {
  await driveJson(config, `${API}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=id`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trashed: true }),
  });
}
