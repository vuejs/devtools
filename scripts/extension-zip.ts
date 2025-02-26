import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import archiver from 'archiver'
import ProgressBar from 'progress'
import { readdirGlob } from 'readdir-glob'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const INCLUDE_FILES = [
  'client/**',
  'dist/**',
  'icons/**',
  'overlay/**',
  'pages/**',
  'popups/**',
  'devtools-background.html',
  'devtools-panel.html',
  'manifest.json',
  'package.json',
]
const EXCLUDE_DIRS = [
  'node_modules',
  'src',
]

function bytesToSize(bytes) {
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  if (bytes === 0)
    return '0 Bytes'
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const size = Number.parseFloat((bytes / 1024 ** i).toFixed(2))
  return `${size} ${sizes[i]}`
}

async function zip(filename: string, target: string) {
  const targetPkgDir = path.join(__dirname, `../packages/${target}-extension`)

  const archive = archiver('zip', { zlib: { level: 9 } })
  const output = fs.createWriteStream(path.join(__dirname, '../dist', `${filename}`))

  const status = {
    total: 0,
    cFile: '...',
    cSize: '0 Bytes',
    tBytes: 0,
    tSize: '0 Bytes',
  }
  async function parseFileStats() {
    return new Promise<void>((resolve, reject) => {
      const globber = readdirGlob(targetPkgDir, { pattern: INCLUDE_FILES, skip: EXCLUDE_DIRS, mark: true, stat: true })
      globber.on('match', (match) => {
        if (!match.stat?.isDirectory())
          status.total++
      })
      globber.on('error', (err) => {
        reject(err)
      })
      globber.on('end', () => {
        resolve()
      })
    })
  }
  await parseFileStats().catch((err) => {
    console.error(err)
    process.exit(1)
  })

  const bar = new ProgressBar(`${filename} @ :tSize [:bar] :current/:total :percent +:cFile@:cSize`, {
    width: 18,
    incomplete: ' ',
    total: status.total,
  })
  bar.tick(0, status)

  archive.on('entry', (entry) => {
    if (!entry.stats.isDirectory()) {
      const n = entry.name
      status.cFile = n.length > 14
        ? `...${n.slice(n.length - 11)}`
        : n
      status.cSize = bytesToSize(entry.stats.size)
      status.tBytes += entry.stats.size
      status.tSize = bytesToSize(status.tBytes)
      bar.tick(1, status)
    }
  })

  const end = new Promise<void>((resolve) => {
    // listen for all archive data to be written
    // 'close' event is fired only when a file descriptor is involved
    output.on('close', () => {
      if (archive.pointer() < 1000)
        console.warn(`Zip file (${filename}) is only ${archive.pointer()} bytes`)

      resolve()
    })
  })

  // This event is fired when the data source is drained no matter what was the data source.
  // It is not part of this library but rather from the NodeJS Stream API.
  // @see: https://nodejs.org/api/stream.html#stream_event_end
  output.on('end', () => {
    'nothing'
  })

  archive.on('warning', (err) => {
    if (err.code !== 'ENOENT') {
      // throw error
      console.error(err)
      process.exit(1)
    }
  })

  archive.on('error', (err) => {
    console.error(err)
    process.exit(1)
  })

  archive.pipe(output)

  INCLUDE_FILES.forEach((file) => {
    archive.glob(file, {
      cwd: targetPkgDir,
      skip: EXCLUDE_DIRS,
    })
  })

  archive.finalize()

  await end
}

fs.rmSync(path.join(__dirname, '../dist'), { recursive: true, force: true })
fs.mkdirSync(path.join(__dirname, '../dist'))
await zip('devtools-chrome.zip', 'chrome')
await zip('devtools-firefox.zip', 'firefox')
