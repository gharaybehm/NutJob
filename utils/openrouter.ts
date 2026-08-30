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
