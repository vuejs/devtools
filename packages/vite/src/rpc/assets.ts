import fsp from 'node:fs/promises'
import { debounce } from 'perfect-debounce'
import { getViteRpcServer } from '@vue/devtools-kit'
import type { AssetImporter, AssetInfo, AssetType, ImageMeta, ViteRPCFunctions } from '@vue/devtools-core'
import fg from 'fast-glob'
import { join, relative, resolve } from 'pathe'
import { imageMeta } from 'image-meta'
import { RpcFunctionCtx } from './types'

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
  if (/\.(?:png|jpe?g|jxl|gif|svg|webp|avif|ico|bmp|tiff?)$/i.test(path))
    return 'image'
  if (/\.(?:mp4|webm|ogv|mov|avi|flv|wmv|mpg|mpeg|mkv|3gp|3g2|ts|mts|m2ts|vob|ogm|ogx|rm|rmvb|asf|amv|divx|m4v|svi|viv|f4v|f4p|f4a|f4b)$/i.test(path))
    return 'video'
  if (/\.(?:mp3|wav|ogg|flac|aac|wma|alac|ape|ac3|dts|tta|opus|amr|aiff|au|mid|midi|ra|rm|wv|weba|dss|spx|vox|tak|dsf|dff|dsd|cda)$/i.test(path))
    return 'audio'
  if (/\.(?:woff2?|eot|ttf|otf|ttc|pfa|pfb|pfm|afm)/i.test(path))
    return 'font'
  if (/\.(?:json[5c]?|te?xt|[mc]?[jt]sx?|md[cx]?|markdown|ya?ml|toml)/i.test(path))
    return 'text'
  if (/\.wasm/i.test(path))
    return 'wasm'
  return 'other'
}

export function getAssetsFunctions(ctx: RpcFunctionCtx) {
  const { server, config } = ctx

  const _imageMetaCache = new Map<string, ImageMeta | undefined>()
  let cache: AssetInfo[] | null = null

  async function scan() {
    const dir = resolve(config.root)
    const baseURL = config.base

    // publicDir in ResolvedConfig is an absolute path
    const publicDir = config.publicDir
    const relativePublicDir = publicDir === '' ? '' : `${relative(dir, publicDir)}/`

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
      // wasm
      '**/*.wasm',
    ], {
      cwd: dir,
      onlyFiles: true,
      caseSensitiveMatch: false,
      ignore: [
        '**/node_modules/**',
        '**/dist/**',
        '**/package-lock.*',
        '**/pnpm-lock.*',
        '**/pnpm-workspace.*',
      ],
    })

    cache = await Promise.all(files.map(async (relativePath) => {
      const filePath = resolve(dir, relativePath)
      const stat = await fsp.lstat(filePath)
      // remove public prefix to resolve vite assets warning
      const path = relativePath.replace(relativePublicDir, '')
      return {
        path,
        relativePath,
        publicPath: join(baseURL, path),
        filePath,
        type: guessType(relativePath),
        size: stat.size,
        mtime: stat.mtimeMs,
      }
    }))
    return cache
  }

  async function getAssetImporters(url: string) {
    const importers: AssetImporter[] = []

    const moduleGraph = server.moduleGraph
    const module = await moduleGraph.getModuleByUrl(url)

    if (module) {
      for (const importer of module.importers) {
        importers.push({
          url: importer.url,
          id: importer.id,
        })
      }
    }

    return importers
  }

  const debouncedAssetsUpdated = debounce(() => {
    getViteRpcServer<ViteRPCFunctions>?.()?.broadcast?.emit('assetsUpdated')
  }, 100)

  server.watcher.on('all', (event) => {
    if (event !== 'change')
      debouncedAssetsUpdated()
  })

  return {
    async getStaticAssets() {
      return await scan()
    },
    async getAssetImporters(url: string) {
      return await getAssetImporters(url)
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
  }
}
