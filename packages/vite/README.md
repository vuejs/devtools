# vite-plugin-vue-devtools

> A Vite plugin designed to enhance the Vue developer experience.

## Vue DevTools v9 (Vite 8.3+)

### Installation

```sh
npm add -D vite-plugin-vue-devtools @vitejs/devtools
```

### Usage

```ts
import { defineConfig } from 'vite'
import vueDevTools from 'vite-plugin-vue-devtools'

export default defineConfig({
  devtools: true,
  plugins: [vueDevTools()],
})
```

## Vue DevTools v8 (Vite 6–8)

### Installation

```sh
npm add -D vite-plugin-vue-devtools@8
```

### Usage

```ts
import { defineConfig } from 'vite'
import vueDevTools from 'vite-plugin-vue-devtools'

export default defineConfig({
  plugins: [vueDevTools()],
})
```

## Documentation

See the [Vue DevTools documentation](https://devtools.vuejs.org/guide/vite-plugin) for more details.
