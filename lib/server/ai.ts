import Anthropic from "@anthropic-ai/sdk";
import { DomainError } from "@/lib/domain/errors";
import { SUMMARY_MAX_CHARS } from "@/lib/domain/ai-summary";

export type AiRequest = { system: string; prompt: string };
export type AiProvider = {
  name: "anthropic" | "gemini" | "mock";
  model: string;
  generate(req: AiRequest): Promise<string>;
};

export const DEFAULT_CLAUDE_MODEL = "claude-opus-5-5";
export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

const clean = (text: string) => text.trim().slice(0, SUMMARY_MAX_CHARS);
const empty = () => new DomainError("The AI service returned an empty answer. Try again.", 502);

/** The slice of the Anthropic client we use, so tests can hand in a fake. */
export type ClaudeClient = Pick<Anthropic, "messages">;

/**
 * Claude through the official SDK. Thinking is always on for this model, so it is left to its default and effort is set
 * low: a short summary of given figures doesn't need deep reasoning. Text blocks are joined and thinking blocks ignored.
 */
export function anthropicProvider(o: { apiKey?: string; model?: string; client?: ClaudeClient }): AiProvider {
  const model = o.model || DEFAULT_CLAUDE_MODEL;
  const client = o.client ?? new Anthropic({ apiKey: o.apiKey });
  return {
    name: "anthropic",
    model,
    async generate({ system, prompt }) {
      let response;
      try {
        response = await client.messages.create({ model, max_tokens: 8000, system, output_config: { effort: "low" }, messages: [{ role: "user", content: prompt }] });
      } catch (error) {
        if (error instanceof Anthropic.AuthenticationError) throw new DomainError("The Claude API key was rejected. Check ANTHROPIC_API_KEY.", 502);
        if (error instanceof Anthropic.RateLimitError) throw new DomainError("The AI service is busy right now. Try again in a minute.", 502);
        if (error instanceof Anthropic.APIError) throw new DomainError("The AI service couldn't write the summary. Try again.", 502);
        throw error;
      }
      if (response.stop_reason === "refusal") throw new DomainError("The AI service declined to write this summary.", 502);
      const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
      if (!text.trim()) throw empty();
      return clean(text);
    },
  };
}

type GeminiResponse = { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]; error?: { message?: string } };

/** Gemini over its REST API (the key goes in a header, never the URL). */
export function geminiProvider(o: { apiKey: string; model?: string; fetchImpl?: typeof fetch }): AiProvider {
  const model = o.model || DEFAULT_GEMINI_MODEL;
  const doFetch = o.fetchImpl ?? fetch;
  return {
    name: "gemini",
    model,
    async generate({ system, prompt }) {
      let res: Response;
      try {
        res = await doFetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": o.apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 2000, temperature: 0.3 },
          }),
        });
      } catch {
        throw new DomainError("Couldn't reach the AI service. Try again.", 502);
      }
      const body = (await res.json().catch(() => ({}))) as GeminiResponse;
      if (!res.ok) throw new DomainError(res.status === 401 || res.status === 403 ? "The Gemini API key was rejected. Check GEMINI_API_KEY." : "The AI service couldn't write the summary. Try again.", 502);
      const text = (body.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("\n");
      if (!text.trim()) throw empty();
      return clean(text);
    },
  };
}

/** Stands in when no key is set. The summary service sees the name "mock" and writes the rule-based template itself. */
export function mockProvider(template: (req: AiRequest) => string = () => ""): AiProvider {
  return { name: "mock", model: "template", generate: async (req) => template(req) };
}

export type AiEnv = { AI_PROVIDER?: string; AI_MODEL?: string; ANTHROPIC_API_KEY?: string; GEMINI_API_KEY?: string; GEMINI_MODEL?: string };

/** Which provider the environment asks for, or "mock" when no key is set. An explicit AI_PROVIDER without its key is an error, not a silent fallback. */
export function chooseProvider(env: AiEnv): "anthropic" | "gemini" | "mock" {
  const want = env.AI_PROVIDER?.toLowerCase();
  if (want === "mock") return "mock";
  if (want === "anthropic" || want === "gemini") {
    const key = want === "anthropic" ? env.ANTHROPIC_API_KEY : env.GEMINI_API_KEY;
    if (!key) throw new DomainError(`AI_PROVIDER is "${want}" but its API key isn't set.`, 503);
    return want;
  }
  if (env.ANTHROPIC_API_KEY) return "anthropic";
  if (env.GEMINI_API_KEY) return "gemini";
  return "mock";
}

export function providerFromEnv(env: AiEnv, template?: (req: AiRequest) => string): AiProvider {
  switch (chooseProvider(env)) {
    case "anthropic":
      return anthropicProvider({ apiKey: env.ANTHROPIC_API_KEY, model: env.AI_MODEL });
    case "gemini":
      return geminiProvider({ apiKey: env.GEMINI_API_KEY!, model: env.AI_MODEL || env.GEMINI_MODEL });
    default:
      return mockProvider(template);
  }
}
