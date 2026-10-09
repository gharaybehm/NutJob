/**
 * Pack validation, run on install and on update (spec §B3, V1-V7).
 *
 *   V1  manifest and signature; the pack must not need a newer platform
 *   V2  every $parameter referenced exists, with bounds and evidence
 *   V3  every evidence citation resolves in the evidence register
 *   V4  units are declared for every model and parameter
 *   V5  every phase referenced exists in the phenology phase mapping
 *   V6  the pack's own test suite passes and covers its tables and models
 *   V7  report parameters still to be sourced or estimated; an engine that
 *       depends on a value still to be sourced cannot be switched to Live
 */

import { tableReferences } from '../rules/table'
import { packTables } from './context'
import { runPackTests, type PackTestResult } from './run-pack-tests'
import { ENGINE_IDS, packSchema, PLATFORM_VERSION, SECTION_ENGINE, type EngineId, type Pack } from './schema'

export type ValidationCode = 'SCHEMA' | 'V1' | 'V2' | 'V3' | 'V4' | 'V5' | 'V6' | 'V7'

export interface ValidationIssue {
  code: ValidationCode
  message: string
}

export interface ParameterReportLine {
  id: string
  unit: string
  note: string | null
  /** Engines that read this parameter. */
  engines: EngineId[]
}

export interface EngineReadiness {
  /** False when the pack has no content for the engine: it is inactive for this crop (R1.3). */
  hasContent: boolean
  /** Parameters still to be sourced that keep the engine in Shadow (V7). */
  liveBlockedBy: string[]
  /** Models, templates or tables for this engine that the pack lists as not written yet. */
  pendingContent: number
}

export interface PackValidationReport {
  packId: string | null
  version: string | null
  ok: boolean
  errors: ValidationIssue[]
  warnings: ValidationIssue[]
  toBeSourced: ParameterReportLine[]
  expertEstimates: ParameterReportLine[]
  /** Models, templates and tables the pack lists as not written yet. */
  pendingContent: { section: string; item: string; note: string | null }[]
  /** Notes left for the agronomist on values that need confirming. */
  reviewNotes: { where: string; note: string }[]
  engines: Record<EngineId, EngineReadiness>
  tests: PackTestResult[]
  /** The parsed pack; null when it does not match the schema. */
  pack: Pack | null
}

export interface ValidateOptions {
  /** Digest of the files the pack was loaded from; checked against the manifest signature. */
  digest?: string
  platformVersion?: string
}

const PARAM_REF = /\$([A-Za-z_][A-Za-z0-9_]*)/g

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i]
  return 0
}

/** Visits every value in a section with the path that leads to it. */
function walk(value: unknown, path: string, visit: (key: string, value: unknown, path: string) => void): void {
  if (Array.isArray(value)) {
    value.forEach((item, i) => {
      const named = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
      const id = String(named.id ?? named.nutrient ?? named.ion ?? i)
      walk(item, `${path}[${id}]`, visit)
    })
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      visit(key, child, `${path}.${key}`)
      walk(child, `${path}.${key}`, visit)
    }
  }
}

function emptyEngines(): Record<EngineId, EngineReadiness> {
  return Object.fromEntries(ENGINE_IDS.map(id => [id, { hasContent: false, liveBlockedBy: [], pendingContent: 0 }])) as unknown as Record<EngineId, EngineReadiness>
}

/** The sections of a pack with the engine each one feeds. */
function engineSections(pack: Pack): { where: string; engine: EngineId | null; content: unknown }[] {
  const out: { where: string; engine: EngineId | null; content: unknown }[] = []
  for (const [section, content] of Object.entries(pack)) {
    if (content === undefined || ['manifest', 'parameters', 'evidence', 'tests', 'metrics'].includes(section)) continue
    if (section === 'seasonal') {
      for (const [engine, template] of Object.entries(content as Record<string, unknown>)) {
        out.push({ where: `seasonal.${engine}`, engine: engine as EngineId, content: template })
      }
    } else {
      out.push({ where: section, engine: SECTION_ENGINE[section as keyof Pack] ?? null, content })
    }
  }
  return out
}

