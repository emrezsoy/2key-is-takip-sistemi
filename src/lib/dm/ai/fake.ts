// Sahte AI sağlayıcısı (anahtar gerektirmez): geliştirme ve testler için öngörülebilir cevaplar üretir.
// Mesajda "#arac:<ad> {json}" geçerse o aracı çağırır (araç akışını denemek için).
import crypto from "node:crypto";
import type { AiChatInput, AiChatResult, AiProvider } from "./types";

const tokens = (s: string) => Math.ceil(s.length / 4);

export const fakeProvider: AiProvider = {
  async chat(input: AiChatInput): Promise<AiChatResult> {
    const last = [...input.turns].reverse().find((t) => t.role === "user")?.text ?? "";
    const usage = { inputTokens: tokens(input.system) + input.turns.reduce((a, t) => a + tokens(t.text), 0), outputTokens: 0 };
    const calls: AiChatResult["toolCalls"] = [];
    let toolNote = "";
    const m = /#arac:(\w+)\s*(\{[^}]*\})?/.exec(last);
    if (m && input.executeTool && input.tools?.some((t) => t.name === m[1])) {
      let args: Record<string, unknown> = {};
      try {
        args = m[2] ? JSON.parse(m[2]) : {};
      } catch {
        args = {};
      }
      const call = { name: m[1], args };
      calls.push(call);
      toolNote = ` [${m[1]} → ${(await input.executeTool(call)).slice(0, 200)}]`;
    }
    if (input.json) {
      const text = JSON.stringify({ classification: "UNDECIDED", summary: "Sahte özet", followUp: "Merhaba, aklınıza takılan bir şey olursa yazabilirsiniz." });
      return { text, toolCalls: calls, usage: { ...usage, outputTokens: tokens(text) }, model: input.model, provider: "fake" };
    }
    const text = `(Test cevabı) Merhaba! Mesajınızı aldım: "${last.replace(/\s+/g, " ").slice(0, 120)}"${toolNote}`;
    return { text, toolCalls: calls, usage: { ...usage, outputTokens: tokens(text) }, model: input.model, provider: "fake" };
  },
  async describe(input) {
    return { text: `(Test analizi) ${input.media.mimeType} içerik, ${Math.round((input.media.data.length * 3) / 4 / 1024)} KB.`, usage: { inputTokens: 300, outputTokens: 30 } };
  },
  async embed(input) {
    // Metinden türetilen sabit, normalize 16 boyutlu vektör (aynı metin → aynı vektör).
    const h = crypto.createHash("sha256").update(input.text.toLowerCase()).digest();
    const v = Array.from({ length: 16 }, (_, i) => (h[i] - 128) / 128);
    const n = Math.hypot(...v) || 1;
    return { vector: v.map((x) => x / n), usage: { inputTokens: tokens(input.text), outputTokens: 0 } };
  },
};
