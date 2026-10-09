/* eslint-disable @typescript-eslint/no-explicit-any -- standalone script, admin client rows are untyped */
// Operator script: installs a reviewed Crop Knowledge Pack into the database
// (table crop_packs), where the daily decision-engine run reads it. Packs are
// platform-wide, installed after review, in the same way the guide documents
// are loaded with ingest:kb.
//
// Usage:
//   npm run install:pack -- --pack=almond --version=0.1.0 --dry-run   (validate only; no database)
//   npm run install:pack -- --pack=almond --version=0.1.0
//
// The pack is validated first (specification V1-V7, including its signature
// and its own tests) and an invalid pack is refused. An installed version is
// never changed: the same files are skipped, different files under the same
// version number are refused. A change to a pack is a new version.
//
// Local .env.local points at production, so this writes to the live database.

import { join } from "path";
import { config } from "dotenv";
import { loadPackSource } from "../engines/pack/load";
import { formatValidationReport, validatePack } from "../engines/pack/validate";
import { createAdminClient } from "../utils/supabase/admin";

// Next.js loads .env.local automatically; this standalone script does not.
config({ path: join(process.cwd(), ".env.local") });

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const packId = arg("pack");
  const version = arg("version");
  const dryRun = process.argv.includes("--dry-run");
  if (!packId || !version) {
    console.error("Usage: npm run install:pack -- --pack=<id> --version=<x.y.z> [--dry-run]");
    process.exit(2);
  }

  const source = loadPackSource(join(process.cwd(), "packs", packId, version));
  const report = validatePack(source.raw, { digest: source.digest });
  if (!report.ok || !report.pack) {
    console.error(formatValidationReport(report));
    console.error("\nNot installed: the pack is not valid.");
    process.exit(1);
  }
  const passed = report.tests.filter((t) => t.passed).length;
  console.log(`Pack ${packId} ${version} is valid: ${passed} of ${report.tests.length} pack tests passed, ${report.toBeSourced.length} values to be sourced.`);

  if (dryRun) {
    console.log("Dry run: nothing written.");
    return;
  }

  const admin: any = createAdminClient();
  const { data: existing, error: readError } = await admin
    .from("crop_packs")
    .select("digest, installed_at")
    .eq("pack_id", packId)
    .eq("version", version)
    .maybeSingle();
  if (readError) {
    console.error(`Could not read crop_packs: ${readError.message}`);
    console.error("Has migration 20261009000000_decision_engine_shadow.sql been run?");
    process.exit(1);
  }
  if (existing) {
    if (existing.digest === source.digest) {
      console.log(`Already installed on ${String(existing.installed_at).slice(0, 10)} with the same content. Nothing to do.`);
      return;
    }
    console.error(`Version ${version} is already installed with different content (${existing.digest}).`);
    console.error("An installed version is not changed. Give the changed pack a new version number.");
    process.exit(1);
  }

  // The parsed pack is stored without the pack object itself repeated inside the report.
  const { pack, ...summary } = report;
  const { error } = await admin.from("crop_packs").insert({
    pack_id: packId,
    version,
    crop_name: pack.manifest.crop.common_name,
    content: pack,
    digest: source.digest,
    report: summary,
  });
  if (error) {
    console.error(`Not installed: ${error.message}`);
    process.exit(1);
  }
  console.log(`Installed ${packId} ${version}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
