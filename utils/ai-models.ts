// The one place model names live. Change a model only after the quality check
// (npm run test:assistant) passes on the new one — see Requirements.md, Field assistant.

/** Weekly recommendations and the field assistant: low cost, fast, good in en/tr/ar. */
export const PRIMARY_MODEL = "google/gemini-2.5-flash";

/** One retry for a failure code can detect (wrong form, no citation, unknown figure). */
export const RETRY_MODEL = "google/gemini-2.5-pro";

/** Same class, another provider: takes over when the primary is unavailable. */
export const FALLBACK_MODEL = "openai/gpt-4.1-mini";

export const EMBEDDING_MODEL = "text-embedding-3-small";
