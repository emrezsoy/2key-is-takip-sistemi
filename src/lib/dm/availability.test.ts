import { test } from "node:test";
import assert from "node:assert/strict";
import { computeSlots, isSlotFree, localDay, localToDate } from "./availability";

// 23 Kasım 2026 Pazartesi.
const weekly = [{ weekday: 1, startTime: "09:00", endTime: "12:00" }];
const base = { weekly, closed: [], busy: [], durationMin: 60, gapMin: 0, now: localToDate("2026-11-22", "10:00"), leadMin: 60 };
const hm = (d: Date) => new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" }).format(d);

test("İstanbul günü ve haftanın günü", () => {
  assert.deepEqual(localDay(localToDate("2026-11-23", "00:30")), { date: "2026-11-23", weekday: 1 });
  assert.deepEqual(localDay(new Date("2026-11-22T21:30:00Z")), { date: "2026-11-23", weekday: 1 });
});

test("çalışma saatine göre aralıklar (süre 60 dk)", () => {
  const s = computeSlots({ ...base, fromDate: "2026-11-23", days: 1 });
  assert.deepEqual(s.map(hm), ["09:00", "10:00", "11:00"]);
});

test("dolu randevu ve aradaki boşluk (gap) dikkate alınır", () => {
  const busy = [{ start: localToDate("2026-11-23", "10:00"), end: localToDate("2026-11-23", "11:00") }];
  assert.deepEqual(computeSlots({ ...base, busy, fromDate: "2026-11-23", days: 1 }).map(hm), ["09:00", "11:00"]);
  // 15 dk ara: 30 dk'lık randevular, dolu 10:00-11:00 → 09:00, 09:45 (10:15 bitiş + ara çakışır mı?)
  const s = computeSlots({ ...base, busy, durationMin: 30, gapMin: 15, fromDate: "2026-11-23", days: 1 });
  assert.ok(!s.map(hm).includes("09:45"), "dolu randevudan önce ara kalmalı");
  assert.ok(s.map(hm).includes("09:00"));
});

test("kapalı aralık ve geçmiş zaman önerilmez", () => {
  const closed = [{ start: localToDate("2026-11-23", "00:00"), end: localToDate("2026-11-23", "23:59") }];
  assert.equal(computeSlots({ ...base, closed, fromDate: "2026-11-23", days: 1 }).length, 0);
  const now = localToDate("2026-11-23", "09:30");
  assert.deepEqual(computeSlots({ ...base, now, fromDate: "2026-11-23", days: 1 }).map(hm), ["11:00"]);
});

test("haftanın diğer günleri kapalı; talep doğrulaması", () => {
  assert.equal(computeSlots({ ...base, fromDate: "2026-11-24", days: 6 }).length, 0);
  assert.equal(computeSlots({ ...base, fromDate: "2026-11-23", days: 8 }).length, 6); // iki pazartesi
  assert.equal(isSlotFree(localToDate("2026-11-23", "10:00"), base), true);
  assert.equal(isSlotFree(localToDate("2026-11-23", "10:30"), base), true); // ızgaraya denk gelmese de aralığın içinde
  assert.equal(isSlotFree(localToDate("2026-11-23", "11:30"), base), false); // 12:30'da biter, kapanıştan sonra
  assert.equal(isSlotFree(localToDate("2026-11-23", "08:30"), base), false); // açılıştan önce
  assert.equal(isSlotFree(localToDate("2026-11-24", "10:00"), base), false);
  const busy = [{ start: localToDate("2026-11-23", "10:00"), end: localToDate("2026-11-23", "11:00") }];
  assert.equal(isSlotFree(localToDate("2026-11-23", "10:30"), { ...base, busy }), false); // dolu randevuyla çakışır
  assert.equal(isSlotFree(localToDate("2026-11-23", "11:00"), { ...base, busy }), true);
  assert.equal(isSlotFree(localToDate("2026-11-23", "09:00"), { ...base, weekly: [] }), false); // çalışma saati yok
});
