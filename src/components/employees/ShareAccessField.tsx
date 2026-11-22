import { SHARE_ACCESS_LABEL } from "@/lib/shareCalendar";

export function ShareAccessField({ defaultValue = "NONE" }: { defaultValue?: string }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">
        Paylaşım Takvimi yetkisi
      </label>
      <select
        name="shareCalendarAccess"
        defaultValue={defaultValue}
        className="w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm"
      >
        <option value="NONE">{SHARE_ACCESS_LABEL.NONE}</option>
        <option value="USE">{SHARE_ACCESS_LABEL.USE}</option>
        <option value="EDIT">{SHARE_ACCESS_LABEL.EDIT}</option>
      </select>
    </div>
  );
}
