import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import fse from 'fs-extra'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

async function run() {
  ;['../../chrome-extension/client', '../../firefox-extension/client', '../../electron/client', '../../vite/client'].forEach((dir) => {
    const absoluteDir = resolve(__dirname, dir)
    if (fse.existsSync(absoluteDir))
      fse.removeSync(absoluteDir)
  })
  console.log('🎉 Pre-build: removed client bundles successfully.\n')
}

await run()
