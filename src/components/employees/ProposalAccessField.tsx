export function ProposalAccessField({ defaultChecked = false }: { defaultChecked?: boolean }) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        name="proposalAccess"
        defaultChecked={defaultChecked}
        className="mt-0.5 h-4 w-4 rounded border-(--color-border)"
      />
      <span>
        Teklifler sayfasını kullansın ve teklif / rapor hatırlatma bildirimlerini alsın
        <span className="block text-[11px] text-(--color-text-muted)">
          Rapor 2 gün, teklif 3 gün sonra &quot;işletmeyle iletişime geç&quot; bildirimi bu kişilere gider. Kimse seçilmezse adminlere gider.
        </span>
      </span>
    </label>
  );
}
