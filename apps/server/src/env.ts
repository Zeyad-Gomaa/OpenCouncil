/** Loads a `.env` file into process.env before any config is read.
 *
 * Node does not read `.env` on its own. The README tells operators to put
 * OPEN_COUNCIL_SECRET_KEY there, so without this the vault key is never seen
 * and every stored provider API key silently becomes unreadable on the next
 * restart. `process.loadEnvFile` leaves already-set variables alone, so a real
 * environment variable always beats the file.
 */
import path from 'node:path'

/** Reads `.env` from the working directory (override with OPEN_COUNCIL_ENV_FILE).
 * Returns the file that was applied, or null when there was nothing to load. */
export function loadEnvFile(cwd: string = process.cwd()): string | null {
  const override = process.env.OPEN_COUNCIL_ENV_FILE
  const file = override ? path.resolve(cwd, override) : path.join(cwd, '.env')
  try {
    process.loadEnvFile(file)
    return file
  } catch (error) {
    // A missing default `.env` is the normal case, not a problem worth reporting.
    if (!override && (error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw new Error(`could not read env file ${file}: ${error instanceof Error ? error.message : String(error)}`)
  }
}
