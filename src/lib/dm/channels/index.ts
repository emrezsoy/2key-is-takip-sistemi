// Kanal göndericisi: DM_CHANNEL_MODE=meta → gerçek Meta; aksi halde sahte (hiçbir şey dışarı gitmez, geliştirme/test).
import crypto from "node:crypto";
import type { DmChannelSender } from "./types";
import { metaSend, metaSenderAction } from "../metaDm";

export const isFakeChannel = () => (process.env.DM_CHANNEL_MODE ?? "fake") !== "meta";

const fakeSender: DmChannelSender = {
  async send({ channel, recipientId, message }) {
    console.log(`[dm-fake] ${channel} → ${recipientId}: ${message.text ?? message.imageUrl ?? ""}`.slice(0, 300));
    return { externalId: `fake-${crypto.randomUUID()}` };
  },
  async senderAction() {},
};

const metaSender: DmChannelSender = {
  async send({ channel, accountId, recipientId, message }) {
    return metaSend({ channel, accountId, recipientId, text: message.text, imageUrl: message.imageUrl });
  },
  async senderAction(input) {
    try {
      await metaSenderAction(input);
    } catch {
      // "yazıyor" / "görüldü" işaretleri her kanalda desteklenmeyebilir; cevabı engellemez.
    }
  },
};

export const getChannelSender = (): DmChannelSender => (isFakeChannel() ? fakeSender : metaSender);
