import { isBrowser, target } from '@vue/devtools-shared'
import slug from 'speakingurl'
import { AppRecord, VueAppInstance } from '../../types'
import { getRootElementsFromComponentInstance } from '../component/tree/el'

/**
 * Global state object that tracks all Vue app records
 * Maintains a counter (id) and Set of unique app IDs
 * Used to ensure each Vue app in DevTools has a unique identifier
 */
const appRecordInfo = target.__VUE_DEVTOOLS_NEXT_APP_RECORD_INFO__ ??= {
  id: 0,
  appIds: new Set<string>(),
}

/**
 * Retrieves the display name for a Vue application
 * @param app - Vue app context/instance
 * @param fallbackName - Fallback name if app doesn't have a component name
 * @returns The app's component name or a generic "App {fallbackName}" string
 */
function getAppRecordName(app: VueAppInstance['appContext']['app'], fallbackName: string) {
  return app?._component?.name || `App ${fallbackName}`
}

/**
 * Gets the root Vue component instance from a Vue app
 * Tries two possible locations where Vue stores the root instance
 * @param app - Vue app instance
 * @returns The root component instance, or undefined if not found
 */
function getAppRootInstance(app: VueAppInstance['appContext']['app']) {
  // First try: Direct instance on the app object
  if (app._instance)
    return app._instance

  // Fallback: Look inside the app's container virtual node
  else if (app._container?._vnode?.component)
    return app._container?._vnode?.component
}

/**
 * Removes an app record ID from tracking when an app is unmounted
 * Cleans up the global appRecordInfo Set and decrements the counter
 * @param app - Vue app instance to remove from tracking
 */
export function removeAppRecordId(app: VueAppInstance['appContext']['app']) {
  const id = app.__VUE_DEVTOOLS_NEXT_APP_RECORD_ID__
  if (id != null) {
    // Remove from Set of active app IDs
    appRecordInfo.appIds.delete(id)
    // Decrement global counter
    appRecordInfo.id--
  }
}

/**
 * Gets or creates a unique ID for an app record
 * Generates slug-based IDs from app names, with fallback to numeric IDs
 * Handles ID collisions by appending counters (e.g., "app_1", "app_2")
 * @param app - Vue app instance
 * @param defaultId - Optional default ID (typically a slug of the app name)
 * @returns A unique string ID for the app
 */
function getAppRecordId(app: VueAppInstance['appContext']['app'], defaultId?: string): string {
  // Return existing ID if already assigned
  if (app.__VUE_DEVTOOLS_NEXT_APP_RECORD_ID__ != null)
    return app.__VUE_DEVTOOLS_NEXT_APP_RECORD_ID__

  // Generate ID: use provided defaultId, or fallback to incrementing numeric ID
  let id = defaultId ?? (appRecordInfo.id++).toString()

  // Handle ID collisions by appending a counter suffix
  if (defaultId && appRecordInfo.appIds.has(id)) {
    let count = 1
    // Find the first available numbered suffix
    while (appRecordInfo.appIds.has(`${defaultId}_${count}`))
      count++
    id = `${defaultId}_${count}`
  }

  // Register this ID in the global tracking Set
  appRecordInfo.appIds.add(id)

  // Attach ID to the app instance for future lookups
  app.__VUE_DEVTOOLS_NEXT_APP_RECORD_ID__ = id
  return id
}

/**
 * Creates a complete app record object for DevTools tracking
 * This represents a Vue app instance with all metadata needed by DevTools
 * @param app - Vue app instance
 * @param types - Object mapping component type names to their symbols (for filtering)
 * @returns AppRecord object containing app metadata, or empty object if no root instance found
 */
export function createAppRecord(app: VueAppInstance['appContext']['app'], types: Record<string, string | symbol>): AppRecord {
  // Get the root component instance of the app
  const rootInstance = getAppRootInstance(app)

  if (rootInstance) {
    // Increment counter for next app
    appRecordInfo.id++

    // Get a human-readable name for the app
    const name = getAppRecordName(app, appRecordInfo.id.toString())

    // Generate a unique, URL-safe ID (e.g., "my-app" instead of "My App")
    const id = getAppRecordId(app, slug(name))

    // Get the DOM element associated with the root instance
    const [el] = getRootElementsFromComponentInstance(rootInstance) as /* type-compatible, this is returning VNode[] */ unknown as HTMLElement[]

    // Create the app record with all metadata
    const record: AppRecord = {
      id,
      name,
      types,
      instanceMap: new Map(), // Maps component UIDs to component instances
      perfGroupIds: new Map(), // Tracks performance profiling data by component
      rootInstance,
      // If the app is in an iframe, store the iframe path; undefined for main document
      iframe: isBrowser && document !== el?.ownerDocument ? el?.ownerDocument?.location?.pathname : undefined,
    }

    // Attach record to app instance for reference
    app.__VUE_DEVTOOLS_NEXT_APP_RECORD__ = record

    // Create and register the root component's unique identifier
    const rootId = `${record.id}:root`
    record.instanceMap.set(rootId, record.rootInstance)
    record.rootInstance.__VUE_DEVTOOLS_NEXT_UID__ = rootId

    return record
  }
  else {
    // Fallback: return empty object if unable to locate root instance
    return {} as AppRecord
  }
}
