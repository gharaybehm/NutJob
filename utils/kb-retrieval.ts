/**
 * Retrieval helpers for the knowledge base: bilingual query expansion and
 * result selection. Pure (no DB, no network) so they are unit-testable.
 *
 * Why: the corpus is Spanish (MAPA) and Californian (UC) but blocks and alerts
 * are described in English. Embeddings alone are weak on Latin pest names and
 * favour same-language text, so a query is expanded with the Spanish/Latin
 * terms for embedding, and the specific names are also passed as keywords for
 * an exact-match search (see match_knowledge_base_hybrid).
 */

interface GlossaryEntry {
  /** Triggers on English terms or the Latin name in the query. */
  match: RegExp
  /** Specific, rare words. Used for exact keyword search, so they must not be generic. */
  keywords: string[]
  /** Extra Spanish words that help the embedding, but are too generic for keyword search. */
  embedTerms: string[]
}

// Spanish common names are from the MAPA almond guide's usage and should be
// reviewed by the agronomist. Add entries as the corpus grows.
export const PEST_GLOSSARY: GlossaryEntry[] = [
  { match: /blossom blight|brown rot|monilinia|monilia/i, keywords: ['monilinia', 'monilia'], embedTerms: ['podredumbre de la flor', 'floración'] },
  { match: /seed wasp|eurytoma/i, keywords: ['eurytoma', 'avispilla'], embedTerms: ['almendra', 'larva'] },
  { match: /flat-?headed borer|capnodis|root borer/i, keywords: ['capnodis', 'cabezudo'], embedTerms: ['barrenador', 'raíces'] },
  { match: /red leaf blotch|polystigma/i, keywords: ['polystigma'], embedTerms: ['mancha ocre', 'hojas'] },
  { match: /phomopsis|fusicoccum|constriction canker/i, keywords: ['phomopsis', 'fusicoccum'], embedTerms: ['chancro', 'ramas'] },
  { match: /anarsia|peach twig borer/i, keywords: ['anarsia'], embedTerms: ['polilla', 'brotes'] },
  { match: /shot ?hole/i, keywords: ['cribado', 'perdigonada'], embedTerms: ['hojas', 'hongo'] },
  { match: /agrobacterium|crown gall/i, keywords: ['agrobacterium'], embedTerms: ['tumores', 'raíz'] },
  { match: /armillaria|root rot/i, keywords: ['armillaria'], embedTerms: ['podredumbre de raíces'] },
  { match: /aphid/i, keywords: ['pulgón', 'pulgones'], embedTerms: ['colonias', 'hojas'] },
  { match: /\bmites?\b|spider mite/i, keywords: ['ácaro', 'ácaros'], embedTerms: ['araña roja'] },
  { match: /nematode/i, keywords: ['nematodos'], embedTerms: ['raíces'] },
  { match: /\bfrost\b|\bfreez(?:e|ing)\b|helada/i, keywords: ['frost', 'helada', 'heladas'], embedTerms: ['floración', 'temperaturas mínimas'] },
]

export interface ExpandedQuery {
  /** Text to embed: the original plus Spanish terms. */
  embeddingText: string
  /** Lowercase single words for exact keyword search. */
  keywords: string[]
}

export function expandQuery(text: string): ExpandedQuery {
  const keywords = new Set<string>()
  const embedTerms = new Set<string>()
  for (const entry of PEST_GLOSSARY) {
    if (!entry.match.test(text)) continue
    entry.keywords.forEach(k => {
      keywords.add(k)
      embedTerms.add(k)
    })
    entry.embedTerms.forEach(t => embedTerms.add(t))
  }
  // A Latin genus written in the text (e.g. an alert message) is itself a good keyword.
  for (const m of text.matchAll(/\b([A-Z][a-z]{6,})\b/g)) {
    const w = m[1].toLowerCase()
    if (/^[a-z]+$/.test(w)) keywords.add(w)
  }
  const embeddingText = embedTerms.size > 0 ? `${text} (${[...embedTerms].join(', ')})` : text
  // Keywords go into a tsquery: allow letters only, so nothing can break the query.
  const safe = [...keywords].filter(k => /^[\p{L}]+$/u.test(k))
  return { embeddingText, keywords: safe }
}

export interface ScoredChunk {
  similarity: number
  keyword_hit?: boolean | null
  rrf_score?: number | null
  country?: string | null
}

/**
 * Picks the final chunks from candidates already sorted by fused score.
 * - A chunk is relevant if it matched a keyword or its similarity clears the bar.
 * - When the query named something specific (`hasKeywords`), a vector-only match
 *   must clear a higher bar: if the corpus has the topic, keyword search finds
 *   it, so a weak vector-only match is more likely noise (the guide has nothing
 *   on frost, yet frost queries scored ~0.58 against unrelated Spanish text).
 * - Each country present gets at least one slot, so English UC text cannot
 *   crowd out the Spanish guide (or the reverse).
 */
export const VECTOR_ONLY_MARGIN = 0.1

export function selectChunks<T extends ScoredChunk>(
  rows: T[],
  k: number,
  minSimilarity: number,
  hasKeywords = false,
): T[] {
  const vectorOnlyBar = hasKeywords ? minSimilarity + VECTOR_ONLY_MARGIN : minSimilarity
  const relevant = rows.filter(r => r.keyword_hit || r.similarity >= vectorOnlyBar)
  const chosen: T[] = []
  const seen = new Set<string>()
  for (const r of relevant) {
    const key = r.country ?? 'none'
    if (chosen.length < k && !seen.has(key)) {
      chosen.push(r)
      seen.add(key)
    }
  }
  for (const r of relevant) {
    if (chosen.length >= k) break
    if (!chosen.includes(r)) chosen.push(r)
  }
  return chosen.sort((a, b) => (b.rrf_score ?? b.similarity) - (a.rrf_score ?? a.similarity))
}
