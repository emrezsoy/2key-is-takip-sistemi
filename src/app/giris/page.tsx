import Image from "next/image";
import { Playfair_Display } from "next/font/google";
import { LoginForm } from "./LoginForm";

const playfair = Playfair_Display({
  subsets: ["latin", "latin-ext"],
  weight: ["700"],
  style: ["italic"],
});

export default async function GirisPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;

  return (
    <div className="grid min-h-screen w-full lg:grid-cols-2">
      <div className="relative hidden flex-col items-start justify-between overflow-hidden bg-ink-950 p-10 text-white lg:flex">
        <Image
          src="/brand/logo.png"
          alt="2 Key idea"
          width={1517}
          height={695}
          className="h-28 w-auto"
          priority
        />

        <p className={`${playfair.className} text-4xl italic leading-tight`}>
          <span className="text-white">Aynı Dünya</span>
          <br />
          <span className="text-[#FF2424]">Farklı Fikir</span>
        </p>

        <Image
          src="/brand/statue.png"
          alt=""
          width={300}
          height={340}
          className="pointer-events-none absolute -bottom-10 -right-10 h-[380px] w-auto opacity-90"
        />
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex justify-center lg:hidden">
            <Image
              src="/brand/logo-dark.png"
              alt="2 Key idea"
              width={751}
              height={345}
              className="h-14 w-auto dark:hidden"
            />
            <Image
              src="/brand/logo.png"
              alt="2 Key idea"
              width={1517}
              height={695}
              className="hidden h-14 w-auto dark:block"
            />
          </div>
          <h1 className="text-2xl font-extrabold">Tekrar hoş geldin</h1>
          <p className="mt-1 mb-6 text-sm text-(--color-text-muted)">
            Görevlerine ve puantajına erişmek için giriş yap.
          </p>
          <LoginForm callbackUrl={callbackUrl ?? "/"} />
        </div>
      </div>
    </div>
  );
}
