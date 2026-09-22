import { describe, expect, it } from 'vitest'
import {
  getClientBasePath,
  getClientDockModulePath,
  normalizeBase,
} from '../../../packages/vite/src/constants'

describe('Vue DevTools Vite paths', () => {
  it.each([
    ['', '/'],
    ['/', '/'],
    ['./', '/'],
    ['/nested', '/nested/'],
    ['/nested/', '/nested/'],
  ])('normalizes base %j to %j', (base, expected) => {
    expect(normalizeBase(base)).toBe(expected)
  })

  it.each([
    ['/', '/__devtools__/', '/__devtools__/dock-client.js'],
    ['/nested', '/nested/__devtools__/', '/nested/__devtools__/dock-client.js'],
    ['/nested/', '/nested/__devtools__/', '/nested/__devtools__/dock-client.js'],
  ])('creates client paths under base %j', (base, clientPath, dockModulePath) => {
    expect(getClientBasePath(base)).toBe(clientPath)
    expect(getClientDockModulePath(base)).toBe(dockModulePath)
  })
})
