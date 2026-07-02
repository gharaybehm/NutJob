/* eslint-disable @typescript-eslint/no-explicit-any -- untyped Supabase client casts */
import { logger, schedules } from "@trigger.dev/sdk/v3";
import OpenAI from "openai";
import { createAdminClient } from "../../utils/supabase/admin";
import { AI_SYSTEM_PROMPT, buildAllBlockContexts } from "../../utils/build-block-context";

const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY || "",
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: {
    "HTTP-Referer": "https://rootloot.ai",
    "X-Title": "RootLoot Farm Management",
  },
});

const OPENROUTER_MODEL = "google/gemini-2.5-flash";

// Runs automatically every Monday at 04:00 UTC.
// Can also be triggered manually via the Trigger.dev dashboard.
export const generateRecommendationsTask = schedules.task({
  id: "generate-recommendations",
  cron: "0 4 * * 1", // Monday 04:00 UTC
  maxDuration: 600,
  run: async () => {
    logger.log("Starting weekly AI Agronomist recommendations task");

    const admin = createAdminClient();
    const today = new Date().toISOString().split("T")[0];

    const { blockContexts, blockIds } = await buildAllBlockContexts(admin);

    logger.log("Built 3-tier block context", { blockCount: blockIds.length });

    const response = await openrouter.chat.completions.create({
      model: OPENROUTER_MODEL,
      messages: [
        { role: "system", content: AI_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Today: ${today}\n\nFarm data:\n\n${blockContexts}\n\nGenerate prioritised recommendations.`,
        },
      ],
      response_format: { type: "json_object" },
    });

    const raw = response.choices[0].message.content || "[]";
    logger.log("Received AI response", { responseLength: raw.length });

    let parsed: unknown;
    try {
      let clean = raw.trim();
      if (clean.startsWith("```")) {
        clean = clean.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
      }
      parsed = JSON.parse(clean);
      if (!Array.isArray(parsed)) {
        if (typeof parsed === "object" && parsed !== null) {
          const firstArray = Object.values(parsed as Record<string, unknown>).find(Array.isArray);
          if (firstArray) parsed = firstArray;
        }
      }
      if (!Array.isArray(parsed)) throw new Error("Parsed output is not an array");
    } catch (e: any) {
      logger.error("Failed to parse AI JSON", { raw, error: e.message });
      throw new Error(`AI returned unparseable output: ${e.message}`);
    }

    const validCategories = new Set(["irrigate", "fertilize", "spray", "scout", "prune", "other"]);
    const validBlockIds = new Set(blockIds);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const toInsert = (parsed as Record<string, unknown>[])
      .filter(
        (r) =>
          typeof r.block_id === "string" && validBlockIds.has(r.block_id) &&
          typeof r.category === "string" && validCategories.has(r.category) &&
          typeof r.title === "string" && r.title.length > 0 &&
          typeof r.rationale === "string" && r.rationale.length > 0
      )
      .map((r) => ({
        block_id: r.block_id as string,
        category: r.category as any,
        title: (r.title as string).slice(0, 200),
        rationale: r.rationale as string,
        confidence: Math.min(1, Math.max(0, (Number(r.confidence) || 75) / 100)),
        status: "pending" as const,
        llm_model: OPENROUTER_MODEL,
        expires_at: expiresAt,
      }));

    if (toInsert.length === 0) {
      logger.log("No valid recommendations extracted.");
      return { success: true, count: 0, model: OPENROUTER_MODEL };
    }

    const { error: insertError } = await admin.from("recommendations").insert(toInsert);
    if (insertError) throw new Error(`Insert error: ${insertError.message}`);

    logger.log("Weekly AI Agronomist task completed", { count: toInsert.length });
    return { success: true, count: toInsert.length, model: OPENROUTER_MODEL };
  },
});
