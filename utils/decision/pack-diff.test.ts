import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { demoPackRaw } from '@/engines/decision/__fixtures__/demo-pack'
import { newerVersion, packDiff } from '@/engines/pack/diff'
import { loadPackSource } from '@/engines/pack/load'
import { packSchema } from '@/engines/pack/schema'

const demo = (change?: (raw: ReturnType<typeof demoPackRaw>) => void, version = '1.0.0') => {
  const raw = demoPackRaw()
  raw.manifest.version = version
  change?.(raw)
  return packSchema.parse(raw)
}

describe('packDiff', () => {
  it('finds nothing between a pack and itself under a new version number', () => {
    const d = packDiff(demo(), demo(undefined, '1.0.1'))
    expect(d).toMatchObject({ packId: 'demo', fromVersion: '1.0.0', toVersion: '1.0.1', identical: true, sections: [], tables: [] })
  })

  it('reports a changed start value, bounds and status of a parameter', () => {
    const d = packDiff(
      demo(),
      demo(raw => {
        const p = raw.parameters.parameters.find(x => x.id === 'p')!
        p.start = 0.45
        p.bounds = [0.3, 0.6]
      }, '1.1.0'),
    )
    expect(d.parameters.changed).toEqual([
      { id: 'p', field: 'start', from: '0.5', to: '0.45' },
      { id: 'p', field: 'bounds', from: '[0.3,0.7]', to: '[0.3,0.6]' },
    ])
    expect(d.identical).toBe(false)
  })

  it('reports parameters added and removed', () => {
    const d = packDiff(
      demo(),
      demo(raw => {
        raw.parameters.parameters = raw.parameters.parameters.filter(x => x.id !== 'ripe_at')
        raw.parameters.parameters.push({ id: 'new_value', start: 1, unit: 'x', bounds: [1, 1], status: 'sourced', evidence: 'SRC' })
      }, '1.1.0'),
    )
    expect(d.parameters.added).toEqual(['new_value'])
    expect(d.parameters.removed).toEqual(['ripe_at'])
  })

  it('reports rows added, removed and changed in a decision table, and a change of order', () => {
    const d = packDiff(
      demo(),
      demo(raw => {
        const rows = raw.water.decision_table.rows
        ;(rows[1] as { then: unknown }).then = { action: 'defer', note: 'Changed note' }
        rows.splice(2, 1)
        ;(rows as unknown[]).push({ id: 'D-9', when: {}, then: { action: 'hold' } })
      }, '1.1.0'),
    )
    expect(d.tables).toEqual([{ table: 'irrigation', rowsAdded: ['D-9'], rowsRemoved: ['D-2'], rowsChanged: ['D-1'] }])
    expect(d.sections).toContain('water')

    const reordered = packDiff(demo(), demo(raw => raw.water.decision_table.rows.reverse(), '1.1.0'))
    expect(reordered.tables).toEqual([{ table: 'irrigation', rowsAdded: [], rowsRemoved: [], rowsChanged: ['(order of rows)'] }])
  })

  it('names every section whose content differs', () => {
    const d = packDiff(demo(), demo(raw => (raw.frost.duration_basis = 'One hour'), '1.1.0'))
    expect(d.sections).toEqual(['frost'])
  })

  it('shows what almond 0.1.1 changes against the version installed in production', () => {
    const load = (v: string) => packSchema.parse(loadPackSource(join(__dirname, '../../packs/almond', v)).raw)
    const d = packDiff(load('0.1.0'), load('0.1.1'))
    expect(d.sections).toEqual(['seasonal'])
    expect(d.parameters).toEqual({ added: [], removed: [], changed: [] })
    expect(d.tables).toEqual([])
    expect(d.identical).toBe(false)
  })
})

describe('newerVersion', () => {
  it('compares versions number by number', () => {
    expect(newerVersion('0.1.1', '0.1.0')).toBe(true)
    expect(newerVersion('0.10.0', '0.9.9')).toBe(true)
    expect(newerVersion('1.0.0', '1.0.0')).toBe(false)
    expect(newerVersion('0.1.0', '0.1.1')).toBe(false)
  })
})
