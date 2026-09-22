import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ZipArchive } from 'archiver'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageDir = path.join(rootDir, 'packages/chrome')
const outDir = path.join(rootDir, 'dist')
const outFile = path.join(outDir, 'devtools-chrome.zip')
const include = ['app/**', 'dist/**', 'icons/**', 'manifest.json', 'package.json']

fs.rmSync(outFile, { force: true })
fs.mkdirSync(outDir, { recursive: true })

const output = fs.createWriteStream(outFile)
const archive = new ZipArchive({ zlib: { level: 9 } })

const done = new Promise((resolve, reject) => {
  output.on('close', resolve)
  output.on('error', reject)
  archive.on('error', reject)
  archive.on('warning', (error) => {
    if (error.code === 'ENOENT') return
    reject(error)
  })
})

archive.pipe(output)
for (const pattern of include) {
  archive.glob(pattern, {
    cwd: packageDir,
    ignore: ['**/node_modules/**', '**/src/**', '**/*.tsbuildinfo'],
  })
}

await archive.finalize()
await done

const size = archive.pointer()
if (size < 1000) throw new Error(`Zip file is unexpectedly small: ${size} bytes`)

console.log(`Created ${path.relative(rootDir, outFile)} (${formatBytes(size)})`)

function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit += 1
  }
  return `${size.toFixed(unit === 0 ? 0 : 2)} ${units[unit]}`
}
