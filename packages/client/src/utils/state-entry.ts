import type { EncodedValue, StateEntry } from '@vue/devtools-kit'

type CustomEncodedValue = Extract<EncodedValue, { kind: 'custom' }>

export function getDisplayValue(value: EncodedValue): EncodedValue {
  return getCustomEncodedValue(value)?.value ?? value
}

export function getCustomEncodedValue(value: unknown): CustomEncodedValue | undefined {
  if (
    value != null &&
    typeof value === 'object' &&
    (value as { kind?: unknown }).kind === 'custom'
  ) {
    return value as CustomEncodedValue
  }
}

export function isReadOnlyCustomValue(value: EncodedValue): boolean {
  const custom = getCustomEncodedValue(value)
  return !!custom && (custom.readOnly === true || custom.abstract === true)
}

export function isStateEntryInputEditable(entry: StateEntry, entryValue: EncodedValue): boolean {
  if (!entry.editable) return false
  if (isReadOnlyCustomValue(entryValue)) return false

  const value = getDisplayValue(entryValue)
  switch (value.kind) {
    case 'string':
    case 'number':
    case 'null':
    case 'undefined':
    case 'bigint':
    case 'date':
    case 'regexp':
      return true
    default:
      return false
  }
}
