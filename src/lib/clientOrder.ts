/** Kaydedilmiş sıraya göre dizer; sırada olmayan (yeni) müşteriler sonda, kendi sıralarıyla kalır. */
export function applyClientOrder<T extends { id: string | null }>(items: T[], raw: string | null | undefined): T[] {
  if (!raw) return items;
  let order: string[] = [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) order = parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return items;
  }
  const rank = new Map(order.map((id, i) => [id, i] as const));
  return [...items].sort((a, b) => {
    const ra = a.id !== null ? (rank.get(a.id) ?? Infinity) : Infinity;
    const rb = b.id !== null ? (rank.get(b.id) ?? Infinity) : Infinity;
    return ra === rb ? 0 : ra - rb;
  });
}
