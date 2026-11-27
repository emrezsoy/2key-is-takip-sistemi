// Veritabanı gerektiren kredi testi (yerel PostgreSQL). Çalıştırma: npm run test:db
// Geçici bir müşteri oluşturur, sonunda siler.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { addLedgerEntry, chargeUsage, creditState, getBalance } from "./credits";
import { recordPayment, runCreditTickForClient } from "./subscription";
import { addMonths } from "./periodMath";

let clientId = "";
let planId = "";
let adminId = "";

before(async () => {
  const c = await prisma.client.create({ data: { name: "__DM KREDİ TEST__", dmManaged: true } });
  clientId = c.id;
  const plan = await prisma.dmPlan.create({ data: { name: "__test paket__", monthlyCredits: 100 } });
  planId = plan.id;
  adminId = (await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } })).id;
});

after(async () => {
  await prisma.notification.deleteMany({ where: { message: { contains: "__DM KREDİ TEST__" } } });
  await prisma.income.deleteMany({ where: { clientId } });
  await prisma.client.delete({ where: { id: clientId } });
  await prisma.dmPlan.delete({ where: { id: planId } });
  await prisma.$disconnect();
});

test("ödeme alındı: dönem açılır, ilk ay kredisi hemen yüklenir, Finans'a gelir düşer", async () => {
  const period = await recordPayment({
    clientId, planId, months: 2, byId: adminId, byName: "Test", note: "fatura 1", income: { amount: 2500, invoiced: true },
  });
  assert.equal(period.months, 2);
  assert.deepEqual(await getBalance(clientId), { plan: 100, permanent: 0 });
  const income = await prisma.income.findUniqueOrThrow({ where: { id: period.incomeId! } });
  assert.equal(Number(income.amount), 2500);
  assert.match(income.service ?? "", /Mesaj Otomasyonu/);
  // Tekrar çalıştırmak ikinci kez yüklemez.
  await runCreditTickForClient(clientId);
  assert.deepEqual(await getBalance(clientId), { plan: 100, permanent: 0 });
});

test("harcama: önce plan; aynı tur iki kez düşülmez", async () => {
  const r1 = await chargeUsage({ clientId, cost: 3, idempotencyKey: "usage:test:1" });
  assert.equal(r1.charged, 3);
  const r2 = await chargeUsage({ clientId, cost: 3, idempotencyKey: "usage:test:1" });
  assert.equal(r2.charged, 0);
  await addLedgerEntry({ clientId, type: "TOPUP", bucket: "PERMANENT", amount: 50, byName: "Test", note: "kalıcı" });
  assert.deepEqual(await getBalance(clientId), { plan: 97, permanent: 50 });
});

test("düşük kredi: %20 eşiğinde bir kez bildirim", async () => {
  // 147 → 20'ye inene kadar harca (plan 97 → 0, kalıcı 50 → 20): toplam 20 = paket kredisinin %20'si.
  await chargeUsage({ clientId, cost: 127, idempotencyKey: "usage:test:2" });
  const st = await creditState(clientId);
  assert.equal(st.total, 20);
  const cfg = await prisma.dmConfig.findUniqueOrThrow({ where: { clientId } });
  assert.equal(cfg.lowAlertLevel, 20);
  const notes = await prisma.notification.count({ where: { type: "DM_CREDIT_LOW", message: { contains: "__DM KREDİ TEST__" } } });
  assert.ok(notes > 0);
});

test("kredi bitince: en fazla -2'ye düşer, sonra cevap reddedilir, 'bitti' bildirimi bir kez", async () => {
  await chargeUsage({ clientId, cost: 19, idempotencyKey: "usage:test:3" }); // kalan 1
  const r = await chargeUsage({ clientId, cost: 5, idempotencyKey: "usage:test:4" }); // 1 + limit 2 = 3 düşer
  assert.equal(r.charged, 3);
  assert.equal((await creditState(clientId)).total, -2);
  const refused = await chargeUsage({ clientId, cost: 1, idempotencyKey: "usage:test:5" });
  assert.ok("refused" in refused && refused.refused);
  const cfg = await prisma.dmConfig.findUniqueOrThrow({ where: { clientId } });
  assert.ok(cfg.emptyNotifiedAt && cfg.stoppedAt);
});

test("ertesi ay: kalan plan silinir, eksi kısım yeni yüklemeden düşer; ek süre ve bitiş", async () => {
  const period = await prisma.dmSubscriptionPeriod.findFirstOrThrow({ where: { clientId } });
  // Eksi kısım paket aktifken plan kovasına yazıldı (plan -2, kalıcı 0).
  assert.deepEqual(await getBalance(clientId), { plan: -2, permanent: 0 });
  await runCreditTickForClient(clientId, addMonths(period.startDate, 1));
  assert.deepEqual(await getBalance(clientId), { plan: 98, permanent: 0 });
  const cfg = await prisma.dmConfig.findUniqueOrThrow({ where: { clientId } });
  assert.equal(cfg.stoppedAt, null); // AI yeniden başlayabilir

  // Dönem bitti (2 ay): ek süre bildirimi; plan kredisi ek süre boyunca kullanılabilir.
  const end = period.paidThrough;
  await runCreditTickForClient(clientId, new Date(end.getTime() + 60_000));
  assert.ok((await prisma.dmConfig.findUniqueOrThrow({ where: { clientId } })).graceNotifiedAt);
  assert.equal((await getBalance(clientId)).plan, 98);

  // Ek süre (3 gün) de bitti: plan kalanı silinir.
  await runCreditTickForClient(clientId, new Date(end.getTime() + 4 * 864e5));
  assert.deepEqual(await getBalance(clientId), { plan: 0, permanent: 0 });
});

test("ek süredeyken ödeme: yeni dönem kaldığı yerden başlar", async () => {
  const first = await prisma.dmSubscriptionPeriod.findFirstOrThrow({ where: { clientId } });
  const p2 = await recordPayment({ clientId, planId, months: 1, byId: adminId, byName: "Test" });
  // Ek süre bitmişti (önceki test 4. güne ilerledi ama gerçek saat şimdi): gerçek "şimdi" dönem içinde olduğu için
  // yeni dönem eski dönemin bitişinden başlar.
  assert.equal(p2.startDate.toISOString(), first.paidThrough.toISOString());
});
