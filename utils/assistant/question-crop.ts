// On a farm with several crops and no pinned block, the guides can be searched
// only when the question itself names one of the farm's crops: searching
// without a crop filter would bring in another crop's material.

import { knowledgeBaseCrop } from "@/utils/crops";
import { fold } from "./source-rules";

// Arabic names are not in the crop profiles (utils/crops.ts covers English,
// Turkish and Spanish); the assistant answers in Arabic, so it reads these.
const ARABIC_CROP_NAMES: Record<string, string[]> = {
  almond: ["لوز", "اللوز"],
  apple: ["تفاح", "التفاح"],
  pistachio: ["فستق", "الفستق"],
  olive: ["زيتون", "الزيتون"],
  walnut: ["جوز", "الجوز"],
  cherry: ["كرز", "الكرز"],
  apricot: ["مشمش", "المشمش"],
  peach: ["خوخ", "الخوخ", "دراق", "الدراق"],
  grape: ["عنب", "العنب"],
  pomegranate: ["رمان", "الرمان"],
  fig: ["تين", "التين"],
  date: ["نخيل", "النخيل", "تمر", "التمر"],
};

/**
 * The farm crops (knowledge-base keys) the question names. A Turkish or
 * Spanish word with a suffix ("bademlerde") is read by its longest known stem.
 */
export function cropsNamedIn(question: string, farmCrops: string[]): string[] {
  const wanted = new Set(farmCrops);
  const found = new Set<string>();
  const words = fold(question).split(/[^\p{L}]+/u).filter(Boolean);

  for (const [crop, names] of Object.entries(ARABIC_CROP_NAMES)) {
    if (wanted.has(crop) && words.some((w) => names.includes(w) || names.some((n) => w.endsWith(n) && w.length <= n.length + 2))) found.add(crop);
  }
  const candidates = [...words, ...words.slice(1).map((w, i) => `${words[i]} ${w}`)];
  for (const word of candidates) {
    for (let len = word.length; len >= 4; len--) {
      const key = knowledgeBaseCrop(word.slice(0, len));
      if (key && wanted.has(key)) {
        found.add(key);
        break;
      }
    }
  }
  return [...found];
}
