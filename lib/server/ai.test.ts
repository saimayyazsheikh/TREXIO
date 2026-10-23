import { describe, expect, it, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_CLAUDE_MODEL, DEFAULT_GEMINI_MODEL, anthropicProvider, chooseProvider, geminiProvider, mockProvider, providerFromEnv, type ClaudeClient } from "@/lib/server/ai";

const req = { system: "Be brief.", prompt: "Figures: {}" };
const fakeClaude = (result: unknown) => {
  const create = vi.fn(async () => {
    if (result instanceof Error) throw result;
    return result;
  });
  return { create, client: { messages: { create } } as unknown as ClaudeClient };
};

describe("anthropicProvider", () => {
  it("sends the system prompt and figures, with low effort, and returns only the text blocks", async () => {
    const { create, client } = fakeClaude({ stop_reason: "end_turn", content: [{ type: "thinking", thinking: "" }, { type: "text", text: "  ## Highlights\n- Good week  " }] });
    const text = await anthropicProvider({ client }).generate(req);
    expect(text).toBe("## Highlights\n- Good week");
    const args = (create.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(args).toMatchObject({ model: DEFAULT_CLAUDE_MODEL, system: "Be brief.", output_config: { effort: "low" }, messages: [{ role: "user", content: "Figures: {}" }] });
    expect(args).not.toHaveProperty("thinking"); // thinking can't be configured on this model
    expect(args).not.toHaveProperty("temperature");
  });
  it("uses the model from the environment when given", async () => {
    const { create, client } = fakeClaude({ stop_reason: "end_turn", content: [{ type: "text", text: "ok" }] });
    await anthropicProvider({ client, model: "claude-sonnet-5-5" }).generate(req);
    expect(((create.mock.calls[0] as unknown[])[0] as { model: string }).model).toBe("claude-sonnet-5-5");
  });
  it("treats a refusal, an empty answer and API errors as friendly failures", async () => {
    await expect(anthropicProvider({ client: fakeClaude({ stop_reason: "refusal", content: [] }).client }).generate(req)).rejects.toMatchObject({ status: 502, message: expect.stringContaining("declined") });
    await expect(anthropicProvider({ client: fakeClaude({ stop_reason: "end_turn", content: [{ type: "text", text: "  " }] }).client }).generate(req)).rejects.toMatchObject({ status: 502 });
    const auth = new Anthropic.AuthenticationError(401, { type: "error" }, "bad key", new Headers());
    await expect(anthropicProvider({ client: fakeClaude(auth).client }).generate(req)).rejects.toThrow(/API key was rejected/);
    const busy = new Anthropic.RateLimitError(429, { type: "error" }, "slow down", new Headers());
    await expect(anthropicProvider({ client: fakeClaude(busy).client }).generate(req)).rejects.toThrow(/busy/);
  });
  it("caps the length so a runaway answer can't bloat the database", async () => {
    const { client } = fakeClaude({ stop_reason: "end_turn", content: [{ type: "text", text: "x".repeat(20_000) }] });
    expect((await anthropicProvider({ client }).generate(req)).length).toBe(6000);
  });
});

describe("geminiProvider", () => {
  it("posts the prompt with the key in a header, not the URL, and joins the parts", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "Hello" }, { text: "world" }] } }] }), { status: 200 }));
    const text = await geminiProvider({ apiKey: "secret", fetchImpl: fetchImpl as unknown as typeof fetch }).generate(req);
    expect(text).toBe("Hello\nworld");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_GEMINI_MODEL}:generateContent`);
    expect(url).not.toContain("secret");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("secret");
    expect(JSON.parse(String(init.body)).systemInstruction.parts[0].text).toBe("Be brief.");
  });
  it("turns failures into friendly errors", async () => {
    const respond = (status: number, body: unknown) => geminiProvider({ apiKey: "k", fetchImpl: (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch });
    await expect(respond(403, {}).generate(req)).rejects.toThrow(/key was rejected/);
    await expect(respond(500, {}).generate(req)).rejects.toMatchObject({ status: 502 });
    await expect(respond(200, { candidates: [] }).generate(req)).rejects.toThrow(/empty answer/);
    await expect(geminiProvider({ apiKey: "k", fetchImpl: (async () => Promise.reject(new Error("net"))) as unknown as typeof fetch }).generate(req)).rejects.toThrow(/Couldn't reach/);
  });
});

describe("choosing a provider", () => {
  it("prefers Claude, then Gemini, then the template", () => {
    expect(chooseProvider({ ANTHROPIC_API_KEY: "a", GEMINI_API_KEY: "g" })).toBe("anthropic");
    expect(chooseProvider({ GEMINI_API_KEY: "g" })).toBe("gemini");
    expect(chooseProvider({})).toBe("mock");
  });
  it("honours an explicit choice, and refuses one without its key", () => {
    expect(chooseProvider({ AI_PROVIDER: "gemini", ANTHROPIC_API_KEY: "a", GEMINI_API_KEY: "g" })).toBe("gemini");
    expect(chooseProvider({ AI_PROVIDER: "mock", ANTHROPIC_API_KEY: "a" })).toBe("mock");
    expect(() => chooseProvider({ AI_PROVIDER: "anthropic" })).toThrow(/key isn't set/);
    expect(() => chooseProvider({ AI_PROVIDER: "gemini", ANTHROPIC_API_KEY: "a" })).toThrow(/key isn't set/);
  });
  it("the template provider answers without any network", async () => {
    const p = providerFromEnv({}, () => "TEMPLATE");
    expect(p).toMatchObject({ name: "mock", model: "template" });
    expect(await p.generate(req)).toBe("TEMPLATE");
    expect(mockProvider(() => "x").name).toBe("mock");
  });
});
