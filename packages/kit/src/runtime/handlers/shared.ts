import type { DevtoolsRuntime } from '../runtime'
import type { AppRef } from '../types'

export function retiredAppError(id: string): string {
  return `App for "${id}" is unmounted; the plugin callback was ignored`
}

export function readString(target: unknown, key: string): string | undefined {
  if (!isRecord(target)) return
  const value = target[key]
  return typeof value === 'string' ? value : undefined
}

export function readNumber(target: unknown, key: string): number | undefined {
  if (!isRecord(target)) return
  const value = target[key]
  return typeof value === 'number' ? value : undefined
}

export function readBoolean(target: unknown, key: string): boolean | undefined {
  if (!isRecord(target)) return
  const value = target[key]
  return typeof value === 'boolean' ? value : undefined
}

export function readObject(target: unknown, key: string): object | undefined {
  if (!isRecord(target)) return
  const value = target[key]
  return value != null && typeof value === 'object' ? value : undefined
}

export function readRecord(target: unknown, key: string): Record<string, unknown> | undefined {
  const value = readObject(target, key)
  return value && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
}

export function readUnknownProperty(target: unknown, key: string): unknown {
  return isRecord(target) ? target[key] : undefined
}

export function readStringArray(target: unknown, key: string): string[] {
  if (!isRecord(target) || !Array.isArray(target[key])) return []
  return target[key].filter((segment): segment is string => typeof segment === 'string')
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object'
}

export function resolveAppRef(
  runtime: DevtoolsRuntime,
  appId: string | undefined,
): AppRef | undefined {
  return appId ? runtime.registry.getApp(appId)?.app : runtime.registry.listApps()[0]?.app
}
