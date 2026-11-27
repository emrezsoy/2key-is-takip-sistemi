export function DmAccessField({ defaultChecked = false }: { defaultChecked?: boolean }) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" name="dmAccess" defaultChecked={defaultChecked} className="mt-0.5 h-4 w-4 rounded border-(--color-border)" />
      <span>
        Mesaj Otomasyonu ekranlarını kullansın
        <span className="block text-[11px] text-(--color-text-muted)">
          Sadece sorumlu olduğu müşterilerin gelen kutusunu, bekleyen işlerini ve ayarlarını görür. Kredi / ödeme işlemleri yalnızca yöneticilerdedir.
        </span>
      </span>
    </label>
  );
}
