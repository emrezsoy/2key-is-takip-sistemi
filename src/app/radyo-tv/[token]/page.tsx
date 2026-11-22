import { notFound } from "next/navigation";
import { verifyRadioTvToken } from "@/lib/radio";
import { RadioTv } from "@/components/radio/RadioTv";

// Ofisteki TV'de (Mi Stick tarayıcısı) açılan, giriş gerektirmeyen radyo ekranı. Sadece geçerli gizli bağlantıyla açılır.
export const metadata = { title: "Ofis Radyosu", robots: { index: false, follow: false } };

export default async function RadyoTvPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ oto?: string }>;
}) {
  const { token } = await params;
  if (!(await verifyRadioTvToken(token))) notFound();
  const { oto } = await searchParams;
  return <RadioTv token={token} autoStart={oto === "1"} />;
}
