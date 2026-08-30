import webPush from 'web-push'
import { createAdminClient } from '@/utils/supabase/admin'

export interface PushPayload {
  title: string
  body: string
  icon?: string
  badge?: string
  url?: string
  tag?: string
}

// Configured on first send rather than at module load.
//
// This ran at module load and broke the container build: Next's "collect page
// data" step imports the routes that use this file (/api/push/subscribe,
// /api/push/unsubscribe, /api/ingest/alert), and the VAPID_* variables are
// runtime-only — VAPID_PRIVATE_KEY in particular must never be a build-time
// value, since that would bake it into an image layer. With the `!` assertions
// the undefined values reached web-push and it threw during the build.
let vapidReady = false

function ensureVapid(): boolean {
  if (vapidReady) return true
  const { VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env
  if (!VAPID_SUBJECT || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false
  webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
  vapidReady = true
  return true
}

type PushSubRow = {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

export async function sendPushToFarm(farmId: string, payload: PushPayload): Promise<void> {
  // Also configures VAPID on first call; returns false when keys are unset, in
  // which case push is simply disabled (same no-op behaviour as before).
  if (!ensureVapid()) return

  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: subs } = await (admin as any)
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('farm_id', farmId)

  if (!subs || subs.length === 0) return

  const notification = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon ?? '/icon.png',
    badge: payload.badge ?? '/icon.png',
    url: payload.url ?? '/',
    tag: payload.tag,
  })

  const staleIds: string[] = []

  await Promise.allSettled(
    (subs as PushSubRow[]).map(async (sub) => {
      try {
        await webPush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          notification
        )
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode
        if (status === 410 || status === 404) {
          staleIds.push(sub.id)
        }
      }
    })
  )

  if (staleIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any)
      .from('push_subscriptions')
      .delete()
      .in('id', staleIds)
  }
}
