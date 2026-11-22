export function ContentAccessField({ defaultChecked = false }: { defaultChecked?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        name="contentAccess"
        defaultChecked={defaultChecked}
        className="h-4 w-4 rounded border-(--color-border)"
      />
      Müşteri içeriklerini (İçerik Paneli) yazıp düzenleyebilsin
    </label>
  );
}