export function validatePack(raw: unknown, options: ValidateOptions = {}): PackValidationReport {
  const errors: ValidationIssue[] = []
  const warnings: ValidationIssue[] = []
  const report: PackValidationReport = {
    packId: null,
    version: null,
    ok: false,
    errors,
    warnings,
    toBeSourced: [],
    expertEstimates: [],
    pendingContent: [],
    reviewNotes: [],
    engines: emptyEngines(),
    tests: [],
    pack: null,
  }

  const parsed = packSchema.safeParse(raw)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issue.path.join('.')
      const last = String(issue.path[issue.path.length - 1] ?? '')
      const code: ValidationCode = last === 'unit' || last === 'units' ? 'V4' : path.startsWith('manifest') ? 'V1' : 'SCHEMA'
      errors.push({ code, message: `${path || 'pack'}: ${issue.message}` })
    }
    return report
  }
  const pack = parsed.data
  report.pack = pack
  report.packId = pack.manifest.id
  report.version = pack.manifest.version

  // V1: manifest and signature.
  const platformVersion = options.platformVersion ?? PLATFORM_VERSION
  if (compareVersions(pack.manifest.min_platform_version, platformVersion) > 0) {
    errors.push({ code: 'V1', message: `needs platform ${pack.manifest.min_platform_version}; this is ${platformVersion}` })
  }
  if (options.digest !== undefined && pack.manifest.signature !== options.digest) {
    errors.push({ code: 'V1', message: `signature does not match the pack files (manifest ${pack.manifest.signature}, files ${options.digest})` })
  }

  // Parameters: definitions.
  const definitions = new Map<string, Pack['parameters']['parameters'][number]>()
  for (const p of pack.parameters.parameters) {
    if (definitions.has(p.id)) errors.push({ code: 'V2', message: `parameter "${p.id}" is defined twice` })
    definitions.set(p.id, p)
    if (p.status === 'to be sourced') {
      if (p.start !== null) warnings.push({ code: 'V7', message: `parameter "${p.id}" has a value but is still marked to be sourced` })
    } else {
      if (p.start === null) errors.push({ code: 'V2', message: `parameter "${p.id}" is ${p.status} but has no start value` })
      if (!p.bounds) errors.push({ code: 'V2', message: `parameter "${p.id}" has no bounds` })
      if (!p.evidence) errors.push({ code: 'V2', message: `parameter "${p.id}" has no evidence` })
    }
    if (p.bounds) {
      if (p.bounds[0] > p.bounds[1]) errors.push({ code: 'V2', message: `parameter "${p.id}" has bounds in the wrong order` })
      else if (p.start !== null && (p.start < p.bounds[0] || p.start > p.bounds[1])) {
        errors.push({ code: 'V2', message: `parameter "${p.id}" starts at ${p.start}, outside its bounds ${p.bounds[0]} to ${p.bounds[1]}` })
      }
    }
    if (p.evidence && !(p.evidence in pack.evidence.evidence)) {
      errors.push({ code: 'V3', message: `parameter "${p.id}" cites "${p.evidence}", which is not in the evidence register` })
    }
    if (p.review) report.reviewNotes.push({ where: `parameter ${p.id}`, note: p.review })
  }

  const phases = new Set(pack.phenology.phases.map(p => p.id))
  const usedBy = new Map<string, Set<EngineId>>()
  const referenced = new Set<string>()

  // Sections: parameter references (V2), evidence (V3), phases (V5), notes.
  for (const { where, engine, content } of engineSections(pack)) {
    if (engine) report.engines[engine].hasContent = true
    walk(content, where, (key, value, path) => {
      if (typeof value === 'string') {
        if (key !== 'review' && key !== 'note' && key !== 'notes') {
          for (const match of value.matchAll(PARAM_REF)) {
            const id = match[1]
            referenced.add(id)
            if (!definitions.has(id)) errors.push({ code: 'V2', message: `${path} refers to $${id}, which is not in the parameters section` })
            else if (engine) usedBy.set(id, (usedBy.get(id) ?? new Set()).add(engine))
          }
        }
        if (key === 'evidence' && !(value in pack.evidence.evidence)) {
          errors.push({ code: 'V3', message: `${path} cites "${value}", which is not in the evidence register` })
        }
        if (key === 'review') report.reviewNotes.push({ where: path.replace(/\.review$/, ''), note: value })
        if (key === 'phase' && !path.includes('.decision_table.') && !phases.has(value)) {
          errors.push({ code: 'V5', message: `${path} refers to phase "${value}", which is not in the phenology phase mapping` })
        }
      }
      if ((key === 'phases' || key.endsWith('_phases')) && Array.isArray(value) && path !== 'phenology.phases') {
        for (const phase of value) {
          if (typeof phase === 'string' && !phases.has(phase)) {
            errors.push({ code: 'V5', message: `${path} refers to phase "${phase}", which is not in the phenology phase mapping` })
          }
        }
      }
      if (key === 'to_be_sourced' && Array.isArray(value)) {
        for (const item of value as { item: string; note?: string }[]) {
          report.pendingContent.push({ section: path.replace(/\.to_be_sourced$/, ''), item: item.item, note: item.note ?? null })
          if (engine) report.engines[engine].pendingContent += 1
        }
      }
    })
  }

  // Decision tables: expressions parse, phases exist.
  const tables = packTables(pack)
  for (const table of Object.values(tables)) {
    const refs = tableReferences(table)
    for (const message of refs.errors) errors.push({ code: 'SCHEMA', message })
    for (const phase of refs.phases) {
      if (!phases.has(phase)) errors.push({ code: 'V5', message: `table ${table.table} refers to phase "${phase}", which is not in the phenology phase mapping` })
    }
    const ids = new Set<string>()
    for (const row of table.rows) {
      if (ids.has(row.id)) errors.push({ code: 'SCHEMA', message: `table ${table.table} has two rows with id "${row.id}"` })
      ids.add(row.id)
    }
  }

  for (const id of definitions.keys()) {
    if (!referenced.has(id)) warnings.push({ code: 'V2', message: `parameter "${id}" is defined but never used` })
  }

  // V6: the pack's own tests, and their coverage of tables and models.
  report.tests = runPackTests(pack)
  for (const t of report.tests) {
    if (!t.passed) errors.push({ code: 'V6', message: `pack test "${t.id}" failed: ${t.message}` })
  }
  const covered = new Set(report.tests.map(t => t.target))
  const expected = [
    ...Object.keys(tables).map(id => `table:${id}`),
    ...(pack.pests?.pests ?? []).map(p => `degree_days:${p.id}`),
    ...(pack.diseases?.diseases ?? []).filter(d => d.type === 'infection_value').map(d => `infection:${d.id}`),
  ]
  for (const target of expected) {
    if (!covered.has(target)) errors.push({ code: 'V6', message: `the pack test suite has no case for ${target.replace(':', ' "')}"` })
  }
  for (const [id, table] of Object.entries(tables)) {
    const tested = new Set(
      (pack.tests as Record<string, unknown>[])
        .filter(c => c.kind === 'table' && c.table === id)
        .map(c => (c.expect as { row?: unknown } | undefined)?.row),
    )
    const untested = table.rows.filter(row => !tested.has(row.id)).map(row => row.id)
    if (tested.size > 0 && untested.length > 0) {
      warnings.push({ code: 'V6', message: `table "${id}" has no test case for ${untested.join(', ')}` })
    }
  }

  // V7: what is still to be sourced, and which engines that keeps in Shadow.
  for (const p of pack.parameters.parameters) {
    if (p.status === 'sourced') continue
    const engines = [...(usedBy.get(p.id) ?? [])]
    const line = { id: p.id, unit: p.unit, note: p.note ?? null, engines }
    if (p.status === 'to be sourced') {
      report.toBeSourced.push(line)
      for (const engine of engines) report.engines[engine].liveBlockedBy.push(p.id)
    } else {
      report.expertEstimates.push(line)
    }
  }

  report.ok = errors.length === 0
  return report
}

