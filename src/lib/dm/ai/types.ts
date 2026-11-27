// AI sağlayıcı katmanı: Gemini, Anthropic (Claude) ve OpenAI için ortak arayüz. Model "sağlayıcı:model" biçiminde seçilir.

export type AiProviderName = "gemini" | "anthropic" | "openai" | "fake";

export type AiMedia = { mimeType: string; data: string /* base64 */ };

export type AiTurn = { role: "user" | "assistant"; text: string; images?: AiMedia[] };

export type AiToolDef = {
  name: string;
  description: string;
  /** JSON Schema (object). */
  parameters: { type: "object"; properties: Record<string, unknown>; required?: string[] };
};

export type AiToolCall = { name: string; args: Record<string, unknown> };

export type AiUsage = { inputTokens: number; outputTokens: number };

export type AiChatResult = {
  text: string;
  toolCalls: AiToolCall[];
  usage: AiUsage;
  model: string;
  provider: AiProviderName;
  /** Model güvenlik nedeniyle cevap vermedi. */
  refused?: boolean;
};

export type AiChatInput = {
  model: string;
  system: string;
  turns: AiTurn[];
  tools?: AiToolDef[];
  /** Araç çağrısını çalıştırır; dönen metin modele araç sonucu olarak verilir. */
  executeTool?: (call: AiToolCall) => Promise<string>;
  maxToolRounds?: number;
  maxOutputTokens?: number;
  /** "json": modelden yalnızca JSON istenir (sınıflandırma, kurulum analizi). */
  json?: boolean;
};

export interface AiProvider {
  chat(input: AiChatInput, apiKey: string): Promise<AiChatResult>;
  /** Görsel / video analizi (tek istek). */
  describe?(input: { model: string; prompt: string; media: AiMedia }, apiKey: string): Promise<{ text: string; usage: AiUsage }>;
  embed?(input: { model: string; text: string }, apiKey: string): Promise<{ vector: number[]; usage: AiUsage }>;
}

export class AiError extends Error {
  constructor(message: string, readonly retryable = true) {
    super(message);
  }
}
