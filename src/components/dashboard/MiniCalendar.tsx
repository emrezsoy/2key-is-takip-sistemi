const WEEKDAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const MONTHS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

export function MiniCalendar({ date = new Date() }: { date?: Date }) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const today = date.getDate();

  const firstDay = new Date(year, month, 1).getDay(); // 0=Paz
  const leadingBlanks = (firstDay + 6) % 7; // Pzt başlangıçlı
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [
    ...Array(leadingBlanks).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-sm font-semibold">
        <span>
          {MONTHS[month]} {year}
        </span>
      </div>
      <div className="grid grid-cols-7 gap-y-2 text-center text-[11px] text-(--color-text-muted)">
        {WEEKDAYS.map((d) => (
          <span key={d}>{d}</span>
        ))}
        {cells.map((day, i) => (
          <span
            key={i}
            className={`mx-auto flex h-6 w-6 items-center justify-center rounded-full ${
              day === today
                ? "bg-brand-600 font-semibold text-white"
                : day
                  ? "text-(--color-text)"
                  : ""
            }`}
          >
            {day ?? ""}
          </span>
        ))}
      </div>
    </div>
  );
}
