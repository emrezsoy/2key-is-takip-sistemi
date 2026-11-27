import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMetaWebhook, signMetaBody, verifyMetaSignature } from "./metaParse";

test("Instagram mesajı: hesap id'si entry.id, kişi sender.id", () => {
  const ev = parseMetaWebhook({
    object: "instagram",
    entry: [{ id: "IG1", time: 1, messaging: [{ sender: { id: "U1" }, recipient: { id: "IG1" }, timestamp: 1700000000000, message: { mid: "m1", text: "Fiyat?" } }] }],
  });
  assert.equal(ev.length, 1);
  assert.equal(ev[0].channel, "INSTAGRAM");
  assert.equal(ev[0].accountId, "IG1");
  assert.equal(ev[0].contactId, "U1");
  assert.equal(ev[0].kind, "message");
  assert.equal(ev[0].text, "Fiyat?");
});

test("Instagram reklamdan gelen mesaj + görsel + story yanıtı", () => {
  const ev = parseMetaWebhook({
    object: "instagram",
    entry: [{
      id: "IG1",
      messaging: [{
        sender: { id: "U1" }, recipient: { id: "IG1" }, timestamp: 1,
        message: {
          mid: "m2", text: "Bu var mı?",
          attachments: [{ type: "image", payload: { url: "https://cdn/x.jpg" } }, { type: "ig_reel", payload: { url: "https://cdn/r" } }],
          referral: { ref: "r", ad_id: "AD9", source: "ADS", type: "OPEN_THREAD", ads_context_data: { ad_title: "Kış", video_url: "https://cdn/v.mp4" } },
        },
      }],
    }],
  });
  assert.deepEqual(ev[0].attachments.map((a) => a.type), ["image", "reel"]);
  assert.equal(ev[0].referral?.adId, "AD9");
  assert.equal(ev[0].referral?.videoUrl, "https://cdn/v.mp4");

  const story = parseMetaWebhook({
    object: "instagram",
    entry: [{ id: "IG1", messaging: [{ sender: { id: "U1" }, recipient: { id: "IG1" }, timestamp: 1, message: { mid: "m3", text: "😍", reply_to: { story: { id: "S1", url: "https://cdn/s" } } } }] }],
  });
  assert.equal(story[0].referral?.storyId, "S1");
});

test("Echo: işletme sahibinin yazdığı mesaj; kişi recipient.id", () => {
  const ig = parseMetaWebhook({
    object: "instagram",
    entry: [{ id: "IG1", messaging: [{ sender: { id: "IG1" }, recipient: { id: "U1" }, timestamp: 1, message: { mid: "m4", text: "Merhaba", is_echo: true } }] }],
  });
  assert.equal(ig[0].kind, "echo");
  assert.equal(ig[0].contactId, "U1");
  const fb = parseMetaWebhook({
    object: "page",
    entry: [{ id: "P1", messaging: [{ sender: { id: "P1" }, recipient: { id: "PS1" }, timestamp: 1, message: { mid: "m5", text: "Selam", is_echo: true, app_id: 123 } }] }],
  });
  assert.equal(fb[0].channel, "FACEBOOK");
  assert.equal(fb[0].appId, "123");
  assert.equal(fb[0].contactId, "PS1");
});

test("Facebook reklam referansı (mesajsız) ve okundu olayı", () => {
  const ev = parseMetaWebhook({
    object: "page",
    entry: [{
      id: "P1",
      messaging: [
        { sender: { id: "PS1" }, recipient: { id: "P1" }, timestamp: 1, referral: { ad_id: "AD1", source: "ADS", type: "OPEN_THREAD", ads_context_data: { post_id: "PO1" } } },
        { sender: { id: "PS1" }, recipient: { id: "P1" }, timestamp: 1, read: { watermark: 1 } },
      ],
    }],
  });
  assert.equal(ev[0].kind, "referral");
  assert.equal(ev[0].referral?.postId, "PO1");
  assert.equal(ev[1].kind, "read");
});

test("Bilinmeyen nesne yok sayılır", () => {
  assert.deepEqual(parseMetaWebhook({ object: "whatsapp_business_account", entry: [] }), []);
  assert.deepEqual(parseMetaWebhook(null), []);
});

test("İmza doğrulama (X-Hub-Signature-256)", () => {
  const body = JSON.stringify({ object: "page", text: "äöå" });
  const sig = signMetaBody(body, "gizli");
  assert.equal(verifyMetaSignature(Buffer.from(body), sig, "gizli"), true);
  assert.equal(verifyMetaSignature(Buffer.from(body), sig, "yanlis"), false);
  assert.equal(verifyMetaSignature(Buffer.from(body + " "), sig, "gizli"), false);
  assert.equal(verifyMetaSignature(Buffer.from(body), null, "gizli"), false);
});
