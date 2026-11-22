export function AdPanelField({ defaultChecked = false, manageDefault = false }: { defaultChecked?: boolean; manageDefault?: boolean }) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="adPanelAccess"
          defaultChecked={defaultChecked}
          className="h-4 w-4 rounded border-(--color-border)"
        />
        Reklam Paneli&apos;ni görebilsin
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="adManageAccess"
          defaultChecked={manageDefault}
          className="mt-0.5 h-4 w-4 rounded border-(--color-border)"
        />
        <span>
          Reklam yönetebilsin
          <span className="block text-xs text-(--color-text-muted)">
            Kampanya kurar, kopyalar, bütçe / tarih değiştirir, yayına alır ve durdurur (sadece sorumlu olduğu müşterilerde).
          </span>
        </span>
      </label>
    </div>
  );
}
