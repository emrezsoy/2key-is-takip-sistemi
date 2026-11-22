"use client";

type Option = { id: string; label: string };

/** "Müşteri sorumlusu" seçimi: seçilen müşterilerin tüm işlerini görür, iş
 * ekler ve işleri çalışanlara paylaştırır. */
export function ClientLeadPicker({
  clients,
  selectedIds = [],
}: {
  clients: Option[];
  selectedIds?: string[];
}) {
  if (clients.length === 0) return null;

  return (
    <fieldset className="rounded-lg border border-(--color-border) p-3">
      <legend className="px-1 text-xs font-medium text-(--color-text-muted)">
        Sorumlu olduğu müşteriler
      </legend>
      <p className="mb-2 text-[11px] text-(--color-text-muted)">
        Seçilen müşterilerin tüm işlerini görür, yeni iş ekler ve işleri çalışanlara paylaştırır.
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        {clients.map((c) => (
          <label key={c.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="leadClientIds"
              value={c.id}
              defaultChecked={selectedIds.includes(c.id)}
              className="h-4 w-4 rounded border-(--color-border)"
            />
            <span className="truncate">{c.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
