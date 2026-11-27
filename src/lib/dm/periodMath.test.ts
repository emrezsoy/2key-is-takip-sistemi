import { test } from "node:test";
import assert from "node:assert/strict";
import { addMonths, monthIndexAt, nextPeriodStart, renewalDue, subscriptionStatus, type PeriodLike } from "./periodMath";

const d = (s: string) => new Date(s);
const period = (start: string, months: number, extra: Partial<PeriodLike> = {}): PeriodLike => ({
  id: "p",
  startDate: d(start),
  months,
  paidThrough: addMonths(d(start), months),
  monthlyCredits: 1000,
  ...extra,
});

test("ay ekleme: ay sonu taşmaz", () => {
  assert.equal(addMonths(d("2026-01-31T09:00:00Z"), 1).toISOString(), "2026-02-28T09:00:00.000Z");
  assert.equal(addMonths(d("2026-11-23T09:00:00Z"), 3).toISOString(), "2027-02-23T09:00:00.000Z");
  assert.equal(addMonths(d("2026-12-15T00:00:00Z"), 12).toISOString(), "2027-12-15T00:00:00.000Z");
});

test("dönem içindeki ay sırası (her ay başlangıç gününde yeni yükleme)", () => {
  const p = period("2026-11-23T00:00:00Z", 3);
  assert.equal(monthIndexAt(p, d("2026-11-22T23:59:00Z")), null);
  assert.equal(monthIndexAt(p, d("2026-11-23T00:00:00Z")), 0);
  assert.equal(monthIndexAt(p, d("2026-12-22T12:00:00Z")), 0);
  assert.equal(monthIndexAt(p, d("2026-12-23T00:00:00Z")), 1);
  assert.equal(monthIndexAt(p, d("2027-02-22T23:00:00Z")), 2);
  assert.equal(monthIndexAt(p, d("2027-02-23T00:00:00Z")), null); // dönem bitti
  assert.equal(monthIndexAt({ ...p, cancelledAt: d("2026-12-01T00:00:00Z") }, d("2026-12-05T00:00:00Z")), null);
});

test("durum: aktif → ek süre (3 gün) → bitti; otomatik yenileme yok", () => {
  const p = period("2026-11-23T00:00:00Z", 1); // 23 Aralık'a kadar
  assert.equal(subscriptionStatus([], d("2026-11-23T00:00:00Z"), 3).status, "NONE");
  assert.equal(subscriptionStatus([p], d("2026-12-01T00:00:00Z"), 3).status, "ACTIVE");
  assert.equal(subscriptionStatus([p], d("2026-12-24T00:00:00Z"), 3).status, "GRACE");
  assert.equal(subscriptionStatus([p], d("2026-12-26T00:00:01Z"), 3).status, "EXPIRED");
  assert.equal(subscriptionStatus([p], d("2026-12-24T00:00:00Z"), 0).status, "EXPIRED");
});

test("yeni ödeme: dönem sürerken ya da ek süredeyken kaldığı yerden devam eder", () => {
  const p = period("2026-11-23T00:00:00Z", 1);
  const end = p.paidThrough.toISOString();
  assert.equal(nextPeriodStart([p], d("2026-12-10T00:00:00Z"), 3).toISOString(), end);
  assert.equal(nextPeriodStart([p], d("2026-12-24T00:00:00Z"), 3).toISOString(), end);
  const late = d("2027-01-10T00:00:00Z");
  assert.equal(nextPeriodStart([p], late, 3).toISOString(), late.toISOString());
  assert.equal(nextPeriodStart([], late, 3).toISOString(), late.toISOString());
});

test("yenileme bildirimi bitime 3 gün kala", () => {
  const end = d("2026-12-23T00:00:00Z");
  assert.equal(renewalDue(end, d("2026-12-19T23:00:00Z"), 3), false);
  assert.equal(renewalDue(end, d("2026-12-20T00:00:00Z"), 3), true);
  assert.equal(renewalDue(end, d("2026-12-23T00:00:00Z"), 3), false);
  assert.equal(renewalDue(null, end, 3), false);
});
