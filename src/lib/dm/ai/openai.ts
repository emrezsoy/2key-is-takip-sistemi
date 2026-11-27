// OpenAI (resmî SDK, Chat Completions). Mesaj cevabında isteğe bağlı; asıl kullanımı sesli kurulum (Realtime) ve embedding.
import OpenAI from "openai";
import { AiError, type AiChatInput, type AiChatResult, type AiProvider } from "./types";

const clients = new Map<string, OpenAI>();
const clientFor = (apiKey: string) => {
  let c = clients.get(apiKey);
  if (!c) {
    c = new OpenAI({ apiKey, maxRetries: 1, timeout: 60_000 });
    clients.set(apiKey, c);
  }
  return c;
};

const toError = (e: unknown) => {
  if (e instanceof OpenAI.APIError) return new AiError(`OpenAI hatası (${e.status}): ${e.message}`, e.status === 429 || (e.status ?? 500) >= 500);
  return e instanceof Error ? e : new Error(String(e));
};

export const openaiProvider: AiProvider = {
  async chat(input: AiChatInput, apiKey: string): Promise<AiChatResult> {
    const client = clientFor(apiKey);
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: input.system },
      ...input.turns.map((t): OpenAI.Chat.ChatCompletionMessageParam =>
        t.role === "assistant"
          ? { role: "assistant", content: t.text }
          : {
              role: "user",
              content: [
                ...(t.images ?? []).map((img): OpenAI.Chat.ChatCompletionContentPart => ({ type: "image_url", image_url: { url: `data:${img.mimeType};base64,${img.data}` } })),
                { type: "text", text: t.text || "(boş)" },
              ],
            }
      ),
    ];
    const tools: OpenAI.Chat.ChatCompletionTool[] | undefined = input.tools?.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
    const usage = { inputTokens: 0, outputTokens: 0 };
    const calls: AiChatResult["toolCalls"] = [];
    for (let round = 0; ; round++) {
      let res: OpenAI.Chat.ChatCompletion;
      try {
        res = await client.chat.completions.create({
          model: input.model,
          messages,
          max_completion_tokens: input.maxOutputTokens ?? 4000,
          ...(tools?.length ? { tools } : {}),
          ...(input.json ? { response_format: { type: "json_object" as const } } : {}),
        });
      } catch (e) {
        throw toError(e);
      }
      usage.inputTokens += res.usage?.prompt_tokens ?? 0;
      usage.outputTokens += res.usage?.completion_tokens ?? 0;
      const msg = res.choices[0]?.message;
      const fnCalls = (msg?.tool_calls ?? []).filter((c): c is OpenAI.Chat.ChatCompletionMessageFunctionToolCall => c.type === "function");
      if (msg?.refusal) return { text: "", toolCalls: calls, usage, model: input.model, provider: "openai", refused: true };
      if (fnCalls.length === 0 || !input.executeTool || round >= (input.maxToolRounds ?? 4)) {
        return { text: (msg?.content ?? "").trim(), toolCalls: calls, usage, model: input.model, provider: "openai" };
      }
      messages.push(msg!);
      for (const fc of fnCalls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(fc.function.arguments || "{}");
        } catch {
          args = {};
        }
        const call = { name: fc.function.name, args };
        calls.push(call);
        let out: string;
        try {
          out = await input.executeTool(call);
        } catch (e) {
          out = `HATA: ${e instanceof Error ? e.message : "araç çalıştırılamadı"}`;
        }
        messages.push({ role: "tool", tool_call_id: fc.id, content: out });
      }
    }
  },

  async embed(input, apiKey) {
    try {
      const res = await clientFor(apiKey).embeddings.create({ model: input.model, input: input.text });
      return { vector: res.data[0]?.embedding ?? [], usage: { inputTokens: res.usage?.prompt_tokens ?? 0, outputTokens: 0 } };
    } catch (e) {
      throw toError(e);
    }
  },
};
