import type { SuspenseBoundary, VNode } from 'vue'
import type { DevToolsPluginAPI } from '../../../api'
import type { ComponentTreeNode, VueAppInstance } from '../../../types'
import type { ComponentFilter } from './filter'
// import { devtoolsAppRecords, devtoolsContext } from '../../../state'
import { activeAppRecord } from '../../../ctx'
import { getAppRecord, getInstanceName, getRenderKey, getUniqueComponentId, isBeingDestroyed, isFragment } from '../utils'
import { getRootElementsFromComponentInstance } from './el'
import { createComponentFilter } from './filter'

interface ComponentWalkerOptions {
  filterText?: string
  maxDepth: number | null
  recursively: boolean
  api: InstanceType<typeof DevToolsPluginAPI>
}

export class ComponentWalker {
  maxDepth: number | null
  recursively: boolean
  componentFilter: InstanceType<typeof ComponentFilter>
  api: InstanceType<typeof DevToolsPluginAPI>
  // Dedupe instances (Some instances may be both on a component and on a child abstract/functional component)
  private captureIds: Map<string, undefined> = new Map()
  constructor(options: ComponentWalkerOptions) {
    const { filterText = '', maxDepth, recursively, api } = options
    this.componentFilter = createComponentFilter(filterText)
    this.maxDepth = maxDepth
    this.recursively = recursively
    this.api = api
  }

  public getComponentTree(instance: VueAppInstance): Promise<ComponentTreeNode[]> {
    this.captureIds = new Map()
    return this.findQualifiedChildren(instance, 0)
  }

  public getComponentParents(instance: VueAppInstance) {
    this.captureIds = new Map()
    const parents: VueAppInstance[] = []
    this.captureId(instance)
    let parent = instance
    // eslint-disable-next-line no-cond-assign
    while ((parent = parent.parent)) {
      this.captureId(parent)
      parents.push(parent)
    }
    return parents
  }

  private captureId(instance: VueAppInstance): string | null {
    if (!instance)
      return null

    // instance.uid is not reliable in devtools as there
    // may be 2 roots with same uid which causes unexpected
    // behaviour
    const id = instance.__VUE_DEVTOOLS_NEXT_UID__ != null ? instance.__VUE_DEVTOOLS_NEXT_UID__ : getUniqueComponentId(instance)
    instance.__VUE_DEVTOOLS_NEXT_UID__ = id

    // Dedupe
    if (this.captureIds.has(id))
      return null

    else
      this.captureIds.set(id, undefined)

    this.mark(instance)

    return id
  }

  /**
   * Capture the meta information of an instance. (recursive)
   *
   * @param {Vue} instance
   * @return {object}
   */
  private async capture(instance: VueAppInstance, depth: number): Promise<ComponentTreeNode> {
    if (!instance)
      return null as unknown as ComponentTreeNode

    const id = this.captureId(instance)!

    const name = getInstanceName(instance)

    const children = this.getInternalInstanceChildren(instance.subTree)
      .filter(child => !isBeingDestroyed(child))

    const parents = this.getComponentParents(instance) || []

    const inactive = !!instance.isDeactivated || parents.some(parent => parent.isDeactivated)

    // @TODO: refactor it
    const treeNode: ComponentTreeNode = {
      uid: instance.uid,
      id,
      name,
      renderKey: getRenderKey(instance.vnode ? instance.vnode.key : null),
      inactive,
      children: [],
      isFragment: isFragment(instance),
      tags: typeof instance.type !== 'function'
        ? []
        : [
            {
              label: 'functional',
              textColor: 0x555555,
              backgroundColor: 0xEEEEEE,
            },
          ],
      autoOpen: this.recursively,
      file: instance.type.__file || '',
    }

    // capture children
    if (depth < this.maxDepth! || instance.type.__isKeepAlive || parents.some(parent => parent.type.__isKeepAlive)) {
      treeNode.children = await Promise.all(children
        .map(child => this.capture(child, depth + 1))
        .filter(Boolean))
    }

    // keep-alive
    if (this.isKeepAlive(instance)) {
      const cachedComponents = this.getKeepAliveCachedInstances(instance)
      const childrenIds = children.map(child => child.__VUE_DEVTOOLS_NEXT_UID__)
      for (const cachedChild of cachedComponents) {
        if (!childrenIds.includes(cachedChild.__VUE_DEVTOOLS_NEXT_UID__)) {
          const node = await this.capture({ ...cachedChild, isDeactivated: true }, depth + 1)
          if (node)
            treeNode.children.push(node)
        }
      }
    }

    // ensure correct ordering
    const rootElements = getRootElementsFromComponentInstance(instance)
    const firstElement = rootElements[0] as VNode & { parentElement: HTMLElement | null }
    if (firstElement?.parentElement) {
      const parentInstance = instance.parent
      const parentRootElements = parentInstance ? getRootElementsFromComponentInstance(parentInstance) : []
      let el = firstElement as unknown as HTMLElement | null
      const indexList: number[] = []
      do {
        indexList.push(Array.from(el!.parentElement!.childNodes).indexOf(el!))
        el = el!.parentElement
      } while (el!.parentElement && parentRootElements.length && !parentRootElements.includes(el as unknown as VNode))
      treeNode.domOrder = indexList.reverse()
    }
    else {
      treeNode.domOrder = [-1]
    }

    if (instance.suspense?.suspenseKey) {
      treeNode.tags.push({
        label: instance.suspense.suspenseKey,
        backgroundColor: 0xE492E4,
        textColor: 0xFFFFFF,
      })
      // update instanceMap
      this.mark(instance, true)
    }

    this.api.visitComponentTree({
      treeNode,
      componentInstance: instance,
      app: instance.appContext.app,
      filter: this.componentFilter.filter,
    })
    return treeNode
  }

