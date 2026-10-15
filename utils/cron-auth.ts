import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'

/**
 * Checks a scheduled-job request against CRON_SECRET. Returns the response to
 * send back when the request is refused, or null when it may go ahead.
 *
 * The secret belongs in the Authorization header:
 *   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://www.rootloot.ai/api/cron/<job>
 * A URL ends up in proxy and access logs, so `?secret=` is accepted only
 * until the Coolify scheduled tasks have been switched to the header
 * (PROGRESS.md, 2026-10-15); then remove LEGACY_QUERY_SECRET.
 *
 * Fails closed: with no CRON_SECRET set, every request is refused, in
 * development too. A local .env.local points at the production database, so
 * an open dev server would run production jobs for anyone who can reach it.
 */
const LEGACY_QUERY_SECRET = true

export function rejectUnauthorizedCron(request: Request): NextResponse | null {
  const expected = process.env.CRON_SECRET
  if (!expected) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 })
  }

  // The auth scheme name is case-insensitive (RFC 7235).
  const match = /^bearer\s+(.+)$/i.exec(request.headers.get('authorization') ?? '')
  const fromHeader = match ? match[1] : ''
  const fromQuery = LEGACY_QUERY_SECRET ? new URL(request.url).searchParams.get('secret') ?? '' : ''

  if (secretsMatch(fromHeader, expected) || secretsMatch(fromQuery, expected)) return null
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

export function secretsMatch(given: string, expected: string): boolean {
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b)
}
