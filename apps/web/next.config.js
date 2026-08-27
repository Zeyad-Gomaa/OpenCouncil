const { PHASE_DEVELOPMENT_SERVER } = require('next/constants')
const { version } = require('../../package.json')

/** The chamber UI ships as a static export that the Fastify process serves, so
 * in production the browser and the API share an origin and `/api/v1` is a
 * plain relative fetch.
 *
 * `next dev` has no such luxury: it owns :3000 while the API listens on :4311.
 * Rewrites bridge that gap, but they are incompatible with `output: 'export'`,
 * so the export mode is applied only when actually building.
 *
 * @type {(phase: string) => import('next').NextConfig}
 */
module.exports = (phase) => {
  const isDev = phase === PHASE_DEVELOPMENT_SERVER
  const apiOrigin = process.env.OPEN_COUNCIL_API_ORIGIN ?? 'http://127.0.0.1:4311'

  return {
    reactStrictMode: true,
    trailingSlash: true,
    images: { unoptimized: true },
    // The static export is committed to the repo so that installing from git
    // does not rebuild Next.js. A random build id would make every rebuild a
    // spurious diff, so tie it to the release instead.
    generateBuildId: async () => `v${version}`,
    ...(isDev
      ? {
          // `trailingSlash` would otherwise redirect /api/v1/health to
          // /api/v1/health/ before the rewrite ever sees it.
          skipTrailingSlashRedirect: true,
          rewrites: async () => [{ source: '/api/:path*', destination: `${apiOrigin}/api/:path*` }],
        }
      : { output: 'export' }),
  }
}
