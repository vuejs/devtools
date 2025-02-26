# Standalone App

> In case you are using an unsupported browser, or if you have other specific needs (for example your application is in Electron), you can use the standalone application.

![electron](/features/electron.png)

## Installation

### Install the package globally:

::: code-group

```sh [npm]
$ npm add -g @vue/devtools
```

```sh [pnpm]
$ pnpm add -g @vue/devtools
```

```sh [yarn]
$ yarn global add @vue/devtools
```

```sh [bun]
$ bun add -g @vue/devtools
```

:::

### Or locally as project dependency:

::: code-group

```sh [npm]
$ npm add -D @vue/devtools
```

```sh [pnpm]
$ pnpm add -D @vue/devtools
```

```sh [yarn]
$ yarn add -D @vue/devtools
```

```sh [bun]
$ bun add -D @vue/devtools
```

:::

## Usage

### Using global package

Once you installed the package globally, run:

```sh
vue-devtools
```

Then add this code to the `<head>` section of your application HTML file:

```html
<script src="http://localhost:8098"></script>
```

Or if you want to debug your device remotely:

```html
<script>
  window.__VUE_DEVTOOLS_HOST__ = '<your-local-ip>' // default: localhost
  window.__VUE_DEVTOOLS_PORT__ = '<devtools-port>' // default: 8098
</script>
<script src="http://<your-local-ip>:8098"></script>
```

:::tip
`<your-local-ip>` usually looks like this: `192.168.x.x`.
:::
:::warning Note
**Don't forget to remove it before deploying to production!**
:::

### Using dependency package

Once you installed the package as project dependency, run:

```sh
./node_modules/.bin/vue-devtools
```

:::tip
You can also use the global `vue-devtools` to start the app, but you might want to check if the local version matches the global one in this scenario to avoid any incompatibilities.
:::

Then import it directly in your app:

```ts
import { devtools } from '@vue/devtools'
```

And connect to host:

```ts
if (process.env.NODE_ENV === 'development')
  devtools.connect(/* host (the default is "http://localhost"), port (the default is 8090) */)
```

:::tip Important
Make sure to invoke devtools connect function before creating Vue App, otherwise it might not work as expected.
:::

**host** - is an optional argument that tells your application where devtools middleware server is running, if you debug your app on your computer you don't have to set this (the default is `http://localhost`), but if you want to debug your app on mobile devices, you might want to pass your local IP (e.g. `http://192.168.1.12`).

**port** - is an optional argument that tells your application on what port devtools middleware server is running. If you use proxy server, you might want to set it to `null` so the port won't be added to connection URL.

## FAQ

### 1. How to change port devtools server is running on?

You can change it by setting environment variable before running it:

```sh
PORT=8000 vue-devtools
```

Then in your app you'll have to set either:

```ts
window.__VUE_DEVTOOLS_PORT__ = 8000
```

Or update connect method with new port:

```ts
devtools.connect(/ host /, 8000)
```

### 2. How to remotely inspect page on the server?

For that you can use `ngrok` proxy. You can download it [here](https://ngrok.com/).

Once you start vue-devtools run:

```sh
ngrok http 8098
```

Then update your host and port accordingly:

```ts
devtools.connect('https://example.ngrok.io', null)
```

Make sure to set port to `null` or `false`, because `ngrok` host already proxies to proper port that we defined in the first command.

### 3. How to inspect page served through `HTTPS`?

For that you can also use ngrok, as it automatically proxies https requests to http. Take a look at question number 2 for instructions.

### 4. How to inspect cordova applications?

Make sure that the page under `http://your-ip:8098` is returning a javascript code on your device/simulator. If it doesn't - make sure to check your anti-virus or router/firewall settings. If it works - please follow the instructions, and connect to devtools using your IP. For example:

```ts
import devtools from '@vue/devtools'
import Vue from 'vue'
// ...

function onDeviceReady() {
  devtools.connect('http://192.168.xx.yy') // use your IP
}

if (window.location.protocol === 'file:')
  document.addEventListener('deviceready', onDeviceReady, false)

else
  onDeviceReady()
```

This will only work on `development` build of your app.
