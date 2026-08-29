'use strict'

const fs = require('node:fs')
const path = require('node:path')

const roots = [
  path.resolve(__dirname, '..', 'apps', 'server', 'dist', 'public'),
  path.resolve(__dirname, '..', 'apps', 'web', '.next'),
  path.resolve(__dirname, '..', 'apps', 'web', 'out'),
]
const duplicate = / \d+(?=\.|$)/
let removed = 0

function clean(dir) {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name)
    if (duplicate.test(entry.name)) {
      fs.rmSync(target, { recursive: true, force: true })
      removed++
    } else if (entry.isDirectory()) {
      clean(target)
    }
  }
}

for (const root of roots) clean(root)
console.log(`[opencouncil] removed ${removed} duplicate generated artifact${removed === 1 ? '' : 's'}`)