/** A plain-text rendering of the report for the command line. */
export function formatValidationReport(r: PackValidationReport): string {
  const lines: string[] = []
  lines.push(`Pack ${r.packId ?? '(unreadable)'} ${r.version ?? ''}: ${r.ok ? 'VALID' : 'INVALID'}`)
  if (r.pack) {
    lines.push(`Valid for: ${r.pack.manifest.regions.join('; ')}`)
    if (r.pack.manifest.region_notes) lines.push(`Region note: ${r.pack.manifest.region_notes}`)
  }
  const section = (title: string, rows: string[]) => {
    if (rows.length === 0) return
    lines.push('', `${title} (${rows.length})`)
    for (const row of rows) lines.push(`  ${row}`)
  }
  section('Errors', r.errors.map(e => `[${e.code}] ${e.message}`))
  section('Warnings', r.warnings.map(w => `[${w.code}] ${w.message}`))
  const passed = r.tests.filter(t => t.passed).length
  if (r.tests.length > 0) lines.push('', `Pack tests: ${passed} of ${r.tests.length} passed`)
  section(
    'Engines',
    ENGINE_IDS.map(id => {
      const e = r.engines[id]
      if (!e.hasContent) return `${id}: inactive, the pack has no content for it`
      const pending = e.pendingContent > 0 ? `; ${e.pendingContent} content item(s) not written yet` : ''
      if (e.liveBlockedBy.length > 0) return `${id}: Shadow only, waiting for ${e.liveBlockedBy.length} value(s): ${e.liveBlockedBy.join(', ')}${pending}`
      return `${id}: no values missing${pending}`
    }),
  )
  const paramLine = (p: ParameterReportLine) =>
    `${p.id} [${p.unit}]${p.engines.length ? ` (${p.engines.join(', ')})` : ''}${p.note ? `: ${p.note}` : ''}`
  section('Parameters to be sourced', r.toBeSourced.map(paramLine))
  section('Expert estimates', r.expertEstimates.map(paramLine))
  section('Content not written yet', r.pendingContent.map(p => `${p.section}: ${p.item}${p.note ? ` (${p.note})` : ''}`))
  section('For agronomist review', r.reviewNotes.map(n => `${n.where}: ${n.note}`))
  return lines.join('\n')
}
