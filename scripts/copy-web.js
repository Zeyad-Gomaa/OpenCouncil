'use strict'

const fs = require('node:fs')
const path = require('node:path')

const source = path.resolve(__dirname, '..', 'apps', 'web', 'out')
const target = path.resolve(__dirname, '..', 'apps', 'server', 'dist', 'public')

if (!fs.existsSync(source)) {
  throw new Error(`[opencouncil] Static export not found at ${source}. Run next build first.`)
}

fs.rmSync(target, { recursive: true, force: true })
fs.cpSync(source, target, {
  recursive: true,
  filter: (src) => {
    const base = path.basename(src)
    // macOS/iCloud duplicate folders ("404 2", "_next 3") must not ship.
    return !/ \d+$/.test(base)
  },
})
console.log(`[opencouncil] copied static UI to ${path.relative(process.cwd(), target)}`)
