export default function setupVueDevtoolsDock(context) {
  const runtime = (globalThis.__VUE_DEVTOOLS_VITE_RUNTIME__ ??= {})
  runtime.context = context
  runtime.bindDock?.(context)
}
