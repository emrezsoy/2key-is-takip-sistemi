/** İş bir müşteri talebinden geldiyse (ya da bir talebin revizesiyse) teslim "Müşteri talebine gönder" ile iletilebilir.
 * İçerik tablosundaki bir teslimin revizesi buna dahil değildir; o "İçerik listesine gönder" ile iletilir. */
export const requestSendableOf = (r?: { kind: string; sourceRequestId: string | null } | null) =>
  !!r && (r.kind !== "REVISION" || !!r.sourceRequestId);
