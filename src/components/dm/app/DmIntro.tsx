"use client";

import { useEffect } from "react";

// Logo: solda kırmızı "2" ikonu (public/brand/logo-mark.png), sağda iki satır "Key / idea".
// Her harf logonun tam boyutunda ayrı bir şeffaf katman (public/brand/intro/<tema>-<sıra>.png; sadece o harfin pikselleri,
// "y"nin kuyruğu ve "i"nin noktası kendi harfiyle birlikte). Katmanlar üst üste tam logoyu oluşturur, sırayla belirir.
// Katmanlar logodan üretilir: scripts/split-logo-letters.py
const LETTER_COUNT = 7; // K e y · i d e a

export type IntroMode = "in" | "out" | "splash";

/**
 * Mesaj Otomasyonu'na geçiş animasyonu: kenarlardan gelip ortada birleşen siyahlık, düşük opaklıkta kırmızı geçiş,
 * kırmızı ışımalar ve harf harf beliren 2 Key Idea logosu.
 * - "in": sistemden geçerken oynar ve ekranı kaplı tutar (yeni sayfa açılınca kaldırılır)
 * - "out": logo hazır durumda başlar, solarak açılır (geçişin ikinci yarısı)
 * - "splash": telefondan ilk açılışta tam animasyon + solma
 */
export function DmIntro({
  mode,
  covered = false,
  variant = "dark",
  onDone,
}: {
  mode: IntroMode;
  covered?: boolean;
  /** "light": gündüz modu (açık zemin, koyu yazılı logo). */
  variant?: "dark" | "light";
  onDone?: () => void;
}) {
  const layer = (i: number) => `/brand/intro/${variant === "light" ? "light" : "dark"}-${i}.png`;
  useEffect(() => {
    if (!onDone || mode === "in") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(onDone, reduce ? 50 : mode === "out" ? 700 : 2150);
    return () => clearTimeout(t);
  }, [mode, onDone]);

  const cls = ["dm-intro", variant === "light" && "dm-intro--light", mode === "out" && "dm-intro--out", mode === "splash" && "dm-intro--splash", covered && "dm-intro--covered"]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={cls} aria-hidden="true">
      <div className="dm-intro__panel dm-intro__panel--t" />
      <div className="dm-intro__panel dm-intro__panel--b" />
      <div className="dm-intro__panel dm-intro__panel--l" />
      <div className="dm-intro__panel dm-intro__panel--r" />
      <div className="dm-intro__tint" />
      <div className="dm-intro__glow" />
      <div className="dm-intro__glow dm-intro__glow--2" />
      <div className="dm-intro__logo">
        {/* eslint-disable-next-line @next/next/no-img-element -- animasyon katmanı */}
        <img src="/brand/logo-mark.png" alt="" className="dm-intro__mark" draggable={false} />
        {Array.from({ length: LETTER_COUNT }, (_, i) => (
          // eslint-disable-next-line @next/next/no-img-element -- harf katmanı
          <img key={i} src={layer(i)} alt="" className="dm-intro__layer dm-intro__letter" style={{ animationDelay: `${720 + i * 85}ms` }} draggable={false} />
        ))}
      </div>
    </div>
  );
}
