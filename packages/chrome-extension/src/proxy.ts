// This is a content-script that is injected only when the devtools are
// activated. Because it is not injected using eval, it has full privilege
// to the chrome runtime API. It serves as a proxy between the injected
// user application and the Vue devtools panel.

import { createRpcProxy } from '@vue/devtools-kit'

createRpcProxy({
  preset: 'extension',
})
