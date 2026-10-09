/**
 * Reads a Crop Knowledge Pack from a directory of YAML files (spec §B4,
 * "packs are authored as plain files").
 *
 * Layout: one `<section>.yaml` per section and any number of test files
 * under `tests/`. The loader does not judge the content; `validatePack`
 * does. Server-side only (uses the file system).
 */

import { createHash } from 'crypto'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { parse } from 'yaml'
import { PACK_SECTIONS } from './schema'

export interface PackSource {
  /** Parsed YAML per section, not yet checked against the schema. */
  raw: Record<string, unknown>
  /** SHA-256 over the pack's files, as `sha256:<hex>`. */
  digest: string
  directory: string
}

interface PackFile {
  /** Path relative to the pack directory, with forward slashes. */
  path: string
  content: string
}

/**
 * Digest of a pack's content. Line endings are normalised and the manifest's
 * own `signature:` line is left out, so the digest can be stored there.
 */
export function packDigest(files: PackFile[]): string {
  const hash = createHash('sha256')
  for (const file of [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    let text = file.content.replace(/\r\n/g, '\n')
    if (file.path === 'manifest.yaml') {
      text = text
        .split('\n')
        .filter(line => !line.startsWith('signature:'))
        .join('\n')
    }
    hash.update(file.path).update('\0').update(text).update('\0')
  }
  return `sha256:${hash.digest('hex')}`
}

export function loadPackSource(directory: string): PackSource {
  if (!existsSync(directory)) throw new Error(`pack directory not found: ${directory}`)
  const files: PackFile[] = []
  const raw: Record<string, unknown> = {}

  for (const section of PACK_SECTIONS) {
    const path = `${section}.yaml`
    const full = join(directory, path)
    if (!existsSync(full)) continue
    const content = readFileSync(full, 'utf8')
    files.push({ path, content })
    raw[section] = parse(content)
  }

  const testsDir = join(directory, 'tests')
  const cases: unknown[] = []
  if (existsSync(testsDir)) {
    for (const name of readdirSync(testsDir).filter(n => n.endsWith('.yaml')).sort()) {
      const content = readFileSync(join(testsDir, name), 'utf8')
      files.push({ path: `tests/${name}`, content })
      const parsed = parse(content)
      if (Array.isArray(parsed)) cases.push(...parsed)
      else cases.push(parsed)
    }
  }
  raw.tests = cases

  return { raw, digest: packDigest(files), directory }
}
