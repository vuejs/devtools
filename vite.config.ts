import { defineConfig } from 'vite-plus'

const ignorePatterns = [
  'dist/**',
  'packages/*/dist/**',
  'coverage/**',
  'node_modules/**',
  '.vite/**',
  '.turbo/**',
]

export default defineConfig({
  lint: {
    ignorePatterns,
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {
    ignorePatterns,
    printWidth: 100,
    semi: false,
    singleQuote: true,
    sortPackageJson: true,
    trailingComma: 'all',
  },
  run: {
    cache: true,
  },
})
