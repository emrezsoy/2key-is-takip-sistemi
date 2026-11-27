import { test } from "node:test";
import assert from "node:assert/strict";
import { alertLevel, approxReplies, canReply, shouldAlert, splitCharge, turnCost } from "./creditMath";

const costs = { textCost: 1, imageCost: 2, videoCost: 3, cachedMediaCost: 1 };

test("bakiye 0 ya da eksiyse cevap üretilmez", () => {
  assert.equal(canReply({ plan: 0, permanent: 0 }), false);
  assert.equal(canReply({ plan: -2, permanent: 1 }), false);
  assert.equal(splitCharge({ plan: 0, permanent: 0 }, 1, 2, true), null);
  assert.equal(canReply({ plan: 0, permanent: 1 }), true);
});

test("harcama önce plan kovasından, sonra kalıcıdan", () => {
  assert.deepEqual(splitCharge({ plan: 5, permanent: 10 }, 3, 2, true), { charged: 3, fromPlan: 3, fromPermanent: 0 });
  assert.deepEqual(splitCharge({ plan: 1, permanent: 10 }, 3, 2, true), { charged: 3, fromPlan: 1, fromPermanent: 2 });
  assert.deepEqual(splitCharge({ plan: 0, permanent: 10 }, 2, 2, false), { charged: 2, fromPlan: 0, fromPermanent: 2 });
});

test("eksi bakiye en fazla -2 (limit) olur, fazlası alınmaz", () => {
  // 1 kredi kaldı, video (3) geldi: bakiye -2'ye düşer.
  assert.deepEqual(splitCharge({ plan: 1, permanent: 0 }, 3, 2, true), { charged: 3, fromPlan: 3, fromPermanent: 0 });
  // 1 kredi kaldı, bedel 5: sadece 3 düşülür (1 + limit 2).
  assert.equal(splitCharge({ plan: 1, permanent: 0 }, 5, 2, true)!.charged, 3);
  // Limit 0: bakiye 0'ın altına inmez.
  assert.equal(splitCharge({ plan: 1, permanent: 0 }, 3, 0, true)!.charged, 1);
});

test("eksiye düşen kısım: paket aktifse plana, değilse kalıcıya yazılır", () => {
  assert.deepEqual(splitCharge({ plan: 0, permanent: 1 }, 3, 2, true), { charged: 3, fromPlan: 2, fromPermanent: 1 });
  assert.deepEqual(splitCharge({ plan: 0, permanent: 1 }, 3, 2, false), { charged: 3, fromPlan: 0, fromPermanent: 3 });
});

test("tur bedeli gruptaki en pahalı yeni içeriğe göre", () => {
  assert.equal(turnCost(["TEXT"], costs), 1);
  assert.equal(turnCost(["TEXT", "IMAGE", "TEXT"], costs), 2);
  assert.equal(turnCost(["IMAGE", "VIDEO"], costs), 3);
  // Daha önce analiz edilmiş reklama gelen mesaj 1 kredi.
  assert.equal(turnCost(["CACHED_MEDIA", "TEXT"], costs), 1);
  assert.equal(turnCost([], costs), 1);
});

test("düşük kredi eşikleri %20 ve %5, bitti bildirimi bir kez", () => {
  assert.equal(alertLevel({ plan: 500, permanent: 0 }, 1000, [20, 5]), null);
  assert.equal(alertLevel({ plan: 200, permanent: 0 }, 1000, [20, 5]), 20);
  assert.equal(alertLevel({ plan: 40, permanent: 0 }, 1000, [20, 5]), 5);
  assert.equal(alertLevel({ plan: 0, permanent: 0 }, 1000, [20, 5]), "EMPTY");
  assert.equal(alertLevel({ plan: 0, permanent: 30 }, null, [20, 5]), null);
  assert.equal(shouldAlert(20, null, false), true);
  assert.equal(shouldAlert(20, 20, false), false);
  assert.equal(shouldAlert(5, 20, false), true);
  assert.equal(shouldAlert("EMPTY", 5, false), true);
  assert.equal(shouldAlert("EMPTY", 5, true), false);
});

test("yaklaşık kalan cevap", () => {
  assert.equal(approxReplies({ plan: 10, permanent: 5 }, 1), 15);
  assert.equal(approxReplies({ plan: -2, permanent: 0 }, 1), 0);
});
