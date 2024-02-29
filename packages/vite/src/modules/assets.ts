import fsp from 'node:fs/promises'
import type { ViteInspectAPI } from 'vite-plugin-inspect'
import { debounce } from 'perfect-debounce'
import type { ResolvedConfig, ViteDevServer } from 'vite'
import { callViteClientListener, defineViteServerAction } from '@vue/devtools-core'
import fg from 'fast-glob'
import { join, resolve } from 'pathe'
import { imageMeta } from 'image-meta'

// assets
export type AssetType = 'image' | 'font' | 'video' | 'audio' | 'text' | 'json' | 'other'
export interface AssetInfo {
  path: string
  type: AssetType
  publicPath: string
  filePath: string
  size: number
  mtime: number
}
export interface ImageMeta {
  width: number
  height: number
  orientation?: number
  type?: string
  mimeType?: string
}

export interface AssetEntry {
  path: string
  content: string
  encoding?: BufferEncoding
  override?: boolean
}

export interface CodeSnippet {
  code: string
  lang: string
  name: string
  docs?: string
}

const defaultAllowedExtensions = [
  'png',
  'jpg',
  'jpeg',
  'gif',
  'svg',
  'webp',
  'ico',
  'mp4',
  'ogg',
  'mp3',
  'wav',
  'mov',
  'mkv',
  'mpg',
  'txt',
  'ttf',
  'woff',
  'woff2',
  'eot',
  'json',
  'js',
  'jsx',
  'ts',
  'tsx',
  'md',
  'mdx',
  'vue',
  'webm',
]

function guessType(path: string): AssetType {
  if (/\.(png|jpe?g|jxl|gif|svg|webp|avif|ico|bmp|tiff?)$/i.test(path))
    return 'image'
  if (/\.(mp4|webm|ogv|mov|avi|flv|wmv|mpg|mpeg|mkv|3gp|3g2|ts|mts|m2ts|vob|ogm|ogx|rm|rmvb|asf|amv|divx|m4v|svi|viv|f4v|f4p|f4a|f4b)$/i.test(path))
    return 'video'
  if (/\.(mp3|wav|ogg|flac|aac|wma|alac|ape|ac3|dts|tta|opus|amr|aiff|au|mid|midi|ra|rm|wv|weba|dss|spx|vox|tak|dsf|dff|dsd|cda)$/i.test(path))
    return 'audio'
  if (/\.(woff2?|eot|ttf|otf|ttc|pfa|pfb|pfm|afm)/i.test(path))
    return 'font'
  if (/\.(json[5c]?|te?xt|[mc]?[jt]sx?|md[cx]?|markdown|ya?ml|toml)/i.test(path))
    return 'text'
  return 'other'
}

export function setupAssetsModule(options: { rpc: ViteInspectAPI['rpc'], server: ViteDevServer, config: ResolvedConfig }) {
  const { rpc, server, config } = options

  const _imageMetaCache = new Map<string, ImageMeta | undefined>()
  let cache: AssetInfo[] | null = null

  async function scan() {
    const dir = resolve(config.root)
    const baseURL = config.base
    const files = await fg([
      // image
      '**/*.(png|jpg|jpeg|gif|svg|webp|avif|ico|bmp|tiff)',
      // video
      '**/*.(mp4|webm|ogv|mov|avi|flv|wmv|mpg|mpeg|mkv|3gp|3g2|m2ts|vob|ogm|ogx|rm|rmvb|asf|amv|divx|m4v|svi|viv|f4v|f4p|f4a|f4b)',
      // audio
      '**/*.(mp3|wav|ogg|flac|aac|wma|alac|ape|ac3|dts|tta|opus|amr|aiff|au|mid|midi|ra|rm|wv|weba|dss|spx|vox|tak|dsf|dff|dsd|cda)',
      // font
      '**/*.(woff2?|eot|ttf|otf|ttc|pfa|pfb|pfm|afm)',
      // text
      '**/*.(json|json5|jsonc|txt|text|tsx|jsx|md|mdx|mdc|markdown|yaml|yml|toml)',
    ], {
      cwd: dir,
      onlyFiles: true,
      ignore: [
        '**/node_modules/**',
        '**/dist/**',
        '**/package-lock.*',
        '**/pnpm-lock.*',
        '**/pnpm-workspace.*',
      ],
    })

    cache = await Promise.all(files.map(async (path) => {
      const filePath = resolve(dir, path)
      const stat = await fsp.lstat(filePath)
      // remove public prefix to resolve vite assets warning
      path = path.startsWith('public/') ? path.slice(7) : path
      return {
        path,
        publicPath: join(baseURL, path),
        filePath,
        type: guessType(path),
        size: stat.size,
        mtime: stat.mtimeMs,
      }
    }))
    return cache
  }

  defineViteServerAction('assets:get-static-assets', async () => {
    return await scan()
  })

  defineViteServerAction('assets:get-image-meta', async (filepath: string) => {
    if (_imageMetaCache.has(filepath))
      return _imageMetaCache.get(filepath)
    try {
      const meta = imageMeta(await fsp.readFile(filepath)) as ImageMeta
      _imageMetaCache.set(filepath, meta)
      return meta
    }
    catch (e) {
      _imageMetaCache.set(filepath, undefined)
      console.error(e)
      return undefined
    }
  })

  defineViteServerAction('assets:get-text-asset-content', async (filepath: string, limit = 300) => {
    try {
      const content = await fsp.readFile(filepath, 'utf-8')
      return content.slice(0, limit)
    }
    catch (e) {
      console.error(e)
      return undefined
    }
  })

  const triggerAssetsUpdated = callViteClientListener('assets:updated')

  const debouncedAssetsUpdated = debounce(() => {
    triggerAssetsUpdated()
  }, 100)

  server.watcher.on('all', (event) => {
    if (event !== 'change')
      debouncedAssetsUpdated()
  })
}
