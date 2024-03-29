const path = require('node:path')
const base = require('../../tailwind.config.js')

base.purge.content.push(
  path.resolve(__dirname, './src/**/*.{js,jsx,ts,tsx,vue}'),
)

base.corePlugins = {
  preflight: false,
}

module.exports = base
