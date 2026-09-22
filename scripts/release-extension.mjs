import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as p from '@clack/prompts'
import color from 'picocolors'
import { getPrerelease, isLess, isValid, tryParse } from 'verkit'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packagePath = path.join(rootDir, 'packages/chrome/package.json')
const manifestPath = path.join(rootDir, 'packages/chrome/manifest.json')
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))

const version = await askVersion(pkg.version)
if (!version) {
  p.cancel('Release cancelled.')
  process.exit(0)
}

const chrome = toChromeVersion(version)
pkg.version = version
manifest.version = chrome.version
manifest.version_name = chrome.versionName

fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`)
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
p.outro(`Chrome extension set to ${version} (${chrome.versionName})`)

async function askVersion(current) {
  p.intro(color.bgCyan(color.black(' Release the Chrome extension ')))
  const answer = await p.group(
    {
      version: () =>
        p.text({
          message: `Version (current: ${current})`,
          validate: (value) => {
            if (!value) return 'Version is required.'
            if (!isValid(value)) return `Invalid version: ${value}`
            if (isLess(value, current))
              return `New version (${value}) cannot be lower than current version (${current}).`
          },
        }),
      confirm: ({ results }) =>
        p.confirm({
          message: `Release version ${results.version}?`,
        }),
    },
    {
      onCancel: () => {
        p.cancel('Release cancelled.')
        process.exit(0)
      },
    },
  )
  return answer.confirm ? answer.version : ''
}

function toChromeVersion(version) {
  const parsed = tryParse(version)
  const base = `${parsed.major}.${parsed.minor}.${parsed.patch}`
  const pre = getPrerelease(parsed)
  if (!pre?.length) {
    return { version, versionName: version }
  }
  const label = String(pre[0])
  const n = pre[1] ?? 0
  return {
    version: `${base}.${n}`,
    versionName: `${base} ${label} ${n}`,
  }
}
