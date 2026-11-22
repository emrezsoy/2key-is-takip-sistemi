import { Info } from "lucide-react";

/** Sosyal medya yönetim hizmeti almayan (sadece reklam alan) müşteriler için bölüm uyarısı. */
export function SocialServiceNotice({ title }: { title: string }) {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{title}</h1>
      <div className="flex items-start gap-3 rounded-xl border border-brand-500/40 bg-brand-50 p-5 dark:bg-brand-900/10">
        <Info size={20} className="mt-0.5 shrink-0 text-brand-600" />
        <div>
          <p className="text-sm font-bold">Sosyal medya yönetim hizmeti almıyorsunuz</p>
          <p className="mt-1 text-sm text-(--color-text-muted)">
            Bu bölüm yalnızca sosyal medya yönetimi hizmetimizi alan müşterilerimize açıktır. Şu an hesabınızda bu hizmet
            tanımlı olmadığı için içerik hazırlama, tasarım talebi oluşturma ve paylaşım takvimi kullanılamıyor. Hizmet
            hakkında bilgi almak isterseniz bizimle iletişime geçebilirsiniz.
          </p>
        </div>
      </div>
    </div>
  );
}
