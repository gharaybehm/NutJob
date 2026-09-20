/**
 * Page-aware chunking for knowledge-base ingestion. Pure, so it is testable
 * without a PDF or a database. Each chunk records the page it starts on so a
 * recommendation can cite "p. 84" (plan §13 page/section reference).
 */

export interface PageChunk {
  heading: string | null
  page: number
  content: string
}

export const CHUNK_CHARS = 3200 // ~800 tokens
export const CHUNK_OVERLAP = 600 // ~150 tokens

// A heading is a short label. Numbered *sentences* match the same "digit. Text"
// shape, so real headings must not end in a period. Handles English "Chapter 7",
// Spanish "Capítulo 7" and dotted numbering such as "3.1. Plagas".
const HEADING_RE =
  /^(?:(?:chapter|cap[ií]tulo)\s+\d+[:.]?\s+\p{L}[^.]{2,79}|\d+(?:\.\d+)*\.\s+\p{L}[^.]{3,79})$/iu

export function isHeading(line: string): boolean {
  return HEADING_RE.test(line.trim())
}

/**
 * `pages[0]` is page 1. Set `detectHeadings` false for documents whose numbered
 * lines are figure captions rather than section titles (the MAPA almond guide):
 * a wrong section label in a citation is worse than none, so those chunks are
 * cited by page only.
 */
export function chunkPages(
  pages: string[],
  size = CHUNK_CHARS,
  overlap = CHUNK_OVERLAP,
  detectHeadings = true,
): PageChunk[] {
  const chunks: PageChunk[] = []
  let buf = ''
  let bufPage = 1
  let bufHeading: string | null = null
  let heading: string | null = null

  const flush = () => {
    const content = buf.replace(/\s+/g, ' ').trim()
    if (content) chunks.push({ heading: bufHeading, page: bufPage, content })
    buf = ''
  }

  pages.forEach((pageText, i) => {
    const page = i + 1
    for (const raw of pageText.split('\n')) {
      const line = raw.trim()
      if (!line) continue
      if (detectHeadings && isHeading(line)) {
        flush()
        heading = line
        continue
      }
      if (!buf) {
        bufPage = page
        bufHeading = heading
      }
      buf += line + ' '
      while (buf.length >= size) {
        const head = buf.slice(0, size).replace(/\s+/g, ' ').trim()
        chunks.push({ heading: bufHeading, page: bufPage, content: head })
        buf = buf.slice(size - overlap)
        bufPage = page
      }
    }
  })
  flush()
  return chunks
}
