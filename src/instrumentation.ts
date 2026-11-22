// Sunucu süreci ayağa kalktığında bir kez çalışır (bkz. Next.js instrumentation
// hook). Süresi dolan teslim dosyalarını saatte bir kontrol edip VPS'ten
// temizleyen arka plan görevini burada başlatıyoruz; ayrı bir cron/servis
// kurmaya gerek kalmıyor.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { cleanupExpiredSubmissions } = await import("@/lib/submissionCleanup");

  const run = () => {
    cleanupExpiredSubmissions().catch((err) => {
      console.error("Süresi dolan teslim dosyaları temizlenemedi:", err);
    });
  };

  run();
  setInterval(run, 60 * 60 * 1000);

  // Reklam verileri (Meta): anahtar tanımlıysa saatte bir son günleri yeniler.
  const { syncAdsIfConfigured } = await import("@/lib/adsSync");
  setTimeout(() => void syncAdsIfConfigured(), 60 * 1000);
  setInterval(() => void syncAdsIfConfigured(), 60 * 60 * 1000);

  // Reklam verileri (Google Ads): bağlıysa saatte bir son günleri yeniler.
  const { syncGoogleAdsIfConfigured } = await import("@/lib/googleAds");
  setTimeout(() => void syncGoogleAdsIfConfigured(), 90 * 1000);
  setInterval(() => void syncGoogleAdsIfConfigured(), 60 * 60 * 1000);

  // Müşteri paneli: gecikmiş ödeme hatırlatmaları (müşteri başına seçilen sıklıkta).
  const { sendPaymentReminders } = await import("@/lib/paymentReminders");
  const remind = () =>
    sendPaymentReminders().catch((err) => {
      console.error("Ödeme hatırlatmaları gönderilemedi:", err);
    });
  setTimeout(remind, 2 * 60 * 1000);
  setInterval(remind, 30 * 60 * 1000);

  // Paylaşım Takvimi: 5 dk kala / 10:00 hatırlatmaları ve Meta'da planlıların otomatik "paylaşıldı" işareti (dakikada bir).
  const { runShareJobs } = await import("@/lib/shareReminders");
  const shareJobs = () =>
    runShareJobs().catch((err) => {
      console.error("Paylaşım hatırlatmaları çalıştırılamadı:", err);
    });
  setTimeout(shareJobs, 30 * 1000);
  setInterval(shareJobs, 60 * 1000);

  // Paylaşım Takvimi: "Meta'da planla" ile planlanan paylaşımları saati gelince Instagram ve Facebook'ta yayınlar (dakikada bir).
  const { runMetaPublishJobs } = await import("@/lib/metaPublish");
  const metaPublish = () =>
    runMetaPublishJobs().catch((err) => {
      console.error("Planlı paylaşımlar yayınlanamadı:", err);
    });
  setTimeout(metaPublish, 40 * 1000);
  setInterval(metaPublish, 60 * 1000);

  // Sosyal Medya: sayfa / Instagram verilerini 6 saatte bir (saatlik kontrolle) çekip günlük kaydeder.
  const { syncSocialIfConfigured } = await import("@/lib/socialSync");
  setTimeout(() => void syncSocialIfConfigured(), 120 * 1000);
  setInterval(() => void syncSocialIfConfigured(), 60 * 60 * 1000);

  // Müşteri aylık raporları: otomatik rapor seçili müşterilere her ayın 1'inde önceki ayın raporu (saatlik kontrol).
  const { runAutoReports } = await import("@/lib/reportJobs");
  const reportJobs = () =>
    runAutoReports().catch((err) => {
      console.error("Otomatik aylık raporlar çalıştırılamadı:", err);
    });
  setTimeout(reportJobs, 150 * 1000);
  setInterval(reportJobs, 60 * 60 * 1000);

  // Teklifler: rapor 2 gün / teklif 3 gün sonra "işletmeyle iletişime geç" hatırlatması (10 dakikada bir kontrol).
  const { runProposalReminders } = await import("@/lib/proposalReminders");
  const proposalJobs = () =>
    runProposalReminders().catch((err) => {
      console.error("Teklif hatırlatmaları çalıştırılamadı:", err);
    });
  setTimeout(proposalJobs, 45 * 1000);
  setInterval(proposalJobs, 10 * 60 * 1000);
}
