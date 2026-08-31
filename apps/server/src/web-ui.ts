/** Serve the Next static export without registering a GET * that swallows API routes. */
import { createReadStream, existsSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
}

export function isApiUrl(url: string): boolean {
  const pathname = url.split('?')[0] || ''
  return pathname === '/api' || pathname.startsWith('/api/')
}

/** Resolve a URL path to a file under the UI root, or null if it would escape. */
export function resolvePublicFile(webOutDir: string, urlPath: string): string | null {
  let decoded: string
  try {
    decoded = decodeURIComponent((urlPath.split('?')[0] || '/').replace(/^\/+/, ''))
  } catch {
    return null
  }
  if (decoded.includes('\0')) return null
  const root = path.resolve(webOutDir)
  const resolved = path.resolve(root, decoded)
  const prefix = root.endsWith(path.sep) ? root : root + path.sep
  if (resolved !== root && !resolved.startsWith(prefix)) return null
  return resolved
}

function sendExistingFile(req: FastifyRequest, reply: FastifyReply, realWebOutDir: string, abs: string): boolean {
  let realFile: string
  let stat: ReturnType<typeof statSync>
  try {
    realFile = realpathSync(abs)
    stat = statSync(realFile)
  } catch {
    return false
  }

  // Reject symlinks (including a symlinked parent directory) that leave the
  // static export, even if the lexical path passed resolvePublicFile().
  const relative = path.relative(realWebOutDir, realFile)
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return false

  if (!stat.isFile()) return false
  const extension = path.extname(realFile).toLowerCase()
  const etag = `W/"${stat.size.toString(16)}-${Math.trunc(stat.mtimeMs).toString(16)}"`
  const immutable = relative.split(path.sep).slice(0, 2).join('/') === '_next/static'

  reply.header('ETag', etag)
  reply.header('Cache-Control', immutable ? 'public, max-age=31536000, immutable' : 'no-cache')
  if (req.headers['if-none-match']?.split(',').some((candidate) => candidate.trim() === etag)) {
    reply.status(304).send()
    return true
  }

  reply.type(CONTENT_TYPES[extension] ?? 'application/octet-stream')
  reply.header('Content-Length', stat.size)
  reply.send(createReadStream(realFile))
  return true
}

export async function registerWebUi(app: FastifyInstance, webOutDir: string): Promise<boolean> {
  if (!existsSync(webOutDir) || !statSync(webOutDir).isDirectory()) {
    app.setNotFoundHandler((_req, reply) => {
      reply.status(404).send({ error: { code: 'not_found', message: 'no such route' } })
    })
    return false
  }
  const realWebOutDir = realpathSync(webOutDir)

  app.setNotFoundHandler((req, reply) => {
    if (isApiUrl(req.url)) {
      const pathname = req.url.split('?')[0] || req.url
      reply.status(404).send({
        error: {
          code: 'not_found',
          message: `no such API route: ${req.method} ${pathname}. If you just updated OpenCouncil, restart the process.`,
        },
      })
      return
    }

    const rawPath = req.url.split('?')[0] || '/'
    const direct = resolvePublicFile(webOutDir, rawPath)
    if (direct && sendExistingFile(req, reply, realWebOutDir, direct)) return

    const dirIndex = resolvePublicFile(webOutDir, path.posix.join(rawPath, 'index.html'))
    if (dirIndex && sendExistingFile(req, reply, realWebOutDir, dirIndex)) return

    const htmlNamed = resolvePublicFile(webOutDir, `${rawPath.replace(/\/+$/, '')}.html`)
    if (htmlNamed && sendExistingFile(req, reply, realWebOutDir, htmlNamed)) return

    const rootIndex = path.join(webOutDir, 'index.html')
    if (sendExistingFile(req, reply, realWebOutDir, rootIndex)) return

    const fallback = path.join(webOutDir, '404.html')
    reply.status(404)
    if (sendExistingFile(req, reply, realWebOutDir, fallback)) return
    reply.status(404).send({ error: { code: 'not_found', message: 'no such route' } })
  })

  return true
}