  /**
   * Find qualified children from a single instance.
   * If the instance itself is qualified, just return itself.
   * This is ok because [].concat works in both cases.
   *
   * @param {Vue|Vnode} instance
   * @return {Vue|Array}
   */
  private async findQualifiedChildren(instance: VueAppInstance, depth: number): Promise<ComponentTreeNode[]> {
    if (this.componentFilter.isQualified(instance) && !instance.type.devtools?.hide) {
      return [await this.capture(instance, depth)]
    }
    else if (instance.subTree) {
      // TODO functional components
      const list = this.isKeepAlive(instance)
        ? this.getKeepAliveCachedInstances(instance)
        : this.getInternalInstanceChildren(instance.subTree)
      return this.findQualifiedChildrenFromList(list, depth)
    }
    else {
      return []
    }
  }

  /**
   * Iterate through an array of instances and flatten it into
   * an array of qualified instances. This is a depth-first
   * traversal - e.g. if an instance is not matched, we will
   * recursively go deeper until a qualified child is found.
   *
   * @param {Array} instances
   * @return {Array}
   */
  private async findQualifiedChildrenFromList(instances: VueAppInstance[], depth: number): Promise<ComponentTreeNode[]> {
    instances = instances
      .filter(child => !isBeingDestroyed(child) && !child.type.devtools?.hide)
    if (!this.componentFilter.filter)
      return Promise.all(instances.map(child => this.capture(child, depth)))

    else
      return Array.prototype.concat.apply([], await Promise.all(instances.map(i => this.findQualifiedChildren(i, depth))))
  }

  /**
   * Get children from a component instance.
   */
  private getInternalInstanceChildren(subTree: VueAppInstance['subTree'], suspense: (SuspenseBoundary & { suspenseKey: string }) | null = null): VueAppInstance[] {
    const list: Array<VueAppInstance & { suspense?: SuspenseBoundary }> = []
    if (subTree) {
      if (subTree.component) {
        !suspense ? list.push(subTree.component as VueAppInstance) : list.push({ ...subTree.component as VueAppInstance, suspense })
      }
      else if (subTree.suspense) {
        const suspenseKey = !subTree.suspense.isInFallback ? 'suspense default' : 'suspense fallback'
        list.push(...this.getInternalInstanceChildren(subTree.suspense.activeBranch as VueAppInstance['subTree'], { ...subTree.suspense, suspenseKey }))
      }
      else if (Array.isArray(subTree.children)) {
        subTree.children.forEach((childSubTree) => {
          if ((childSubTree as VNode).component)
            !suspense ? list.push(((childSubTree as VNode).component) as VueAppInstance) : list.push({ ...((childSubTree as VNode).component) as VueAppInstance, suspense })

          else
            list.push(...this.getInternalInstanceChildren(childSubTree as VueAppInstance['subTree'], suspense))
        })
      }
    }
    return list.filter(child => !isBeingDestroyed(child) && !child.type.devtools?.hide)
  }

  /**
   * Mark an instance as captured and store it in the instance map.
   *
   * @param {Vue} instance
   */
  private mark(instance: VueAppInstance, force = false) {
    const instanceMap = getAppRecord(instance)!.instanceMap
    if (force || !instanceMap.has(instance.__VUE_DEVTOOLS_NEXT_UID__)) {
      instanceMap.set(instance.__VUE_DEVTOOLS_NEXT_UID__, instance)

      // force sync appRecord instanceMap
      activeAppRecord.value.instanceMap = instanceMap
    }
  }

  private isKeepAlive(instance: VueAppInstance) {
    return instance.type.__isKeepAlive && instance.__v_cache
  }

  private getKeepAliveCachedInstances(instance: VueAppInstance): VueAppInstance[] {
    // @ts-expect-error skip type check
    return Array.from(instance.__v_cache.values()).map((vnode: VNode) => vnode.component).filter(Boolean) as VueAppInstance[]
  }
}
