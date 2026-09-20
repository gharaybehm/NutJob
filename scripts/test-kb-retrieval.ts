/* eslint-disable @typescript-eslint/no-explicit-any -- standalone script, admin client rows are untyped */
// Retrieval regression test against the live knowledge base. Runs the real
// retrieval path (retrieveReferenceChunks) on English questions and checks that
// the Spanish MAPA almond guide is returned, and that the returned chunk really
// contains the pest name (page ranges alone let unrelated neighbouring text pass).
//
//   npm run test:kb
//
// Costs a few embedding calls per run. `pages` (from a text search of
// guiadealmendroweb.pdf) is shown for reference only.

import { join } from "path";
import { config } from "dotenv";
import { createAdminClient } from "../utils/supabase/admin";
import { retrieveReferenceChunks } from "../utils/generate-recommendations";

config({ path: join(process.cwd(), ".env.local") });

interface Case {
  query: string;
  /** The returned Spanish chunk must mention this (regex, case-insensitive). */
  term: string;
  /** Pest pages in the PDF, for reference. */
  pages: string;
  /** Country the expected source is from. Default ES. */
  country?: string;
}

const CASES: Case[] = [
  { query: "Monilinia blossom blight at bloom almond", term: "monilinia|monilia", pages: "106-107" },
  { query: "flatheaded borer Capnodis in almond trees", term: "capnodis", pages: "86-88" },
  { query: "red leaf blotch Polystigma almond", term: "polystigma", pages: "118" },
  { query: "almond seed wasp Eurytoma control", term: "eurytoma", pages: "82-84" },
  { query: "Phomopsis constriction canker almond", term: "phomopsis|fusicoccum", pages: "122-123" },
  { query: "Anarsia peach twig borer monitoring", term: "anarsia", pages: "70" },
  // Added with the IRTA frost paper (Calle et al. 2025) and the Makako datasheet.
  { query: "frost damage to almond flowers and young fruit", term: "lethal|freez", pages: "IRTA paper" },
  { query: "Vairo flower frost tolerance lethal temperature", term: "vairo", pages: "IRTA paper" },
  { query: "Makako flowering time and self-compatibility", term: "makako", pages: "datasheet p.1" },
  // Added with the Almond Board bee guide and the IRTA Vairo slides.
  { query: "how many honey bee hives per acre for almond pollination", term: "per acre", pages: "Bee BMP p.7", country: "US" },
  { query: "do self-compatible almond varieties need bees", term: "self-compatible", pages: "Bee BMP", country: "US" },
  { query: "Vairo self-fertile late flowering tolerance to fusicoccum", term: "vairo", pages: "IRTA slides" },
];

// The guide has nothing on these, so they are informational: print what comes back.
const NO_COVERAGE = ["Xylella fastidiosa almond leaf scorch"];

async function main() {
  const admin = createAdminClient();
  let passed = 0;

  for (const c of CASES) {
    const chunks = await retrieveReferenceChunks(admin as any, c.query, "almond", 4);
    const re = new RegExp(c.term, "i");
    const hit = chunks.find((k) => k.country === (c.country ?? "ES") && re.test(k.content));
    if (hit) passed++;
    console.log(`${hit ? "PASS" : "FAIL"}  ${c.query}  (guide pages ${c.pages})`);
    console.log(`      returned: ${chunks.map((k) => `${k.country}${k.page_number ? " p." + k.page_number : ""} ${k.similarity.toFixed(2)}${k.keyword_hit ? " kw" : ""}`).join(" | ") || "nothing"}`);
  }

  console.log("\nNo coverage expected (informational):");
  for (const q of NO_COVERAGE) {
    const chunks = await retrieveReferenceChunks(admin as any, q, "almond", 4);
    console.log(`  ${q}\n      returned: ${chunks.map((k) => `${k.country} ${k.similarity.toFixed(2)}${k.keyword_hit ? " kw" : ""}`).join(" | ") || "nothing"}`);
  }

  console.log(`\n${passed}/${CASES.length} retrieval cases passed`);
  process.exit(passed === CASES.length ? 0 : 1);
}

main().catch((e) => {
  console.error("Retrieval test failed to run:", e);
  process.exit(1);
});
