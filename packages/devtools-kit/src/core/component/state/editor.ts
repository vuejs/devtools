import type { MaybeRef, Ref } from 'vue'
import type { InspectorStateEditorPayload, PropPath } from '../types'
import { activeAppRecord } from '../../../ctx'
import { isReactive, isRef, toRaw } from '../../../shared/stub-vue'
import { EditStatePayload } from '../../../types'

import { getComponentInstance } from '../utils'

export type Recordable = Record<PropertyKey, any>

export class StateEditor {
  refEditor = new RefStateEditor()

  set(
    object: Recordable,
    path: PropPath,
    value: unknown,
    cb?: (object: Recordable, field: string, value: unknown) => void,
  ) {
    const sections = Array.isArray(path) ? path : path.split('.')
    const markRef = false
    while (sections.length > 1) {
      const section = sections.shift()!
      if (object instanceof Map)
        object = object.get(section) as Recordable
      if (object instanceof Set)
        object = Array.from(object.values())[section] as Recordable
      else object = object[section] as Recordable
      if (this.refEditor.isRef(object))
        object = this.refEditor.get(object)
    }
    const field = sections[0]
    const item = this.refEditor.get(object)[field]
    if (cb) {
      cb(object, field, value)
    }
    else {
      if (this.refEditor.isRef(item))
        this.refEditor.set(item, value)
      else if (markRef)
        object[field] = value
      else
        object[field] = value
    }
  }

  get(object: Recordable, path: PropPath) {
    const sections = Array.isArray(path) ? path : path.split('.')
    for (let i = 0; i < sections.length; i++) {
      if (object instanceof Map)
        object = object.get(sections[i]) as Recordable
      else
        object = object[sections[i]] as Recordable
      if (this.refEditor.isRef(object))
        object = this.refEditor.get(object)
      if (!object)
        return undefined
    }
    return object
  }

  has(object: Recordable, path: PropPath, parent = false) {
    if (typeof object === 'undefined')
      return false
    const sections = Array.isArray(path) ? path.slice() : path.split('.')
    const size = !parent ? 1 : 2
    while (object && sections.length > size) {
      const section = sections.shift()!
      object = object[section] as Recordable
      if (this.refEditor.isRef(object))
        object = this.refEditor.get(object)
    }
    return object != null && Object.prototype.hasOwnProperty.call(object, sections[0])
  }

  createDefaultSetCallback(state: EditStatePayload) {
    return (object: Recordable, field: string | number, value: unknown) => {
      if (state.remove || state.newKey) {
        if (Array.isArray(object))
          object.splice(field as number, 1)
        else if (toRaw(object) instanceof Map)
          object.delete(field)
        else if (toRaw(object) instanceof Set)
          object.delete(Array.from(object.values())[field as number])
        else Reflect.deleteProperty(object, field)
      }
      if (!state.remove) {
        const target = object[state.newKey || field]
        if (this.refEditor.isRef(target))
          this.refEditor.set(target, value)
        else if (toRaw(object) instanceof Map)
          object.set(state.newKey || field, value)
        else if (toRaw(object) instanceof Set)
          object.add(value)
        else
          object[state.newKey || field] = value
      }
    }
  }
}

export class RefStateEditor {
  set(ref: Ref<any>, value: any): void {
    if (isRef(ref)) {
      ref.value = value
    }
    else {
      // Edit on native type Set
      if (ref instanceof Set && Array.isArray(value)) {
        ref.clear()
        value.forEach((v: unknown) => ref.add(v))
        return
      }

      const currentKeys = Object.keys(value)

      // Edit on native type Map
      if (ref instanceof Map) {
        const previousKeysSet = new Set(ref.keys())
        currentKeys.forEach((key) => {
          ref.set(key, Reflect.get(value, key))
          previousKeysSet.delete(key)
        })
        previousKeysSet.forEach(key => ref.delete(key))
        return
      }

      // if is reactive, then it must be object
      // to prevent loss reactivity, we should assign key by key
      const previousKeysSet = new Set(Object.keys(ref))

      // we should check the key diffs, if previous key is the longer
      // then remove the needless keys
      currentKeys.forEach((key) => {
        Reflect.set(ref, key, Reflect.get(value, key))
        previousKeysSet.delete(key)
      })
      previousKeysSet.forEach(key => Reflect.deleteProperty(ref, key))
    }
  }

  get(ref: MaybeRef<any>): any {
    return isRef(ref) ? ref.value : ref
  }

  isRef(ref: MaybeRef<any>): ref is Ref<any> {
    return isRef(ref) || isReactive(ref)
  }
}

export async function editComponentState(payload: InspectorStateEditorPayload, stateEditor: StateEditor) {
  const { path, nodeId, state, type } = payload
  // assert data types, currently no...
  // if (!['data', 'props', 'computed', 'setup'].includes(dataType))
  const instance = getComponentInstance(activeAppRecord.value, nodeId)
  if (!instance)
    return

  const targetPath = path.slice()

  let target: Record<string, unknown> | undefined

  // 1. check if is props
  if (Object.keys(instance.props).includes(path[0])) {
    target = instance.props
  }
  // 2. check if is setup
  else if (instance.devtoolsRawSetupState && Object.keys(instance.devtoolsRawSetupState).includes(path[0])) {
    target = instance.devtoolsRawSetupState
  }
  // 3. check if is options
  else if (instance.data && Object.keys(instance.data).includes(path[0])) {
    target = instance.data
  }
  else {
    // 4. fallback
    target = instance.proxy
  }

  if (target && targetPath) {
    if (state.type === 'object' && type === 'reactive') {
      // prevent loss of reactivity
    }
    // @ts-expect-error skip type check
    stateEditor.set(target, targetPath, state.value, stateEditor.createDefaultSetCallback(state))
  }
}

export const stateEditor = new StateEditor()

// TODO: currently (w/ Vue official devtools), we send all state to frontend after changes,
//       we can optimize this by only sending the changed state, to make a better UX.
// PRIORITY: LOW
export async function editState(payload: InspectorStateEditorPayload) {
  editComponentState(payload, stateEditor)
}
