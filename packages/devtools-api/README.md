# @vue/devtools-api

Public plugin API compatibility entry for Vue DevTools.

```ts
import { setupDevToolsPlugin } from '@vue/devtools-api'

setupDevToolsPlugin(
  {
    id: 'example',
    label: 'Example',
    app,
  },
  (api) => {
    api.addInspector({ id: 'example', label: 'Example' })
  },
)
```

The legacy `setupDevtoolsPlugin` spelling remains available as an alias. Importing this package
from Node.js or during SSR is safe: its Node export intentionally performs no browser work.
