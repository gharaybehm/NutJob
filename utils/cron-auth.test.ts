import { afterEach, describe, expect, it, vi } from 'vitest'
import { rejectUnauthorizedCron, secretsMatch } from './cron-auth'

function request(opts: { auth?: string; query?: string } = {}) {
  const url = `https://app.example/api/cron/weather${opts.query !== undefined ? `?secret=${opts.query}` : ''}`
  return new Request(url, { headers: opts.auth ? { authorization: opts.auth } : {} })
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('rejectUnauthorizedCron', () => {
  it('accepts the secret as a bearer header', () => {
    vi.stubEnv('CRON_SECRET', 's3cret')
    expect(rejectUnauthorizedCron(request({ auth: 'Bearer s3cret' }))).toBeNull()
  })

  it('still accepts the old ?secret= while the scheduled tasks move to the header', () => {
    vi.stubEnv('CRON_SECRET', 's3cret')
    expect(rejectUnauthorizedCron(request({ query: 's3cret' }))).toBeNull()
  })

  it('refuses a wrong, partial, empty or missing secret', () => {
    vi.stubEnv('CRON_SECRET', 's3cret')
    for (const r of [
      request({ auth: 'Bearer wrong' }),
      request({ auth: 'Bearer s3cre' }),
      request({ auth: 's3cret' }),
      request({ query: '' }),
      request({ query: 'wrong' }),
      request(),
    ]) {
      expect(rejectUnauthorizedCron(r)?.status).toBe(401)
    }
  })

  it('accepts the scheme name in any case', () => {
    vi.stubEnv('CRON_SECRET', 's3cret')
    expect(rejectUnauthorizedCron(request({ auth: 'bearer s3cret' }))).toBeNull()
    expect(rejectUnauthorizedCron(request({ auth: 'BEARER s3cret' }))).toBeNull()
  })

  it('fails closed when no secret is configured, in development too', () => {
    vi.stubEnv('CRON_SECRET', '')
    for (const env of ['production', 'development']) {
      vi.stubEnv('NODE_ENV', env)
      expect(rejectUnauthorizedCron(request({ auth: 'Bearer anything' }))?.status).toBe(503)
    }
  })
})

describe('secretsMatch', () => {
  it('compares exactly and never matches an empty value', () => {
    expect(secretsMatch('abc', 'abc')).toBe(true)
    expect(secretsMatch('abc', 'abd')).toBe(false)
    expect(secretsMatch('', '')).toBe(false)
  })
})
