import OpenAI from "openai";

// Shared OpenRouter client, constructed lazily on first use.
//
// This replaces four identical copies of the same module-level `new OpenAI({...})`
// block. Constructing eagerly broke the container build: Next's "collect page
// data" step imports app/api/extract-soil-test/route.ts, and with no API key in
// the build environment the SDK threw "Missing credentials" and failed
// `next build` outright.
//
// The old `apiKey: process.env.OPENROUTER_API_KEY || ""` made that worse — an
// empty string is not a missing key, so the failure surfaced inside the SDK
// rather than as something obviously about configuration.
//
// The alternative, marking OPENROUTER_API_KEY as a build-time variable, would
// bake a live API key into an image layer. Deferring construction keeps the
// build key-free while preserving a loud, clear failure at first real use.
// Mirrors utils/stripe.ts and the lazy pattern in utils/email.ts.
let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "Missing OPENROUTER_API_KEY. Add it to .env.local (or the deployment environment) — see .env.local.example."
      );
    }
    client = new OpenAI({
      apiKey,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": "https://rootloot.ai",
        "X-Title": "RootLoot Farm Management",
      },
    });
  }
  return client;
}

/** True when an OpenRouter/Gemini key is configured, without constructing a client. */
export function isOpenRouterConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY);
}

// Proxy so call sites keep using `openrouter.chat.completions.create(...)`
// unchanged; only the timing of construction moves.
export const openrouter = new Proxy({} as OpenAI, {
  get(_target, prop, receiver) {
    return Reflect.get(getClient(), prop, receiver);
  },
});

/**
 * True for a failure that says the provider is unavailable (rate limit, 5xx,
 * timeout, connection) rather than that the request was wrong — the only case
 * in which the fallback model should take over.
 */
export function isOutageError(e: unknown): boolean {
  if (e instanceof OpenAI.APIConnectionError) return true; // includes timeouts
  if (e instanceof OpenAI.APIError) {
    const status = e.status ?? 0;
    return status === 408 || status === 429 || status >= 500;
  }
  return false;
}

type ChatParams = Omit<OpenAI.Chat.ChatCompletionCreateParamsNonStreaming, "model">;
type ChatStreamParams = Omit<OpenAI.Chat.ChatCompletionCreateParamsStreaming, "model" | "stream">;

/** A chat completion on `model`, switching once to `fallback` on an outage. */
export async function completeWithFallback(
  params: ChatParams,
  model: string,
  fallback: string,
  options: { timeoutMs?: number } = {}
): Promise<{ completion: OpenAI.Chat.ChatCompletion; model: string; usedFallback: boolean }> {
  const timeout = options.timeoutMs ?? 60_000;
  try {
    const completion = await openrouter.chat.completions.create({ ...params, model }, { timeout, maxRetries: 0 });
    return { completion, model, usedFallback: false };
  } catch (e) {
    if (!isOutageError(e)) throw e;
    const completion = await openrouter.chat.completions.create({ ...params, model: fallback }, { timeout, maxRetries: 0 });
    return { completion, model: fallback, usedFallback: true };
  }
}

/**
 * A streamed chat completion on `model`, switching once to `fallback` when the
 * request fails before any token arrives. A stream that breaks part-way is the
 * caller's to handle.
 */
export async function streamWithFallback(
  params: ChatStreamParams,
  model: string,
  fallback: string,
  options: { timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<{ stream: AsyncIterable<OpenAI.Chat.ChatCompletionChunk>; model: string; usedFallback: boolean }> {
  const opts = { timeout: options.timeoutMs ?? 60_000, maxRetries: 0, signal: options.signal };
  try {
    const stream = await openrouter.chat.completions.create({ ...params, model, stream: true }, opts);
    return { stream, model, usedFallback: false };
  } catch (e) {
    if (!isOutageError(e)) throw e;
    const stream = await openrouter.chat.completions.create({ ...params, model: fallback, stream: true }, opts);
    return { stream, model: fallback, usedFallback: true };
  }
}
