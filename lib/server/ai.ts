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
/** Gemini 2.5 Flash is closed to new accounts and the "-latest" alias answered far too slowly in testing, so the default is 3.5 Flash. Override with AI_MODEL. */
export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash";

/** A summary should take seconds. Past this the request is given up on, so a stuck provider can never hold a job open. */
export const AI_TIMEOUT_MS = 60_000;

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
  const client = o.client ?? new Anthropic({ apiKey: o.apiKey, timeout: AI_TIMEOUT_MS, maxRetries: 1 });
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

/** Google answers these when a model is overloaded or hiccuping; they usually clear within seconds, so they are tried again. */
const RETRYABLE = new Set([429, 500, 502, 503, 504]);
/** Waits before the second try on the same model. */
export const GEMINI_RETRY_DELAYS_MS = [1200];
/** How long one try on one model may take. A model that hangs is given up on so a lighter one can answer, instead of the admin waiting a minute. */
export const GEMINI_TIMEOUT_MS = 20_000;
/**
 * Lighter models to turn to when the main one stays busy (Google overloads the newest one often). They are quick and good enough for
 * short summaries and for reading a task out of a sentence. Names Google no longer serves are simply skipped.
 */
export const GEMINI_FALLBACK_MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Gemini over its REST API (the key goes in a header, never the URL). A busy answer (503, 429) is tried once more, and if the model
 * is still busy the next lighter model answers instead, so a Google overload doesn't reach the admin.
 */
export function geminiProvider(o: { apiKey: string; model?: string; fetchImpl?: typeof fetch; retryDelaysMs?: number[]; fallbackModels?: string[]; timeoutMs?: number }): AiProvider {
  const model = o.model || DEFAULT_GEMINI_MODEL;
  const doFetch = o.fetchImpl ?? fetch;
  const delays = o.retryDelaysMs ?? GEMINI_RETRY_DELAYS_MS;
  const timeoutMs = o.timeoutMs ?? GEMINI_TIMEOUT_MS;
  const models = [model, ...(o.fallbackModels ?? GEMINI_FALLBACK_MODELS).filter((m) => m !== model)];
  return {
    name: "gemini",
    model,
    async generate({ system, prompt }) {
      let res: Response | undefined;
      let body: GeminiResponse = {};
      let timedOut = false;
      for (const m of models) {
        timedOut = false;
        for (let attempt = 0; ; attempt++) {
          try {
            res = await doFetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`, {
              method: "POST",
              signal: AbortSignal.timeout(timeoutMs),
              headers: { "Content-Type": "application/json", "x-goog-api-key": o.apiKey },
              body: JSON.stringify({
                systemInstruction: { parts: [{ text: system }] },
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                generationConfig: { maxOutputTokens: 8192, temperature: 0.3 },
              }),
            });
          } catch (error) {
            // A model that hangs is skipped, not retried: the next one is much more likely to answer.
            if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
              timedOut = true;
              res = undefined;
              break;
            }
            throw new DomainError("Couldn't reach the AI service. Try again.", 502);
          }
          body = (await res.json().catch(() => ({}))) as GeminiResponse;
          if (res.ok || !RETRYABLE.has(res.status) || attempt >= delays.length) break;
          await wait(delays[attempt]);
        }
        // Anything but "busy", "too slow" or "this model isn't served any more" is final: a rejected key stays rejected on every model.
        if (timedOut) continue;
        if (res && (res.ok || !(RETRYABLE.has(res.status) || res.status === 404))) break;
      }
      if (!res) throw new DomainError("The AI service took too long to answer. Try again.", 502);
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) throw new DomainError("The Gemini API key was rejected. Check GEMINI_API_KEY.", 502);
        if (res.status === 429 || res.status === 503) throw new DomainError("The AI service is busy right now. Wait a minute and try again.", 502);
        throw new DomainError("The AI service couldn't write the summary. Try again.", 502);
      }
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
