import type { PluginOption } from 'vite'
import type { VitePluginVueDevToolsOptions } from './options'
import { createVueDevToolsClientInjectionPlugin } from './client-injection'
import { createVueDevToolsDockRegistrationPlugin } from './utils/dock/registration'
import { resolveClientOptions } from './options'

export type { VitePluginVueDevToolsOptions } from './options'

export function vueDevtools(options: VitePluginVueDevToolsOptions = {}): PluginOption[] {
  const enabled = options.enabled ?? true
  if (!enabled) return []

  const clientOptions = resolveClientOptions(options)

  return [
    createVueDevToolsClientInjectionPlugin(options, clientOptions),
    createVueDevToolsDockRegistrationPlugin(),
  ]
}

export default vueDevtools
