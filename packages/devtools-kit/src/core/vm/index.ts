const MAX_$VM = 10
const $vmQueue: any[] = []

// Expose instance data to window
// Copied from https://github.com/vuejs/devtools/blob/f03590025b0b4910cf539531c91384be51a8f8fa/packages/app-backend-core/src/component.ts#L57-L72
export function exposeInstanceToWindow(componentInstance: any) {
  if (typeof window === 'undefined')
    return
  const win = window as any

  if (!componentInstance)
    return

  win.$vm = componentInstance

  // $vm0, $vm1, $vm2, ...
  if ($vmQueue[0] !== componentInstance) {
    if ($vmQueue.length >= MAX_$VM) {
      $vmQueue.pop()
    }
    for (let i = $vmQueue.length; i > 0; i--) {
      win[`$vm${i}`] = $vmQueue[i] = $vmQueue[i - 1]
    }
    win.$vm0 = $vmQueue[0] = componentInstance
  }
}
