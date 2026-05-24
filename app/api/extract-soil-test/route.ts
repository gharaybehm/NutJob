import { NextRequest, NextResponse } from 'next/server';
import { tasks, runs } from "@trigger.dev/sdk/v3";
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';

// Initialize OpenAI SDK configured for OpenRouter
const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY || "",
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: {
    "HTTP-Referer": "https://nutjob.farm",
    "X-Title": "NutJob Farm Management",
  },
});

const systemPrompt = `You are an expert soil scientist and agronomist. Your task is to extract soil and water test result parameters from the provided lab analysis report (which may be in Turkish, English, or another language, and can be text or an image/scan).

Extract the following parameters and return them as a valid JSON object matching the schema below. If a parameter is not present or cannot be found in the document, use null. Do not guess or make up numbers.

Parameters to extract:
1. labReference (string): The report or sample number, report reference (e.g. SA250023, Rapor No, Test No, etc.)
2. recordedAt (string, YYYY-MM-DD): The test, sampling, or receipt date (e.g. Numunenin kabul tarihi, Tarih, Date).
3. ph (number): Soil pH (usually 1:2.5 dilution or similar, a value between 0 and 14).
4. soilEc (number): Soil Electrical Conductivity (EC) in mS/cm or dS/m (e.g. İletkenlik, EC, etc.).
5. waterEc (number): Water Electrical Conductivity (EC) in µS/cm (or converted to µS/cm if in mS/cm, 1 mS/cm = 1000 µS/cm).
6. organicMatter (number): Organic Matter percentage (%).
7. phosphorus (number): Phosphorus (P2O5) value (typically in kg/da, ppm, or mg/kg).
8. potassium (number): Potassium (K2O) value (typically in kg/da, ppm, or mg/kg).
9. lime (number): Lime (CaCO3) percentage (%).
10. cec (number): Cation Exchange Capacity (CEC) in meq/100g.
11. calcium (number): Calcium (Ca) in ppm.
12. magnesium (number): Magnesium (Mg) in ppm.
13. sodium (number): Sodium (Na) in ppm.
14. iron (number): Iron (Fe) in ppm.
15. zinc (number): Zinc (Zn) in ppm.
16. copper (number): Copper (Cu) in ppm.
17. manganese (number): Manganese (Mn) in ppm.
18. boron (number): Boron (B) in mg/kg or ppm.
19. sand (number): Sand percentage (%).
20. clay (number): Clay percentage (%).
21. silt (number): Silt percentage (%).
22. textureClass (string): The soil texture class. MUST be mapped to one of these exact values: "Loam", "Clay", "Sandy", "Silty", "Peaty", "Chalky" (or null if not found/cannot map).

Return ONLY a valid JSON object matching this structure:
{
  "labReference": string | null,
  "recordedAt": string | null,
  "ph": number | null,
  "soilEc": number | null,
  "waterEc": number | null,
  "organicMatter": number | null,
  "phosphorus": number | null,
  "potassium": number | null,
  "lime": number | null,
  "cec": number | null,
  "calcium": number | null,
  "magnesium": number | null,
  "sodium": number | null,
  "iron": number | null,
  "zinc": number | null,
  "copper": number | null,
  "manganese": number | null,
  "boron": number | null,
  "sand": number | null,
  "clay": number | null,
  "silt": number | null,
  "textureClass": "Loam" | "Clay" | "Sandy" | "Silty" | "Peaty" | "Chalky" | null
}`;

// Import from the lib sub-path to skip pdf-parse's top-level test-file require()
// that causes bundler errors in Next.js/Turbopack environments.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (data: Buffer) => Promise<{ text: string }>;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());

    let payload: { text?: string; imageBase64?: string; mimeType?: string } = {};

    if (file.type === 'application/pdf') {
      const { text } = await pdfParse(buffer);
      payload = { text };
    } else if (file.type.startsWith('image/')) {
      const imageBase64 = buffer.toString('base64');
      payload = { imageBase64, mimeType: file.type };
    } else {
      return NextResponse.json({
        error: 'Unsupported file type. Please upload a PDF or an image file (PNG, JPEG, etc.).'
      }, { status: 400 });
    }

    let extracted: Record<string, unknown> = {};
    let success = false;

    // Method 1: Direct LLM Call (fast, reliable, and self-contained for local testing)
    try {
      console.log('[extract-soil-test] Attempting direct LLM extraction via OpenRouter...');
      const openRouterModel = "google/gemini-2.5-flash";
      
      let content: string | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      > = "";
      
      if (payload.imageBase64 && payload.mimeType) {
        content = [
          { type: "text", text: "Please extract the soil/water test parameters from this image of the lab report." },
          {
            type: "image_url",
            image_url: {
              url: `data:${payload.mimeType};base64,${payload.imageBase64}`,
            },
          },
        ];
      } else if (payload.text) {
        content = `Please extract the soil/water test parameters from this raw text content of the lab report PDF:\n\n${payload.text}`;
      } else {
        throw new Error("Missing content: neither text nor imageBase64 was provided.");
      }

      const response = await openrouter.chat.completions.create({
        model: openRouterModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content },
        ],
        response_format: { type: "json_object" },
      });

      const raw = response.choices[0].message.content || "{}";
      let cleanRaw = raw.trim();
      if (cleanRaw.startsWith("```json")) {
        cleanRaw = cleanRaw.replace(/```json\s*/, "").replace(/\s*```$/, "");
      } else if (cleanRaw.startsWith("```")) {
        cleanRaw = cleanRaw.replace(/```\s*/, "").replace(/\s*```$/, "");
      }
      
      extracted = JSON.parse(cleanRaw) as Record<string, unknown>;
      success = true;
      console.log('[extract-soil-test] Direct LLM extraction completed successfully.');
    } catch (directErr) {
      const err = directErr as Error;
      console.warn('[extract-soil-test] Direct LLM extraction failed, attempting Trigger.dev fallback:', err.message);
      
      // Method 2: Trigger.dev Fallback (when configured)
      if (process.env.TRIGGER_SECRET_KEY) {
        try {
          console.log('[extract-soil-test] Triggering task on Trigger.dev...');
          const handle = await tasks.trigger("extract-soil-test", payload);
          const run = await runs.poll(handle.id);
          
          if (run.status === "COMPLETED") {
            extracted = run.output as Record<string, unknown>;
            success = true;
          } else {
            console.error('[extract-soil-test] Trigger.dev task failed:', run.status, run.error);
          }
        } catch (triggerErr) {
          console.error('[extract-soil-test] Trigger.dev execution failed:', triggerErr);
        }
      } else {
        console.warn('[extract-soil-test] TRIGGER_SECRET_KEY is not defined; skipping Trigger.dev fallback.');
      }
    }

    if (success) {
      // Count how many non-null properties are returned
      const count = Object.values(extracted).filter(v => v != null).length;
      return NextResponse.json({ extracted, count });
    } else {
      console.error('[extract-soil-test] Extraction could not be performed by any method.');
      return NextResponse.json({
        extracted: {},
        message: "AI extraction could not read this file. Please fill in details manually."
      });
    }

  } catch (err) {
    const error = err as Error;
    console.error('[extract-soil-test] Unexpected error:', error);
    
    const logDir = 'C:/Users/mhrg7/.gemini/antigravity-ide/brain/5db26700-b878-468f-91e4-ea9f714f9a3e/scratch';
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    fs.writeFileSync(
      path.join(logDir, 'error.log'),
      `Unexpected error: ${error.message}\nStack: ${error.stack}`
    );
    
    return NextResponse.json({
      extracted: {},
      message: 'Could not read this file — please fill in manually.'
    });
  }
}
