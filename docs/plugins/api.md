# Plugins API

Plugins API for easier DevTools integrations.

:::tip

Since v7.3.0, we are fully compatible with the v6 plugin API. You can check out the [API documentation](https://devtools-v6.vuejs.org/plugin/api-reference.html) here.
:::

## Installation

::: code-group

```sh [npm]
$ npm add -D @vue/devtools-api
```

```sh [pnpm]
$ pnpm add -D @vue/devtools-api
```

```sh [yarn]
$ yarn add -D @vue/devtools-api
```

```sh [bun]
$ bun add -D @vue/devtools-api
```

:::

## `addCustomTab`

You can choose any icon from [Material Design Icons](https://fonts.google.com/icons) or [Iconify Ic Baseline](https://icones.netlify.app/collection/ic?variant=Baseline), for example `star`.

```ts
import { addCustomTab } from '@vue/devtools-api'

addCustomTab({
  // unique identifier
  name: 'vue-use',
  // title to display in the tab
  title: 'VueUse',
  // any icon from material design icons or a URL to an image
  icon: 'https://vueuse.org/favicon.svg',
  // iframe view
  view: {
    type: 'iframe',
    src: 'https://vueuse.org/',
  },
  category: 'advanced',
})

const SFC = /* vue */ `
  <script setup lang="ts">
  import { ref } from 'vue'

  const count = ref(0)
  </script>

  <template>
    <div class="h-full w-full flex flex-col items-center justify-center">
      <div>
        count is {{ count }}
      </div>
      <button class="btn" @click="count++">
        increment
      </button>
    </div>
  </template>

  <style scoped>
  .btn {
    background-color: #4c51bf;
    color: #fff;
    padding: 0.5rem 1rem;
    border-radius: 0.25rem;
    border: none;
    cursor: pointer;
  }
  </style>
`

addCustomTab({
  name: 'plugin-count',
  title: 'Plugin Count',
  icon: 'baseline-exposure-plus-1',
  // SFC view
  view: {
    type: 'sfc',
    sfc: SFC,
  },
  category: 'app',
})
```

## `addCustomCommand`

You can choose any icon from [Material Design Icons](https://fonts.google.com/icons) or [Iconify Ic Baseline](https://icones.netlify.app/collection/ic?variant=Baseline), for example `star`.

```ts
import { addCustomCommand } from '@vue/devtools-api'

// Add a custom command with url
addCustomCommand({
  // unique identifier
  id: 'vueuse',
  // title to display in the command
  title: 'VueUse',
  // any icon from material design icons or a URL to an image
  icon: 'https://vueuse.org/favicon.svg',
  action: {
    type: 'url',
    src: 'https://vueuse.org/'
  }
})

// Add a custom command with submenu
addCustomCommand({
  // unique identifier
  id: 'vueuse',
  // title to display in the command
  title: 'VueUse',
  // any icon from material design icons or a URL to an image
  icon: 'https://vueuse.org/favicon.svg',
  // submenu, which is shown when the menu is clicked
  children: [
    {
      id: 'vueuse:github',
      title: 'Github',
      action: {
        type: 'url',
        src: 'https://github.com/vueuse/vueuse'
      }
    },
    {
      id: 'vueuse:website',
      title: 'Website',
      icon: 'auto-awesome',
      action: {
        type: 'url',
        src: 'https://vueuse.org/'
      }
    },
  ],
})
```

## `removeCustomCommand`

```ts
import { removeCustomCommand } from '@vue/devtools-api'

// Remove a custom command by id
removeCustomCommand('vueuse')
```

## `onDevToolsClientConnected`

```ts
import { onDevToolsClientConnected } from '@vue/devtools-api'

onDevToolsClientConnected(() => {
  console.log('devtools client connected')
})
```
