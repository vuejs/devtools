// Vue Vapor (3.6+) support. Everything here is duck-typed: the kit must keep
// working with Vue 3.5, so it never imports `@vue/runtime-vapor`.

// Fragment kind bits stored on `fragment.__vf` (runtime-vapor 3.6.0-rc.5).
export const VF = {
  FRAGMENT: 1,
  DYNAMIC: 2,
  SLOT: 4,
  FOR: 8,
  FOR_BLOCK: 16,
  TELEPORT: 32,
  INTEROP: 64,
  SLOT_OUTLET: 128,
} as const

export interface VaporFragmentLike {
  __vf: number
  nodes: unknown
  anchor?: Node
}

export interface VaporInteropFragmentLike extends VaporFragmentLike {
  vnode?: object
}

export interface VaporTeleportFragmentLike extends VaporFragmentLike {
  target?: Node | null
  placeholder?: Node
}

export function isVaporInstance(value: unknown): boolean {
  return isObject(value) && (value as { vapor?: unknown }).vapor === true
}

export function isVaporApp(app: unknown): boolean {
  return isObject(app) && (app as { vapor?: unknown }).vapor === true
}

export function isVaporFragment(value: unknown): value is VaporFragmentLike {
  return (
    isObject(value) && typeof (value as { __vf?: unknown }).__vf === 'number' && 'nodes' in value
  )
}

export function isInteropFragment(value: unknown): value is VaporInteropFragmentLike {
  return hasFragmentBit(value, VF.INTEROP)
}

export function isTeleportFragment(value: unknown): value is VaporTeleportFragmentLike {
  return hasFragmentBit(value, VF.TELEPORT)
}

export function isForFragment(value: unknown): value is VaporFragmentLike {
  return hasFragmentBit(value, VF.FOR)
}

export function isForBlock(value: unknown): value is VaporFragmentLike {
  return hasFragmentBit(value, VF.FOR_BLOCK)
}

function hasFragmentBit(value: unknown, bit: number): boolean {
  return isVaporFragment(value) && (value.__vf & bit) !== 0
}

function isObject(value: unknown): value is object {
  return value != null && typeof value === 'object'
}
