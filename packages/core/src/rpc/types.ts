import type { ModuleNode } from 'vite'

// assets
export type AssetType = 'image' | 'font' | 'video' | 'audio' | 'text' | 'json' | 'wasm' | 'other'
export interface AssetInfo {
  path: string
  type: AssetType
  publicPath: string
  relativePath: string
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

export type AssetImporter = Pick<ModuleNode, 'url' | 'id'>

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

// graph
export interface ModuleInfo {
  id: string
  plugins: { name: string, transform?: number, resolveId?: number }[]
  deps: string[]
  virtual: boolean
}
