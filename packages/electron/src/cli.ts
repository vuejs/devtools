import { spawnSync } from 'node:child_process'
import electron from 'electron'
import { resolve } from 'pathe'

const appPath = decodeURIComponent(resolve(new URL('../dist/app.cjs', import.meta.url).pathname))
const argv = process.argv.slice(2)

const result = spawnSync(electron as unknown as string, [appPath].concat(argv), {
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

process.exit(result.status ?? 0)
