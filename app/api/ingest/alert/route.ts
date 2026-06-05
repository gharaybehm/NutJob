import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { authenticateSensor, updateSensorHeartbeat } from '../_auth'
import type { AlertIngestPayload } from '@/types/sensors'

const VALID_DOMAINS = ['soil-water', 'phenology', 'nutrition', 'pest-disease', 'weather']
const VALID_SEVERITIES = ['info', 'warning', 'critical']

export async function POST(request: Request) {
  const { sensor, error: authError } = await authenticateSensor(request)
  if (!sensor) return NextResponse.json({ error: authError }, { status: 401 })

  let body: AlertIngestPayload
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.block_id || !body.domain || !body.message) {
    return NextResponse.json({ error: 'block_id, domain, and message are required' }, { status: 400 })
  }
  if (!VALID_DOMAINS.includes(body.domain)) {
    return NextResponse.json({ error: `domain must be one of: ${VALID_DOMAINS.join(', ')}` }, { status: 400 })
  }
  const severity = body.severity || 'info'
  if (!VALID_SEVERITIES.includes(severity)) {
    return NextResponse.json({ error: `severity must be one of: ${VALID_SEVERITIES.join(', ')}` }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error: insertError } = await (admin as any).from('block_alerts').insert({
    block_id: body.block_id,
    domain: body.domain,
    severity,
    message: body.message,
    source: 'sensor',
    resolved: false,
  })

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  // Fire push notification for warning/critical alerts (non-blocking)
  if (severity === 'warning' || severity === 'critical') {
    const { data: block } = await (admin as any)
      .from('blocks')
      .select('farm_id, name')
      .eq('id', body.block_id)
      .single()

    if (block?.farm_id) {
      import('@/utils/push').then(({ sendPushToFarm }) => {
        sendPushToFarm(block.farm_id, {
          title: severity === 'critical' ? 'Critical Farm Alert' : 'Farm Alert',
          body: body.message,
          url: `/${block.farm_id}/dashboard`,
          tag: `alert-${body.block_id}-${body.domain}`,
        }).catch((e: unknown) => console.error('[Push] Alert push failed:', e))
      })
    }
  }

  await updateSensorHeartbeat(sensor.id)
  return NextResponse.json({ ok: true })
}
