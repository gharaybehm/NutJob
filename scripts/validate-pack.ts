// Validates a Crop Knowledge Pack (CDSS specification, Part B, V1-V7) and
// prints the report: errors, the pack's own test results, which engines can
// go Live, the values still to be sourced and the notes for the agronomist.
//
// Usage:
//   npm run validate:pack -- --pack=almond --version=0.1.0
//   npm run validate:pack -- --pack=almond --version=0.1.0 --sign   (writes the signature into manifest.yaml)
//
// Packs live in ./packs/<id>/<version>/ as plain YAML files. The signature is
// a SHA-256 over those files; re-sign after any reviewed change, otherwise
// validation fails with V1. No database and no network are used.

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { loadPackSource } from "../engines/pack/load";
import { formatValidationReport, validatePack } from "../engines/pack/validate";

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

const packId = arg("pack");
const version = arg("version");
if (!packId || !version) {
  console.error("Usage: npm run validate:pack -- --pack=<id> --version=<x.y.z> [--sign]");
  process.exit(2);
}

const directory = join(process.cwd(), "packs", packId, version);
let source = loadPackSource(directory);

if (process.argv.includes("--sign")) {
  const manifestPath = join(directory, "manifest.yaml");
  const manifest = readFileSync(manifestPath, "utf8");
  if (!/^signature:.*$/m.test(manifest)) {
    console.error("manifest.yaml has no signature line to update");
    process.exit(2);
  }
  writeFileSync(manifestPath, manifest.replace(/^signature:.*$/m, `signature: ${source.digest}`));
  console.log(`Signed ${packId} ${version}: ${source.digest}\n`);
  source = loadPackSource(directory);
}

const report = validatePack(source.raw, { digest: source.digest });
console.log(formatValidationReport(report));
process.exit(report.ok ? 0 : 1);
