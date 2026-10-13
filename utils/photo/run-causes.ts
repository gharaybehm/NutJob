/* eslint-disable @typescript-eslint/no-explicit-any -- photo_cases postdates the generated Supabase types */
// The model step of a photo case, server only: read the stored photos, ask the
// model what might be wrong, keep what passes the code's own checks
// (utils/photo/diagnose.ts) and store it for the farm's supervisors and admins.
//
// Runs with the service role because it is called after the request that
// recorded the case has answered, and because users have no read access to
// the bucket. The caller has already checked the user's role on the farm;
// everything here is keyed to the one case id it was given.

import { createAdminClient } from "@/utils/supabase/admin";
import { completeWithFallback } from "@/utils/openrouter";
import { FALLBACK_MODEL, PRIMARY_MODEL } from "@/utils/ai-models";
import { PHOTO_BUCKET } from "./case";
import { buildMessages, contextLine, isJpeg, parseVerdict, toPossibleCauses } from "./diagnose";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
// The answer is a few short lines; the headroom is for models that reason first.
const GENERATION = { max_tokens: 2000, temperature: 0, response_format: { type: "json_object" as const } };

export type CausesOutcome = "done" | "failed";

async function store(admin: any, caseId: string, farmId: string, fields: Record<string, unknown>) {
  await admin
    .from("photo_case_results")
    .upsert({ case_id: caseId, farm_id: farmId, updated_at: new Date().toISOString(), ...fields }, { onConflict: "case_id" });
}

/**
 * Asks the model about one recorded case and stores the result. `language` is
 * the language to answer in. Never throws: a failure is stored as 'failed' so
 * a supervisor can run it again.
 */
export async function runPhotoCauses(caseId: string, language: string): Promise<CausesOutcome> {
  const admin = createAdminClient() as any;
  const { data: c } = await admin.from("photo_cases").select("id, farm_id, block_id, taken_at, note, photo_paths").eq("id", caseId).maybeSingle();
  if (!c) return "failed";

  try {
    const [{ data: block }, { data: farm }] = await Promise.all([
      admin.from("blocks").select("crop_type, variety").eq("id", c.block_id).maybeSingle(),
      admin.from("farms").select("country").eq("id", c.farm_id).maybeSingle(),
    ]);

    const images: string[] = [];
    for (const path of c.photo_paths as string[]) {
      // The table's own check ties every path to this case; checked again before reading.
      if (!path.startsWith(`${c.farm_id}/${c.id}/`)) throw new Error("path outside the case");
      const { data: file, error } = await admin.storage.from(PHOTO_BUCKET).download(path);
      if (error || !file) throw new Error("photo not readable");
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!isJpeg(bytes)) throw new Error("not a JPEG");
      images.push(`data:image/jpeg;base64,${Buffer.from(bytes).toString("base64")}`);
    }

    const context = contextLine({
      crop: block?.crop_type,
      variety: block?.variety,
      month: MONTHS[new Date(c.taken_at).getUTCMonth()],
      region: farm?.country ? `country code ${farm.country}` : null,
    });
    const { completion, model } = await completeWithFallback(
      { ...GENERATION, messages: buildMessages({ images, context, note: c.note, language }) as any },
      PRIMARY_MODEL,
      FALLBACK_MODEL,
      { timeoutMs: 90_000 },
    );
    const verdict = parseVerdict(completion.choices[0]?.message?.content ?? "", images.length);
    await store(admin, c.id, c.farm_id, { status: "done", reason: null, model, result: toPossibleCauses(verdict) });
    return "done";
  } catch (e) {
    // The reason is a short internal label, not shown to users and never model text.
    console.error("[photo-cases] model step failed for case", caseId, e instanceof Error ? e.message : e);
    await store(admin, c.id, c.farm_id, { status: "failed", reason: "error" }).catch(() => undefined);
    return "failed";
  }
}
