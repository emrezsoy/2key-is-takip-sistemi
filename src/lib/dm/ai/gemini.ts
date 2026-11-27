// Gemini (Google resmî SDK @google/genai). Araç döngüsünde modelin içeriği aynen geri gönderilir (düşünme imzaları korunur).
// Cevaplarda düşünme düşük tutulur: düşünme token'ları çıkış olarak ücretlendirilir.
import { GoogleGenAI, ThinkingLevel, type Content, type FunctionDeclaration, type GenerateContentConfig, type Part } from "@google/genai";
import { AiError, type AiChatInput, type AiChatResult, type AiProvider, type AiUsage } from "./types";

const clients = new Map<string, GoogleGenAI>();
const clientFor = (apiKey: string) => {
  let c = clients.get(apiKey);
  if (!c) {
    c = new GoogleGenAI({ apiKey });
    clients.set(apiKey, c);
  }
  return c;
};

const toError = (e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  const status = (e as { status?: number })?.status;
  return new AiError(`Gemini hatası: ${msg}`, status === undefined || status === 429 || status >= 500);
};

/** Bazı modeller thinkingLevel'ı desteklemeyebilir: hata alınırsa düşünme ayarı olmadan tekrar dener. */
async function generate(apiKey: string, model: string, contents: Content[], config: GenerateContentConfig) {
  const ai = clientFor(apiKey);
  try {
    return await ai.models.generateContent({ model, contents, config: { ...config, thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (/thinking/i.test(msg)) {
      try {
        return await ai.models.generateContent({ model, contents, config });
      } catch (e2) {
        throw toError(e2);
      }
    }
    throw toError(e);
  }
}

const usageOf = (u?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number }): AiUsage => ({
  inputTokens: u?.promptTokenCount ?? 0,
  outputTokens: (u?.candidatesTokenCount ?? 0) + (u?.thoughtsTokenCount ?? 0),
});

export const geminiProvider: AiProvider = {
  async chat(input: AiChatInput, apiKey: string): Promise<AiChatResult> {
    const contents: Content[] = input.turns.map((t) => ({
      role: t.role === "assistant" ? "model" : "user",
      parts: [...(t.images ?? []).map((img): Part => ({ inlineData: { mimeType: img.mimeType, data: img.data } })), { text: t.text || "(boş)" }],
    }));
    const config: GenerateContentConfig = {
      systemInstruction: input.system,
      maxOutputTokens: input.maxOutputTokens ?? 4000,
      ...(input.json ? { responseMimeType: "application/json" } : {}),
      ...(input.tools?.length
        ? { tools: [{ functionDeclarations: input.tools.map((t): FunctionDeclaration => ({ name: t.name, description: t.description, parametersJsonSchema: t.parameters })) }] }
        : {}),
    };
    const usage: AiUsage = { inputTokens: 0, outputTokens: 0 };
    const calls: AiChatResult["toolCalls"] = [];
    const maxRounds = input.maxToolRounds ?? 4;
    for (let round = 0; ; round++) {
      const res = await generate(apiKey, input.model, contents, config);
      const u = usageOf(res.usageMetadata);
      usage.inputTokens += u.inputTokens;
      usage.outputTokens += u.outputTokens;
      const candidate = res.candidates?.[0];
      if (!candidate?.content) {
        const blocked = !!res.promptFeedback?.blockReason || candidate?.finishReason === "SAFETY";
        return { text: "", toolCalls: calls, usage, model: input.model, provider: "gemini", refused: blocked };
      }
      const fnCalls = res.functionCalls ?? [];
      const text = (candidate.content.parts ?? []).filter((p) => p.text && !p.thought).map((p) => p.text).join("").trim();
      if (fnCalls.length === 0 || !input.executeTool || round >= maxRounds) {
        return { text, toolCalls: calls, usage, model: input.model, provider: "gemini" };
      }
      contents.push(candidate.content);
      const responses: Part[] = [];
      for (const fc of fnCalls) {
        const call = { name: fc.name ?? "", args: (fc.args ?? {}) as Record<string, unknown> };
        calls.push(call);
        let out: string;
        try {
          out = await input.executeTool(call);
        } catch (e) {
          out = `HATA: ${e instanceof Error ? e.message : "araç çalıştırılamadı"}`;
        }
        responses.push({ functionResponse: { id: fc.id, name: fc.name, response: { result: out } } });
      }
      contents.push({ role: "user", parts: responses });
    }
  },

  async describe(input, apiKey) {
    const res = await generate(apiKey, input.model, [
      { role: "user", parts: [{ inlineData: { mimeType: input.media.mimeType, data: input.media.data } }, { text: input.prompt }] },
    ], { maxOutputTokens: 2000 });
    return { text: (res.text ?? "").trim(), usage: usageOf(res.usageMetadata) };
  },

  async embed(input, apiKey) {
    try {
      const res = await clientFor(apiKey).models.embedContent({ model: input.model, contents: input.text });
      const vector = res.embeddings?.[0]?.values ?? [];
      return { vector, usage: { inputTokens: Math.ceil(input.text.length / 4), outputTokens: 0 } };
    } catch (e) {
      throw toError(e);
    }
  },
};
