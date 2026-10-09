/* eslint-disable @typescript-eslint/no-explicit-any -- standalone script, admin client rows are untyped */
// Operator script: binds blocks to an installed Crop Knowledge Pack, so the
// daily decision-engine run evaluates them (in shadow). It stands in for the
// farm-setup screen until that is built.
//
// A block is bound when its crop is the pack's crop (by the crop names in
// utils/crops.ts, so "Badem" matches the almond pack). Its variety is matched
// by name to a pack variety; a variety the pack does not list leaves the
// variety unbound, and the engines then use the crop's general values.
// Blocks already bound to this pack version are left alone. Every change is
// written to block_pack_history.
//
// Usage:
//   npm run bind:blocks -- --pack=almond --version=0.1.0 --dry-run
//   npm run bind:blocks -- --pack=almond --version=0.1.0 [--farm=<farm id>]
//
// Local .env.local points at production, so this writes to the live database.

import { join } from "path";
import { config } from "dotenv";
import { packSchema } from "../engines/pack/schema";
import { findCrop } from "../utils/crops";
import { createAdminClient } from "../utils/supabase/admin";

config({ path: join(process.cwd(), ".env.local") });

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

const key = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

async function main() {
  const packId = arg("pack");
  const version = arg("version");
  const farmId = arg("farm");
  const dryRun = process.argv.includes("--dry-run");
  if (!packId || !version) {
    console.error("Usage: npm run bind:blocks -- --pack=<id> --version=<x.y.z> [--farm=<farm id>] [--dry-run]");
    process.exit(2);
  }

  const admin: any = createAdminClient();
  const { data: installed, error: packError } = await admin
    .from("crop_packs")
    .select("content")
    .eq("pack_id", packId)
    .eq("version", version)
    .maybeSingle();
  if (packError) {
    console.error(`Could not read crop_packs: ${packError.message}`);
    process.exit(1);
  }
  if (!installed) {
    console.error(`Pack ${packId} ${version} is not installed. Run install:pack first.`);
    process.exit(1);
  }
  const pack = packSchema.parse(installed.content);
  const packCrop = findCrop(pack.manifest.crop.common_name)?.id ?? key(pack.manifest.crop.common_name);
  const varieties = pack.varieties?.varieties ?? [];

  let query = admin.from("blocks").select("id, name, farm_id, crop_type, variety, pack_id, pack_version, pack_variety_id");
  if (farmId) query = query.eq("farm_id", farmId);
  const { data: blocks, error: blocksError } = await query;
  if (blocksError) {
    console.error(`Could not load blocks: ${blocksError.message}`);
    process.exit(1);
  }

  let bound = 0;
  let skipped = 0;
  for (const b of blocks ?? []) {
    const blockCrop = findCrop(b.crop_type)?.id ?? key(b.crop_type);
    if (blockCrop !== packCrop) continue;
    const variety = varieties.find((v) => key(v.name) === key(b.variety) || v.id === key(b.variety)) ?? null;
    const varietyId = variety?.id ?? null;
    if (b.pack_id === packId && b.pack_version === version && (b.pack_variety_id ?? null) === varietyId) {
      skipped++;
      continue;
    }
    console.log(
      `${dryRun ? "Would bind" : "Binding"} block ${b.id}: ${packId} ${version}, variety ${varietyId ?? `not in the pack ("${b.variety ?? "none"}")`}`,
    );
    bound++;
    if (dryRun) continue;

    const { error: updateError } = await admin
      .from("blocks")
      .update({ pack_id: packId, pack_version: version, pack_variety_id: varietyId })
      .eq("id", b.id);
    if (updateError) {
      console.error(`  not bound: ${updateError.message}`);
      process.exit(1);
    }
    const { error: historyError } = await admin.from("block_pack_history").insert({
      farm_id: b.farm_id,
      block_id: b.id,
      pack_id: packId,
      pack_version: version,
      pack_variety_id: varietyId,
      reason: "Bound by the operator script (bind:blocks)",
    });
    if (historyError) console.error(`  bound, but the history entry was not written: ${historyError.message}`);
  }
  console.log(`${dryRun ? "Dry run: " : ""}${bound} block(s) ${dryRun ? "to bind" : "bound"}, ${skipped} already bound.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
