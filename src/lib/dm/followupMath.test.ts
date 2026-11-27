import { test } from "node:test";
import assert from "node:assert/strict";
import { followUpTime } from "./followupMath";
import { localToDate } from "./availability";

const cfg = { morningStart: "10:00", morningEnd: "12:00", eveningStart: "17:00", eveningEnd: "20:00", quietStart: "22:00", quietEnd: "09:00" };
const hm = (d: Date) => new Intl.DateTimeFormat("tr-TR", { day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" }).format(d);

test("öğleden sonra yazan kişi: ertesi sabah 10:00-12:00", () => {
  const last = localToDate("2026-11-23", "15:00");
  const r = followUpTime({ lastUserMessageAt: last, now: localToDate("2026-11-23", "18:00"), cfg, rand: 0 });
  assert.ok("at" in r);
  assert.equal(hm(r.at), "24 10:00");
  const r2 = followUpTime({ lastUserMessageAt: last, now: localToDate("2026-11-23", "18:00"), cfg, rand: 0.99 });
  assert.ok("at" in r2 && hm(r2.at) <= "24 12:00");
});

test("sabah 08:30'da yazan: pencere ertesi sabahtan önce kapanır → aynı gün 17:00-20:00", () => {
  const last = localToDate("2026-11-23", "08:30");
  const r = followUpTime({ lastUserMessageAt: last, now: localToDate("2026-11-23", "11:30"), cfg, rand: 0 });
  assert.ok("at" in r);
  assert.equal(hm(r.at), "23 17:00");
});

test("ertesi sabahın ortasında kapanan pencere: sınırı (30 dk pay) aşmaz", () => {
  const last = localToDate("2026-11-23", "11:00"); // pencere 24 Kas 11:00'de kapanır → en geç 10:30
  const r = followUpTime({ lastUserMessageAt: last, now: localToDate("2026-11-23", "14:00"), cfg, rand: 0.99 });
  assert.ok("at" in r);
  assert.ok(hm(r.at) >= "24 10:00" && hm(r.at) <= "24 10:30");
});

test("akşam aralığı da geçtiyse ve sabaha yetişmiyorsa gönderilmez (kaçan fırsat)", () => {
  const last = localToDate("2026-11-23", "08:00"); // pencere 24 Kas 08:00, sabah aralığı yok
  const r = followUpTime({ lastUserMessageAt: last, now: localToDate("2026-11-23", "20:30"), cfg });
  assert.deepEqual(r, { skip: true });
  const closed = followUpTime({ lastUserMessageAt: last, now: localToDate("2026-11-24", "07:45"), cfg });
  assert.deepEqual(closed, { skip: true });
});
