import { createPageScriptChannel } from 'devframe/in-page-channel'
import { createVueDevtoolsAgentTools } from './tools'
import type { VueDevtoolsAgentConnection, VueDevtoolsAgentPage } from '../types'

/** Register inspection and optional editing tools in Devframe's browser registry, using a unique document namespace. */
export function registerVueDevtoolsAgentPage(
  connection: VueDevtoolsAgentConnection,
  page: VueDevtoolsAgentPage,
): () => void {
  const channel = createPageScriptChannel({
    name: `vue-devtools:agent:${page.id}`,
    functions: createVueDevtoolsAgentTools(connection, page),
  })
  return () => channel.close()
}
