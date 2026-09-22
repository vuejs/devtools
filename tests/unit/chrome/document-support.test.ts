import { describe, expect, it } from 'vitest'
import { isSupportedDevtoolsDocument } from '../../../packages/chrome/src/shared/document'

describe('Chrome supported document detection', () => {
  it('accepts HTML documents', () => {
    expect(isSupportedDevtoolsDocument({ contentType: 'text/html' })).toBe(true)
    expect(isSupportedDevtoolsDocument({ contentType: 'application/xhtml+xml' })).toBe(true)
  })

  it('rejects XML, feed and viewer documents so the backend never alters them', () => {
    expect(isSupportedDevtoolsDocument({ contentType: 'text/xml' })).toBe(false)
    expect(isSupportedDevtoolsDocument({ contentType: 'application/xml' })).toBe(false)
    expect(isSupportedDevtoolsDocument({ contentType: 'application/rss+xml' })).toBe(false)
    expect(isSupportedDevtoolsDocument({ contentType: 'application/pdf' })).toBe(false)
    expect(isSupportedDevtoolsDocument({ contentType: 'image/svg+xml' })).toBe(false)
    expect(isSupportedDevtoolsDocument({ contentType: 'text/plain' })).toBe(false)
  })

  it('rejects missing documents and unknown content types', () => {
    expect(isSupportedDevtoolsDocument(undefined)).toBe(false)
    expect(isSupportedDevtoolsDocument(null)).toBe(false)
    expect(isSupportedDevtoolsDocument({})).toBe(false)
  })
})
