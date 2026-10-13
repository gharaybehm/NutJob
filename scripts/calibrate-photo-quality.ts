// Prints the on-device quality measures (utils/photo/quality.ts) for every
// photo in a folder, and for blurred, darkened and washed-out copies of each,
// so the thresholds can be set from real photos instead of guessed.
//
//   npx tsx scripts/calibrate-photo-quality.ts --dir=photo-test
//
// Reads files only; nothing is uploaded or written.

import { readdirSync } from "fs";
import { join, resolve } from "path";
import sharp from "sharp";
import { assessPhoto, sampleSize, type QualityReport } from "../utils/photo/quality";

type Variant = "as taken" | "blur 3" | "blur 6" | "dark" | "washed out" | "small";

async function report(path: string, variant: Variant): Promise<QualityReport> {
  let img = sharp(path).rotate();
  const meta = await sharp(path).metadata();
  let original = { width: meta.width ?? 0, height: meta.height ?? 0 };
  if (variant === "blur 3") img = img.blur(3);
  if (variant === "blur 6") img = img.blur(6);
  if (variant === "dark") img = img.linear(0.2, 0);
  if (variant === "washed out") img = img.linear(1.2, 140);
  if (variant === "small") original = { width: Math.round(original.width / 2), height: Math.round(original.height / 2) };

  // Apply the variant at full size first, as the camera would, then sample.
  const full = await img.toBuffer();
  const size = sampleSize(meta.width ?? 1, meta.height ?? 1);
  const { data, info } = await sharp(full).resize(size.width, size.height, { fit: "fill" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return assessPhoto(original, { width: info.width, height: info.height, data });
}

async function main() {
  const dirArg = process.argv.find((a) => a.startsWith("--dir="))?.slice(6);
  if (!dirArg) {
    console.error("Usage: npx tsx scripts/calibrate-photo-quality.ts --dir=photo-test");
    process.exit(1);
  }
  const dir = resolve(dirArg);
  const files = readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();
  const variants: Variant[] = ["as taken", "blur 3", "blur 6", "dark", "washed out", "small"];
  const expected: Record<Variant, string> = {
    "as taken": "",
    "blur 3": "blurred",
    "blur 6": "blurred",
    dark: "too_dark",
    "washed out": "too_bright",
    small: "too_small",
  };
  const missed: Record<string, number> = {};

  for (const file of files) {
    console.log(file);
    for (const variant of variants) {
      const r = await report(join(dir, file), variant);
      const m = r.metrics;
      const verdict = [...r.blocking.map((i) => `BLOCK ${i}`), ...r.warnings.map((i) => `warn ${i}`)].join(", ") || "ok";
      const want = expected[variant];
      const found = want ? [...r.blocking, ...r.warnings].includes(want as never) : verdict === "ok";
      if (!found) missed[variant] = (missed[variant] ?? 0) + 1;
      console.log(
        `  ${variant.padEnd(11)} bright ${m.brightness.toFixed(0).padStart(3)}  dark ${(m.darkShare * 100).toFixed(0).padStart(3)}%  white ${(m.brightShare * 100).toFixed(0).padStart(3)}%  ` +
          `sharp ${m.sharpness.toFixed(0).padStart(5)}  centre ${m.centreSharpness.toFixed(0).padStart(5)}  outer ${m.outerSharpness.toFixed(0).padStart(5)}  ${found ? "" : "<< "}${verdict}`
      );
    }
  }

  console.log(`\n${files.length} photo(s). Not as expected, by variant ("as taken" should be ok):`);
  for (const variant of variants) console.log(`  ${variant.padEnd(11)} ${missed[variant] ?? 0}`);
}

main().catch((e) => {
  console.error("Calibration failed to run:", e);
  process.exit(1);
});
