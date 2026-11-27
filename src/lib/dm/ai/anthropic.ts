// Claude (Anthropic resmî SDK). Araç döngüsünde modelin cevabı (düşünme blokları dahil) değiştirilmeden geri gönderilir.
import Anthropic from "@anthropic-ai/sdk";
import { AiError, type AiChatInput, type AiChatResult, type AiProvider } from "./types";

const clients = new Map<string, Anthropic>();
const clientFor = (apiKey: string) => {
  let c = clients.get(apiKey);
  if (!c) {
    c = new Anthropic({ apiKey, maxRetries: 1, timeout: 60_000 });
    clients.set(apiKey, c);
  }
  return c;
};

const toError = (e: unknown) => {
  if (e instanceof Anthropic.RateLimitError || e instanceof Anthropic.InternalServerError || e instanceof Anthropic.APIConnectionError) {
    return new AiError(`Claude geçici hata: ${e.message}`, true);
  }
  if (e instanceof Anthropic.APIError) return new AiError(`Claude hatası (${e.status}): ${e.message}`, false);
  return e instanceof Error ? e : new Error(String(e));
};

export const anthropicProvider: AiProvider = {
  async chat(input: AiChatInput, apiKey: string): Promise<AiChatResult> {
    const client = clientFor(apiKey);
    const messages: Anthropic.MessageParam[] = input.turns.map((t) => ({
      role: t.role,
      content: [
        ...(t.images ?? []).map((img): Anthropic.ImageBlockParam | Anthropic.DocumentBlockParam =>
          img.mimeType === "application/pdf"
            ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: img.data } }
            : { type: "image", source: { type: "base64", media_type: img.mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: img.data } }
        ),
        { type: "text" as const, text: t.text || "(boş)" },
      ],
    }));
    const tools: Anthropic.Tool[] | undefined = input.tools?.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters as Anthropic.Tool.InputSchema,
    }));
    const usage = { inputTokens: 0, outputTokens: 0 };
    const calls: AiChatResult["toolCalls"] = [];
    const maxRounds = input.maxToolRounds ?? 4;
    // Kısa DM cevapları için düşük efor (hız ve maliyet); kurulum analizi gibi işler daha yüksek efor kullanır.
    const effort = input.json ? "medium" : "low";

    for (let round = 0; ; round++) {
      let res: Anthropic.Message;
      try {
        res = await client.messages.create({
          model: input.model,
          max_tokens: input.maxOutputTokens ?? 4000,
          system: input.system,
          messages,
          ...(tools?.length ? { tools } : {}),
          output_config: { effort },
        });
      } catch (e) {
        throw toError(e);
      }
      usage.inputTokens += res.usage.input_tokens + (res.usage.cache_read_input_tokens ?? 0) + (res.usage.cache_creation_input_tokens ?? 0);
      usage.outputTokens += res.usage.output_tokens;
      if (res.stop_reason === "refusal") {
        return { text: "", toolCalls: calls, usage, model: input.model, provider: "anthropic", refused: true };
      }
      const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
      const uses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      if (res.stop_reason !== "tool_use" || uses.length === 0 || !input.executeTool || round >= maxRounds) {
        return { text, toolCalls: calls, usage, model: input.model, provider: "anthropic" };
      }
      messages.push({ role: "assistant", content: res.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const u of uses) {
        const call = { name: u.name, args: (u.input ?? {}) as Record<string, unknown> };
        calls.push(call);
        let out: string;
        let isError = false;
        try {
          out = await input.executeTool(call);
        } catch (e) {
          out = e instanceof Error ? e.message : "Araç çalıştırılamadı.";
          isError = true;
        }
        results.push({ type: "tool_result", tool_use_id: u.id, content: out, ...(isError ? { is_error: true } : {}) });
      }
      messages.push({ role: "user", content: results });
    }
  },

  async describe(input, apiKey) {
    const r = await this.chat(
      { model: input.model, system: "Görselleri Türkçe ve ayrıntılı tarif edersin.", turns: [{ role: "user", text: input.prompt, images: [input.media] }] },
      apiKey
    );
    return { text: r.text, usage: r.usage };
  },
};
