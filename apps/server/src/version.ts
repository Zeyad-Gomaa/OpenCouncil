/** The shipped version, read once from the package manifest.
 *
 * Bundled output lands in apps/server/dist, so the manifest is three levels up
 * both in a source checkout and inside node_modules/opencouncil.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

function read(): string {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url))
    const pkg = JSON.parse(readFileSync(path.join(here, '..', '..', '..', 'package.json'), 'utf8')) as {
      version?: string
    }
    return pkg.version ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

export const VERSION = read()
