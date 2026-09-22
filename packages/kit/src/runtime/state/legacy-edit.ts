import { isRef } from './shared'
import { deleteStateValue, resolvePath, setStateValue } from './edit'

export function createLegacyStateSetter(
  state: { value?: unknown; newKey?: string | null; remove?: boolean },
  onSuccess?: () => void,
) {
  return (
    object: object,
    path: string | string[] = [],
    value: unknown = state.value,
    cb?: (object: Record<PropertyKey, unknown>, field: string, value: unknown) => void,
  ): void => {
    const sections = Array.isArray(path) ? [...path] : path ? path.split('.') : []
    if (!sections.length) return
    if (cb) {
      const result = resolvePath(object, sections.slice(0, -1))
      const target = isRef(result.value) ? (result.value as { value: unknown }).value : result.value
      if (
        !result.found ||
        target == null ||
        (typeof target !== 'object' && typeof target !== 'function')
      )
        return
      cb(target as Record<PropertyKey, unknown>, sections.at(-1)!, value)
      onSuccess?.()
      return
    }
    const changed = state.remove
      ? deleteStateValue(object, sections)
      : setStateValue(object, sections, value, state.newKey ?? undefined)
    if (changed) onSuccess?.()
  }
}
