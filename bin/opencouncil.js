#!/usr/bin/env node
/**
 * OpenCouncil launcher.
 *
 * In a git/global install the compiled CLI lives at apps/server/dist/cli.js
 * (built by postinstall). This shim forwards to it so `opencouncil` works from
 * any install method. If the build is missing, it prints guidance.
 */
'use strict'

const { existsSync } = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const here = path.dirname(__filename)
const cli = path.join(here, '..', 'apps', 'server', 'dist', 'cli.js')

if (!existsSync(cli)) {
  console.error(
    '[opencouncil] Compiled server not found.\n\n' +
      'If you cloned the repo, run:\n' +
      '  npm install && npm run build\n\n' +
      'Then start again with: opencouncil   (or: npm start)',
  )
  process.exit(1)
}

import(pathToFileURL(cli).href).catch((err) => {
  console.error('[opencouncil] fatal:', err)
  process.exit(1)
})
