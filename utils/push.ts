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

// Configured once at module load — this file is server-only.
webPush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

type PushSubRow = {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

export async function sendPushToFarm(farmId: string, payload: PushPayload): Promise<void> {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return

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
