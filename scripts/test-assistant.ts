/* eslint-disable @typescript-eslint/no-explicit-any -- standalone script, admin client rows are untyped */
// Field assistant quality check (Requirements.md, "Quality check"). Runs the
// fixed question set through the same answering core the route uses
// (utils/assistant/answer.ts) against one farm, and checks each answer's kind,
// decline category, citations and language.
//
//   npm run test:assistant -- --farm=<farm id>        (or ASSISTANT_TEST_FARM in .env.local)
//   npm run test:assistant -- --farm=<id> --only=sourced-orangeworm
//
// Run it before release and after any change to the search, the instructions
// or a model name. It costs one or two model calls and an embedding per
// question, and writes nothing: no conversation, no events.

import { join } from "path";
import { readFileSync } from "fs";
import { config } from "dotenv";

config({ path: join(process.cwd(), ".env.local") });

interface Case {
  id: string;
  locale: "en" | "tr" | "ar";
  question: string;
  pins?: Record<string, string>;
  expect: {
    kind: "answer" | "decline";
    category?: string;
    /** yes: must cite; none: must not need sources (record question); either: cites, or says why not. */
    sourced?: "yes" | "none" | "either";
    script?: "tr" | "ar";
  };
}

function translator(locale: string): (key: string) => string {
  const messages = JSON.parse(readFileSync(join(process.cwd(), "messages", `${locale}.json`), "utf8")).assistant;
  return (key) => key.split(".").reduce((o: any, k) => (o == null ? o : o[k]), messages) ?? key;
}

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

async function main() {
  const { createAdminClient } = await import("../utils/supabase/admin");
  const { answerQuestion } = await import("../utils/assistant/answer");
  const { loadFarm, checkPins } = await import("../utils/assistant/gather");

  const admin = createAdminClient() as any;
  const farmId = arg("farm") ?? process.env.ASSISTANT_TEST_FARM;
  if (!farmId) {
    console.error("Give a farm: --farm=<farm id>, or set ASSISTANT_TEST_FARM in .env.local. Farms:");
    const { data } = await admin.from("farms").select("id, name").order("name");
    for (const f of data ?? []) console.error(`  ${f.id}  ${f.name}`);
    process.exit(2);
  }
  const only = arg("only");
  const cases: Case[] = JSON.parse(readFileSync(join(process.cwd(), "scripts", "assistant-questions.json"), "utf8"));
  const farm = await loadFarm(admin, farmId);
  if (!farm) {
    console.error(`Farm ${farmId} not found`);
    process.exit(2);
  }
  console.log(`Farm: ${farm.name} (country ${farm.country ?? "not set"}, ${farm.blocks.length} blocks)\n`);

  let failed = 0;
  for (const c of cases.filter((x) => !only || x.id === only)) {
    const pins = (await checkPins(admin, farm, c.pins ?? null)) ?? {};
    const problems: string[] = [];
    let summary = "";
    try {
      const r = await answerQuestion({ admin, farm, pins, question: c.question, locale: c.locale, history: [], t: translator(c.locale) });
      if (r.kind !== c.expect.kind) problems.push(`expected ${c.expect.kind}, got ${r.kind}${r.kind === "decline" ? ` (${r.category})` : ""}`);
      if (r.kind === "decline") {
        if (c.expect.category && r.category !== c.expect.category) problems.push(`expected category ${c.expect.category}, got ${r.category}`);
        summary = `decline/${r.category}`;
      } else {
        const cites = r.citations.length;
        if (c.expect.sourced === "yes" && cites === 0) problems.push(`no citation (reference status ${r.referenceStatus})`);
        if (c.expect.sourced === "none" && r.referenceStatus !== null) problems.push(`treated as advice (reference status ${r.referenceStatus})`);
        if (c.expect.sourced === "either" && cites === 0 && !r.referenceStatus) problems.push("neither cites nor says why not");
        if (c.expect.script === "ar" && !/[؀-ۿ]/.test(r.text)) problems.push("answer is not in Arabic");
        if (c.expect.script === "tr" && !/[çğıöşüÇĞİÖŞÜ]/.test(r.text)) problems.push("answer does not look Turkish");
        summary = `${cites} citation(s), status ${r.referenceStatus ?? "n/a"}, model ${r.model}, events ${r.events.map((e) => e.kind).join(",") || "none"}`;
      }
      if (process.argv.includes("--show")) console.log(`\n${r.text}\n`);
    } catch (e) {
      problems.push(`threw ${e instanceof Error ? e.message : String(e)}`);
    }
    if (problems.length > 0) failed++;
    console.log(`${problems.length === 0 ? "PASS" : "FAIL"}  ${c.id}  ${summary}`);
    for (const p of problems) console.log(`      ${p}`);
  }
  console.log(`\n${failed === 0 ? "All passed." : `${failed} failed.`}`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
