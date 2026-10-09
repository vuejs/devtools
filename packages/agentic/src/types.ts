import type { RuntimeRequests } from '@vue/devtools-kit'

/** A host supplies a connection to its existing Vue runtime. `command` enables state editing and cursor cleanup. */
export type VueDevtoolsAgentConnection = Pick<RuntimeRequests, 'query'> &
  Partial<Pick<RuntimeRequests, 'command'>>

export interface VueDevtoolsAgentPage {
  /** Unique per document: component IDs and value handles expire on reload. */
  id: string
  url: string
  title: string
}

export interface VueDevtoolsAgentSnapshot {
  page: VueDevtoolsAgentPage
  capturedAt: number
  result: unknown
}
