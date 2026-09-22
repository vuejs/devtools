import { expectTypeOf } from 'vitest'
import type { DevtoolsRpcClient } from '../../packages/kit/src/rpc/client'
import type { DevtoolsRuntime } from '../../packages/kit/src/runtime'
import type {
  AppsSnapshotMessage,
  ComponentStateSnapshotMessage,
} from '../../packages/kit/src/protocol'

// Checked by the repository type check, never executed against a runtime.
export function checkRuntimeRequests(client: DevtoolsRpcClient | DevtoolsRuntime) {
  expectTypeOf(client.query({ type: 'apps:snapshot' })).toEqualTypeOf<
    Promise<AppsSnapshotMessage>
  >()
  expectTypeOf(
    client.query({ type: 'components:stateSnapshot', payload: { componentId: 'root' } }),
  ).toEqualTypeOf<Promise<ComponentStateSnapshotMessage | undefined>>()
  expectTypeOf(client.queryCustom<number>({ type: 'extension:count' })).toEqualTypeOf<
    Promise<number>
  >()

  // @ts-expect-error A misspelled built-in name must not fall through to an untyped overload.
  void client.query({ type: 'apps:snapshop' })
  // @ts-expect-error State queries require a component id.
  void client.query({ type: 'components:stateSnapshot' })
  // @ts-expect-error Payload types follow the selected query.
  void client.query({ type: 'values:expand', payload: { handle: 123 } })
  // @ts-expect-error The caller cannot override the response type.
  void client.query<string>({ type: 'apps:snapshot' })
  // @ts-expect-error Commands also reject unknown names.
  void client.command({ type: 'router:navigte', payload: { path: '/' } })
  // @ts-expect-error Commands require the payload of the selected method.
  void client.command({ type: 'router:navigate', payload: { path: 42 } })
  expectTypeOf(
    client.command({
      type: 'values:recompute',
      payload: { componentId: 'root', sectionId: 'setup', path: ['label'] },
    }),
  ).toEqualTypeOf<Promise<{ status: 0 | 1; error?: unknown }>>()
}
