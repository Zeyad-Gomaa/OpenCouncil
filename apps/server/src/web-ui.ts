/** Serve the Next static export without registering a GET * that swallows API routes. */
import { createReadStream, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import type { FastifyInstance } from 'fastify'

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

function sendExistingFile(
  reply: { type: (t: string) => unknown; sendFile: (rel: string) => unknown },
  webOutDir: string,
  abs: string,
): boolean {
  if (!existsSync(abs) || !statSync(abs).isFile()) return false
  const rel = path.relative(webOutDir, abs)
  if (abs.endsWith('.html')) {
    reply.type('text/html; charset=utf-8')
  }
  reply.sendFile(rel)
  return true
}

export async function registerWebUi(app: FastifyInstance, webOutDir: string): Promise<boolean> {
  if (!existsSync(webOutDir) || !statSync(webOutDir).isDirectory()) {
    app.setNotFoundHandler((_req, reply) => {
      reply.status(404).send({ error: { code: 'not_found', message: 'no such route' } })
    })
    return false
  }

  const staticHandler = (await import('@fastify/static')).default
  // `serve: false` only decorates reply.sendFile — it must not register GET /*
  // (that catch-all is what 404'd OpenRouter "Pull models" as "no such API route").
  await app.register(staticHandler, {
    root: webOutDir,
    prefix: '/',
    wildcard: false,
    serve: false,
    decorateReply: true,
    index: ['index.html'],
  })

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
    if (direct && sendExistingFile(reply, webOutDir, direct)) return

    const dirIndex = resolvePublicFile(webOutDir, path.posix.join(rawPath, 'index.html'))
    if (dirIndex && sendExistingFile(reply, webOutDir, dirIndex)) return

    const htmlNamed = resolvePublicFile(webOutDir, `${rawPath.replace(/\/+$/, '')}.html`)
    if (htmlNamed && sendExistingFile(reply, webOutDir, htmlNamed)) return

    const rootIndex = path.join(webOutDir, 'index.html')
    if (existsSync(rootIndex)) {
      reply.type('text/html; charset=utf-8').send(createReadStream(rootIndex))
      return
    }

    const fallback = path.join(webOutDir, '404.html')
    if (existsSync(fallback)) {
      reply.status(404).type('text/html; charset=utf-8').send(createReadStream(fallback))
      return
    }
    reply.status(404).send({ error: { code: 'not_found', message: 'no such route' } })
  })

  return true
}
