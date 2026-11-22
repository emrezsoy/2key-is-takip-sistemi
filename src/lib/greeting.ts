// Sunucu hangi saat diliminde çalışırsa çalışsın (VPS genelde UTC), burada
// her zaman İstanbul saatini baz alıyoruz.
function getTurkeyHour(): number {
  const hourStr = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Istanbul",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
  return Number(hourStr);
}

export function getGreetingParts(): { prefix: string; suffix: string } {
  const hour = getTurkeyHour();

  if (hour >= 5 && hour < 12) return { prefix: "Günaydın, ", suffix: "." };
  if (hour >= 12 && hour < 18) return { prefix: "Tünaydın, ", suffix: "." };
  if (hour >= 18 && hour < 22) return { prefix: "İyi akşamlar, ", suffix: "." };
  return { prefix: "Gece oldu ", suffix: ", bu saatte ne arıyorsun burada?" };
}
