import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import degit from 'degit'
import fg from 'fast-glob'
import fse from 'fs-extra'
import { RegexExtra } from 'regex-extra'

const dir = fileURLToPath(new URL('../clones/vue-docs', import.meta.url))

if (!fse.existsSync(dir)) {
  await degit('vuejs/docs', {
    force: true,
  }).clone(dir)
}

const APIReg = new RegexExtra(/^## (.*)\{#(.*)\}/gm)

const files = await fg(['src/api/*.md'], {
  ignore: ['*index.md'],
  cwd: dir,
  onlyFiles: true,
}).then(r => r.sort())

const IGNORED_TITLES = [
  'guide',
]

const headerMatch = /^# (.*)/m

export function getTitleMarkdown(text: string) {
  const match = text.match(headerMatch)
  if (match == null)
    return

  const title = match && match[1]
  return title.trim()
}

const titleIgnored = (title: string) => IGNORED_TITLES.some(ignored => title.toLowerCase().includes(ignored))

const manifest = await Promise.all(files.map(async (file) => {
  const filepath = join(dir, file)
  const content = await fse.readFile(filepath, 'utf-8')
  const parentPath = file.replace(/\/\d+\./g, '/').replace(/\.md$/, '').replace(/\/index$/, '').replace(/^src\/api/, '')
  const parentId = `doc${parentPath.replace(/\//g, ':')}`
  const title = (getTitleMarkdown(content) || '').trim().replace(/`/g, '').replace(/\s/g, ' ')

  if (!title)
    return
  const result = APIReg.capturesAll(content) ?? []
  return result.map((item) => {
    const [title, path] = item.map(i => i.replaceAll(/(?<!`)<.*>(?!`)/g, '').replaceAll('\\', '').trim().replace(/`/g, ''))
    if (titleIgnored(title))
      return null
    return {
      id: `${parentId}:${title}`,
      title,
      description: parentPath.replace(/\//g, ''),
      url: `https:/vuejs.org/api${parentPath}#${path}`,
    }
  })
})).then(r => r.flat(1).filter(Boolean))

const targetDir = fileURLToPath(new URL('../packages/client/data', import.meta.url))

if (!fse.existsSync(targetDir))
  fse.mkdirSync(targetDir)

await fse.writeFile(`${targetDir}/vue-apis.json`, JSON.stringify(manifest, null, 2))
