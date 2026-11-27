import { test } from "node:test";
import assert from "node:assert/strict";
import { aiGate, batchRunAt, windowOpen } from "./batching";

const t0 = new Date("2026-11-23T10:00:00Z");
const s = (sec: number) => new Date(t0.getTime() + sec * 1000);
const cfg = { waitTextSec: 9, waitMediaSec: 35, waitMaxSec: 60 };

test("metin: 9 sn bekler, her yeni mesaj sıfırlar", () => {
  assert.equal(batchRunAt({ now: t0, pendingSince: null, lastIsMedia: false, ...cfg }).toISOString(), s(9).toISOString());
  assert.equal(batchRunAt({ now: s(5), pendingSince: t0, lastIsMedia: false, ...cfg }).toISOString(), s(14).toISOString());
});

test("medya: 35 sn bekler; toplam 60 sn'yi geçmez", () => {
  assert.equal(batchRunAt({ now: t0, pendingSince: null, lastIsMedia: true, ...cfg }).toISOString(), s(35).toISOString());
  assert.equal(batchRunAt({ now: s(40), pendingSince: t0, lastIsMedia: true, ...cfg }).toISOString(), s(60).toISOString());
  assert.equal(batchRunAt({ now: s(58), pendingSince: t0, lastIsMedia: false, ...cfg }).toISOString(), s(60).toISOString());
  // Üst sınır geçtiyse hemen.
  assert.equal(batchRunAt({ now: s(70), pendingSince: t0, lastIsMedia: false, ...cfg }).toISOString(), s(70).toISOString());
});

test("24 saat penceresi 30 dk pay ile", () => {
  assert.equal(windowOpen(t0, new Date(t0.getTime() + 23 * 3600_000)), true);
  assert.equal(windowOpen(t0, new Date(t0.getTime() + 23.6 * 3600_000)), false);
  assert.equal(windowOpen(null, t0), false);
});

test("AI kapısı: insan modu, engelli kişi, kredi, duraklatma", () => {
  const base = { dmManaged: true, dmPaused: false, mode: "AI" as const, aiBlocked: false, canReply: true, lastUserMessageAt: t0, now: s(10) };
  assert.equal(aiGate(base), null);
  assert.equal(aiGate({ ...base, mode: "HUMAN" }), "HUMAN_MODE");
  assert.equal(aiGate({ ...base, aiBlocked: true }), "CONTACT_BLOCKED");
  assert.equal(aiGate({ ...base, canReply: false }), "NO_CREDIT");
  assert.equal(aiGate({ ...base, dmPaused: true }), "CLIENT_PAUSED");
  assert.equal(aiGate({ ...base, dmManaged: false }), "SERVICE_OFF");
});
