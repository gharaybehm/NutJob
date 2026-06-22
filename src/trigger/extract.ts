import { logger, task } from "@trigger.dev/sdk/v3";
import OpenAI from "openai";

// Initialize OpenAI SDK configured for OpenRouter
const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY || "",
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: {
    "HTTP-Referer": "https://rootloot.ai",
    "X-Title": "RootLoot Farm Management",
  },
});

interface ExtractSoilTestPayload {
  text?: string;
  imageBase64?: string;
  mimeType?: string;
}

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

export const extractSoilTestTask = task({
  id: "extract-soil-test",
  maxDuration: 300, // Stop executing after 300 secs (5 mins) of compute
  run: async (payload: ExtractSoilTestPayload) => {
    logger.log("Starting soil test result extraction task", {
      hasText: !!payload.text,
      hasImage: !!payload.imageBase64,
      mimeType: payload.mimeType,
    });

    const openRouterModel = "google/gemini-2.5-flash";
    logger.log(`Invoking OpenRouter model: ${openRouterModel}...`);

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
    logger.log("Received AI response from OpenRouter", { responseLength: raw.length });

    let parsed: Record<string, unknown> = {};
    try {
      let cleanRaw = raw.trim();
      if (cleanRaw.startsWith("```json")) {
        cleanRaw = cleanRaw.replace(/```json\s*/, "").replace(/\s*```$/, "");
      } else if (cleanRaw.startsWith("```")) {
        cleanRaw = cleanRaw.replace(/```\s*/, "").replace(/\s*```$/, "");
      }
      parsed = JSON.parse(cleanRaw) as Record<string, unknown>;
    } catch (e) {
      const err = e as Error;
      logger.error("Failed to parse AI JSON extraction", { raw, error: err.message });
      throw new Error(`AI returned unparseable output: ${err.message}`);
    }

    logger.log("AI Extraction completed successfully!", { extractedKeys: Object.keys(parsed) });
    return parsed;
  },
});
