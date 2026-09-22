export const CLIENT_RUNTIME_KEY = '__VUE_DEVTOOLS_VITE_RUNTIME__'
export const CLIENT_MODULE_ID = 'virtual:vue-devtools-client'
export const RESOLVED_CLIENT_MODULE_ID = `\0${CLIENT_MODULE_ID}`
export const CLIENT_IMPORT_ID = 'vite-plugin-vue-devtools/client'
export const CLIENT_DOCK_MODULE_FILENAME = 'dock-client.js'
export const CLIENT_PATH = '__devtools__'
export const DOCK_ENTRY_ID = 'vue-devtools'

export function normalizeBase(base: string): string {
  if (!base || base === './') return '/'

  return base.endsWith('/') ? base : `${base}/`
}

export function getClientBasePath(base: string): string {
  return `${normalizeBase(base)}${CLIENT_PATH}/`
}

export function getClientDockModulePath(base: string): string {
  return `${getClientBasePath(base)}${CLIENT_DOCK_MODULE_FILENAME}`
}
