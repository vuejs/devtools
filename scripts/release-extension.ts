import * as fs from 'node:fs'
import * as path from 'node:path'
import * as p from '@clack/prompts'
import color from 'picocolors'
import semver from 'semver'
import manifest from '../packages/chrome-extension/manifest.json'
import pkg from '../packages/chrome-extension/package.json'
import firefoxManifest from '../packages/firefox-extension/manifest.json'
import firefoxPkg from '../packages/firefox-extension/package.json'

const __dirname = path.dirname(new URL(import.meta.url).pathname)
const curVersion = pkg.version

function applyIcons(manifest: Record<any, any>, suffix = '') {
  [16, 48, 128].forEach((size) => {
    manifest.icons[size] = `icons/${size}${suffix}.png`
  })
}

async function getNewVersion() {
  const project = await p.group({
    version: () =>
      p.text({
        message: `Please provide a version (current: ${curVersion}):`,
        validate: (value) => {
          if (!value) {
            return 'Version is required.'
          }
          if (!semver.valid(value)) {
            return `Invalid version: ${value}`
          }
          if (semver.lt(value, curVersion)) {
            return `New version (${value}) cannot be lower than current version (${curVersion}).`
          }
        },
      }),
    confirm: ({ results }) => {
      return p.confirm({
        message: `Are you sure to release version ${results.version}?`,
      })
    },

  }, {
    onCancel: () => {
      p.cancel('Release cancelled.')
      process.exit(0)
    },
  })
  return project.confirm ? project.version : ''
}

async function release() {
  p.intro(`${color.bgCyan(color.black(' Start to release chrome and firefox extension...'))}`)
  getNewVersion().then(async (newVersion) => {
    if (newVersion) {
      console.log(`\n${color.bgGreen(color.black(` Bump version ${newVersion}...`))}`)

      const isBeta = newVersion.includes('beta')
      pkg.version = newVersion
      firefoxPkg.version = newVersion
      if (isBeta) {
        const [, baseVersion, betaVersion] = /(.*)-beta\.(\w+)/.exec(newVersion)!
        manifest.version = `${baseVersion}.${betaVersion}`
        manifest.version_name = `${baseVersion} beta ${betaVersion}`
        applyIcons(manifest, '-beta')

        firefoxManifest.version = `${baseVersion}.${betaVersion}`
        firefoxManifest.version_name = `${baseVersion} beta ${betaVersion}`
        applyIcons(firefoxManifest, '-beta')
      }
      else {
        manifest.version = newVersion
        manifest.version_name = newVersion
        applyIcons(manifest)

        firefoxManifest.version = newVersion
        firefoxManifest.version_name = newVersion
        applyIcons(firefoxManifest)
      }

      fs.writeFileSync(path.resolve(__dirname, '../packages/chrome-extension/package.json'), JSON.stringify(pkg, null, 2))
      fs.writeFileSync(path.resolve(__dirname, '../packages/firefox-extension/package.json'), JSON.stringify(firefoxPkg, null, 2))
      fs.writeFileSync(path.resolve(__dirname, '../packages/chrome-extension/manifest.json'), JSON.stringify(manifest, null, 2))
      fs.writeFileSync(path.resolve(__dirname, '../packages/firefox-extension/manifest.json'), JSON.stringify(firefoxManifest, null, 2))
    }
    else {
      p.cancel(color.red('Release cancelled.'))
      process.exit(0)
    }
  })
}

release()
