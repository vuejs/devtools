import electron from 'electron'
import { execaSync } from 'execa'
import { resolve } from 'pathe'

const appPath = decodeURIComponent(resolve(new URL('../dist/app.cjs', import.meta.url).pathname))
const argv = process.argv.slice(2)

const result = execaSync(electron as unknown as string, [appPath].concat(argv), {
  stdio: 'inherit',
  windowsHide: false,
})

process.exit(result.exitCode)
