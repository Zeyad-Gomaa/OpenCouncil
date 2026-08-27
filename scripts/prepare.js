'use strict'
/** Runs on git-dependency installs (npm auto-executes `prepare` for git deps).
 * Skips the build when prebuilt artifacts are already committed.
 *
 * npm also runs `prepare` before `npm pack`, and `npm pack --silent` prints the
 * tarball name to stdout for callers to capture. Progress messages therefore go
 * to stderr — on stdout they end up inside `$(npm pack --silent)`. */
const fs = require('node:fs')
const { execSync } = require('node:child_process')

// `apps/server/dist/public` is what actually ships and gets served; the
// intermediate `apps/web/out` is not published, so don't gate on it.
if (fs.existsSync('apps/server/dist/cli.js') && fs.existsSync('apps/server/dist/public/index.html')) {
  console.error('[opencouncil] prebuilt artifacts present — skipping build')
} else {
  console.error('[opencouncil] building…')
  execSync('npm run build', { stdio: 'inherit' })
}
