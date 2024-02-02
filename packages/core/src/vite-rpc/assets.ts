import fsp from 'node:fs/promises'
import { cwd } from 'node:process'
import fg from 'fast-glob'
import { join, relative, resolve } from 'pathe'
import { imageMeta } from 'image-meta'
import type { AssetInfo, AssetType, ImageMeta, ViteRPCFunctions } from './types'

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

interface SetupAssetsOptions {
  root: string
  base: string
}

export function setupAssetsRPC(config: SetupAssetsOptions) {
  const _imageMetaCache = new Map<string, ImageMeta | undefined>()
  let cache: AssetInfo[] | null = null

  const extensions = defaultAllowedExtensions

  async function scan() {
    const projectRoot = resolve(cwd())
    const configRoot = resolve(config.root)
    const relativeConfigRoot = relative(projectRoot, configRoot)
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
      cwd: projectRoot,
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
      const filePath = resolve(projectRoot, path)
      const stat = await fsp.lstat(filePath)
      const atRoot = isSubPath(resolve(projectRoot, relativeConfigRoot), filePath)

      // remove public prefix to resolve vite assets warning
      const publicDir = join(relativeConfigRoot, 'public')
      const publicPath = path.startsWith(publicDir) ? path.slice(publicDir.length + 1) : path

      return {
        path,
        publicPath: join(baseURL, publicPath),
        filePath,
        type: guessType(path),
        size: stat.size,
        mtime: stat.mtimeMs,
        atRoot,
      }
    }))
    return cache
  }

  return {
    async getStaticAssets() {
      return await scan()
    },
    async getImageMeta(filepath: string) {
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
    },
    async getTextAssetContent(filepath: string, limit = 300) {
      try {
        const content = await fsp.readFile(filepath, 'utf-8')
        return content.slice(0, limit)
      }
      catch (e) {
        console.error(e)
        return undefined
      }
    },
  } satisfies Partial<ViteRPCFunctions>
}

function isSubPath(root: string, sub: string) {
  return resolve(sub).startsWith(resolve(root))
}
