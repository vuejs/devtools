# Open component in editor

Select a component to open its source file in your code editor.

## Vite plugin

The Vite plugin supports this feature out of the box when the connected Vite DevTools host exposes
its open-in-editor capability.

Starting with Vue DevTools v9, Vue DevTools only forwards the component source path to
`vite:core:open-in-editor`. `@vitejs/devtools` handles workspace path validation, editor launching,
and diagnostics. The `launchEditor` plugin option has been removed.

To open files in a specific editor, set the `LAUNCH_EDITOR` environment variable when you start
Vite, for example `cursor` or `code`. Vue DevTools v8 read the same variable. When `LAUNCH_EDITOR`
is unset, Vite DevTools chooses an editor from the ones currently running.

For security, the source file must resolve inside the Vite workspace root. See the
[Vite DevTools path validation documentation](https://devtools.vite.dev/errors/dtk0028) when an
open-in-editor request is rejected.

## Browser extension

In v9, the browser extension does not support opening source files in an editor, so this action is hidden.
Use the Vite plugin to open source files from Vue DevTools.
