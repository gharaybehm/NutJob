import { describe, expect, it } from 'vitest'
import { escapeHtml } from './email'

describe('escapeHtml', () => {
  it('leaves plain text alone', () => {
    expect(escapeHtml('Block 4 — soil moisture below 18%')).toBe('Block 4 — soil moisture below 18%')
  })

  it('neutralises markup in a farm name or alert message', () => {
    expect(escapeHtml('<a href="https://evil.example">Reset your password</a>'))
      .toBe('&lt;a href=&quot;https://evil.example&quot;&gt;Reset your password&lt;/a&gt;')
  })

  it('escapes ampersands first so entities are not double-decoded', () => {
    expect(escapeHtml(`Tom & Jerry's <b>`)).toBe('Tom &amp; Jerry&#39;s &lt;b&gt;')
  })
})
