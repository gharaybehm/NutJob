// The calculated figures the assistant may quote for a block, taken from the
// daily snapshot the engines wrote (engines/snapshot.ts → daily_snapshots).
// The model never works these out: it quotes them, or says the calculation is
// off and why. Leaf bands, the nitrogen budget and the growth stage reach the
// model through utils/build-block-context.ts, which already runs those engines.

import type { DailySnapshot } from "@/engines/snapshot";

export type BlockFact =
  | { name: string; value: string; source: string }
  | { name: string; off: true; reason: string };

/** A snapshot older than this is reported as stale rather than quoted as today's. */
const STALE_DAYS = 2;

function daysOld(date: string, now: Date): number {
  const t = Date.parse(`${date}T12:00:00Z`);
  return Number.isNaN(t) ? Infinity : Math.floor((now.getTime() - t) / 86_400_000);
}

const fmt = (n: number | null | undefined, unit: string) => (n == null ? null : `${Math.round(n * 10) / 10} ${unit}`);

export function blockFacts(snapshot: DailySnapshot | null, now: Date): BlockFact[] {
  if (!snapshot) {
    return [
      { name: "Irrigation calculation", off: true, reason: "no daily snapshot has been calculated for this block yet" },
      { name: "Frost risk calculation", off: true, reason: "no daily snapshot has been calculated for this block yet" },
    ];
  }

  const age = daysOld(snapshot.date, now);
  const source = `daily snapshot of ${snapshot.date}${age >= STALE_DAYS ? ` (${age} days old)` : ""}`;
  const facts: BlockFact[] = [];

  if (!snapshot.crop.hasProfile) {
    const reason = `no crop data is confirmed for "${snapshot.crop.name ?? "this crop"}"`;
    facts.push({ name: "Irrigation calculation", off: true, reason });
    facts.push({ name: "Frost risk calculation", off: true, reason });
    return facts;
  }

  // ── Irrigation ──
  const irr = snapshot.water.irrigation;
  if (irr.status === "data_required") {
    facts.push({
      name: "Irrigation calculation",
      off: true,
      reason: irr.dataGaps.length > 0 ? irr.dataGaps.join("; ") : "required block data is missing",
    });
  } else {
    facts.push({ name: "Irrigation status", value: irr.status.replace(/_/g, " "), source });
    const pairs: [string, string | null][] = [
      ["Irrigation requirement", fmt(irr.requirementMm, "mm")],
      ["Irrigation volume", fmt(irr.requirementM3, "m³")],
      ["Root-zone depletion", fmt(irr.depletionMm, "mm")],
      ["Readily available water", fmt(irr.rawMm, "mm")],
      ["Total available water", fmt(irr.tawMm, "mm")],
      ["Crop water use (ETc)", fmt(irr.etcMmPerDay, "mm/day")],
      ["Days until irrigation threshold", irr.daysToThreshold == null ? null : String(irr.daysToThreshold)],
    ];
    for (const [name, value] of pairs) if (value) facts.push({ name, value, source });
    facts.push({ name: "Irrigation confidence", value: irr.confidence, source });
    if (irr.dataGaps.length > 0) facts.push({ name: "Irrigation data gaps", value: irr.dataGaps.join("; "), source });
  }

  // ── Frost ──
  const frost = snapshot.weather.frost;
  if (!frost.applicable || !frost.threshold) {
    facts.push({
      name: "Frost risk calculation",
      off: true,
      reason: frost.notes.length > 0 ? frost.notes.join("; ") : "no frost threshold applies at this stage or for this variety",
    });
  } else {
    facts.push({ name: "Frost risk level", value: frost.level, source });
    facts.push({
      name: "Frost damage thresholds",
      value: [
        `10% kill at ${frost.threshold.lt10} °C`,
        frost.threshold.lt50 != null ? `50% kill at ${frost.threshold.lt50} °C` : null,
        frost.threshold.lt90 != null ? `90% kill at ${frost.threshold.lt90} °C` : null,
      ].filter(Boolean).join(", "),
      source,
    });
    if (frost.worstDay) {
      facts.push({
        name: "Coldest forecast night",
        value: `${frost.worstDay.date}: ${frost.worstDay.tMin} °C (range ${frost.worstDay.tMinLow} to ${frost.worstDay.tMinHigh} °C)`,
        source,
      });
    }
  }

  if (snapshot.phenology.stage.value) {
    facts.push({ name: "Growth stage", value: snapshot.phenology.stage.value, source });
  }
  return facts;
}

export function formatFacts(facts: BlockFact[]): string {
  return facts
    .map((f) => ("off" in f ? `- ${f.name}: OFF — ${f.reason}` : `- ${f.name}: ${f.value} (${f.source})`))
    .join("\n");
}
