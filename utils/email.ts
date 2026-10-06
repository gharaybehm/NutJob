import { Resend } from 'resend'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
const FROM = process.env.EMAIL_FROM || 'hello@rootloot.ai'

// Farm names, block names and sensor alert text are user-supplied, so they are
// escaped before going into the HTML body.
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export interface EmailPayload {
  to: string | string[]
  subject: string
  html: string
  text: string
}

export async function sendEmail(payload: EmailPayload): Promise<void> {
  if (!resend) return

  const { error } = await resend.emails.send({
    from: FROM,
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
  })

  if (error) throw new Error(error.message)
}

export async function sendInviteEmail(
  to: string,
  opts: { farmName: string; email: string; password: string; appUrl: string }
): Promise<void> {
  const { farmName, email, password, appUrl } = opts
  const text = `You've been added to the ${farmName} team on NutJob. Log in at ${appUrl} with:\nEmail: ${email}\nTemporary password: ${password}\nPlease log in and change your password.`
  const html = `<p>You've been added to the <strong>${escapeHtml(farmName)}</strong> team on NutJob.</p>
<p>Log in at <a href="${escapeHtml(appUrl)}">${escapeHtml(appUrl)}</a> with:</p>
<ul>
  <li>Email: ${escapeHtml(email)}</li>
  <li>Temporary password: ${escapeHtml(password)}</li>
</ul>
<p>Please log in and change your password.</p>`

  await sendEmail({ to, subject: `You've been added to ${farmName} on NutJob`, html, text })
}

export async function sendAlertEmail(
  to: string[],
  opts: { severity: 'warning' | 'critical'; message: string; farmId: string; blockName: string }
): Promise<void> {
  if (to.length === 0) return

  const { severity, message, farmId, blockName } = opts
  const label = severity === 'critical' ? 'Critical' : 'Warning'
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const url = `${appUrl}/${farmId}/dashboard`
  const text = `${label} Alert — ${blockName}\n\n${message}\n\nView farm: ${url}`
  const html = `<p><strong>${label} Alert — ${escapeHtml(blockName)}</strong></p>
<p>${escapeHtml(message)}</p>
<p><a href="${escapeHtml(url)}">View farm dashboard</a></p>`

  await sendEmail({ to, subject: `[NutJob] ${label} Alert — ${blockName}`, html, text })
}
