import { describe, expect, it } from 'vitest'
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server'
import { config } from './proxy'

const runs = (url: string) => unstable_doesMiddlewareMatch({ config, url })

describe('proxy matcher', () => {
  it('skips the public files, so a visitor who is not signed in can fetch them', () => {
    for (const url of ['/sw.js', '/manifest.json', '/favicon.ico', '/icon.png', '/logo-full.png', '/farm-bg.png', '/photo.webp']) {
      expect(runs(url), url).toBe(false)
    }
  })

  it('still runs on pages and on paths that only start like a public file', () => {
    for (const url of ['/', '/farms', '/login', '/abc/dashboard', '/sw.js/anything', '/sw.jsx', '/swXjs', '/manifest.json.bak', '/api/cron/weather']) {
      expect(runs(url), url).toBe(true)
    }
  })
})
