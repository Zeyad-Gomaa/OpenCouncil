'use strict'
/** Runs on git-dependency installs (npm auto-executes `prepare` for git deps).
 * Skips the build when prebuilt artifacts are already committed. */
const fs = require('node:fs')
const { execSync } = require('node:child_process')

// `apps/server/dist/public` is what actually ships and gets served; the
// intermediate `apps/web/out` is not published, so don't gate on it.
if (fs.existsSync('apps/server/dist/cli.js') && fs.existsSync('apps/server/dist/public/index.html')) {
  console.log('[opencouncil] prebuilt artifacts present — skipping build')
} else {
  console.log('[opencouncil] building…')
  execSync('npm run build', { stdio: 'inherit' })
}
