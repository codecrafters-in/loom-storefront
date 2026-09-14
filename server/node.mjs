#!/usr/bin/env node
/**
 * The storefront as a Node server, for any VPS or container:
 *
 *   npm run build && npm start          # PORT=3000 by default
 *
 * Files in `dist/` are served as they are (hashed assets cached for a year); every other address goes to the render
 * handler. Put a CDN or a reverse proxy with caching in front for a busy store: pages carry `CDN-Cache-Control`.
 */
import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createHandler, SECURITY_HEADERS } from './handler.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.map': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.woff': 'font/woff', '.woff2': 'font/woff2', '.mp4': 'video/mp4',
  '.webm': 'video/webm', '.pdf': 'application/pdf',
}

/** A file in `dist/` for this path (`/product/x` also finds a prerendered `product/x.html`), or null. */
export async function findFile(dist, pathname) {
  let relative
  try {
    relative = decodeURIComponent(pathname)
  } catch {
    return null
  }
  // No hidden files (the build manifest) and no way out of dist/.
  if (relative.includes('\0') || relative.split('/').some((part) => part.startsWith('.'))) return null
  const base = path.join(dist, path.normalize(relative))
  if (base !== dist && !base.startsWith(dist + path.sep)) return null
  for (const candidate of [base, `${base}.html`, path.join(base, 'index.html')]) {
    try {
      if ((await fs.stat(candidate)).isFile()) return candidate
    } catch {
      /* not this one */
    }
  }
  return null
}

function staticHeaders(file, dist) {
  const rel = path.relative(dist, file)
  return {
    ...SECURITY_HEADERS,
    'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'cache-control': rel.startsWith(`assets${path.sep}`) || rel.startsWith(`images${path.sep}`)
      ? 'public, max-age=31536000, immutable'
      : file.endsWith('.html') ? 'public, max-age=0, must-revalidate' : 'public, max-age=3600',
  }
}

export async function createNodeServer({ dist = path.join(ROOT, 'dist'), build = path.join(ROOT, 'server-build'), env = process.env } = {}) {
  const bundleFile = path.join(build, 'entry-server.js')
  const handle = existsSync(bundleFile)
    ? createHandler({
        loadBundle: () => import(pathToFileURL(bundleFile).href),
        template: () => import(pathToFileURL(path.join(build, 'template.js')).href).then((m) => m.default),
        env,
      })
    : null
  if (!handle) console.warn(`[server] no ${path.relative(ROOT, bundleFile)}: serving dist/ as a single-page app. Run npm run build.`)

  return http.createServer(async (req, res) => {
    try {
      const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost'
      const protocol = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0]
      const url = new URL(req.url || '/', `${protocol}://${host}`)
      const file = await findFile(dist, url.pathname)
      const fallback = !handle && !file ? await findFile(dist, '/index.html') : null
      if (file || fallback) {
        const chosen = file || fallback
        res.writeHead(200, staticHeaders(chosen, dist))
        return res.end(req.method === 'HEAD' ? undefined : await fs.readFile(chosen))
      }
      if (!handle) {
        res.writeHead(404, { 'content-type': 'text/plain' })
        return res.end('Not found')
      }
      const headers = new Headers()
      for (const [name, value] of Object.entries(req.headers)) if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value)
      const response = await handle(new Request(url, { method: req.method, headers }))
      res.writeHead(response.status, Object.fromEntries(response.headers))
      res.end(req.method === 'HEAD' ? undefined : Buffer.from(await response.arrayBuffer()))
    } catch (err) {
      console.error('[server]', err)
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain' })
      res.end('Server error')
    }
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 3000)
  const server = await createNodeServer()
  server.listen(port, () => console.log(`[server] storefront on http://localhost:${port}`))
}
