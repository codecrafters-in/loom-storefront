/**
 * S-12's storefront: built for store `e2e` and served by the render handler (server/node.mjs), as a host would.
 *
 * Playwright starts it (playwright.config.js). It builds into e2e/.render/ so the checkout's own dist/ and
 * server-build/ are left alone, then serves pages rendered on request — which is what lets S-12 ask for a product
 * created in Odoo after the build.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'vite'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = path.join(ROOT, 'e2e', '.render')
const DIST = path.join(OUT, 'dist')
const SERVER = path.join(OUT, 'server-build')
const configFile = path.join(ROOT, 'e2e', 'support', 'vite.config.mjs')
const port = Number(process.env.PORT || 5176)

process.chdir(ROOT)
await build({ configFile, logLevel: 'warn', build: { outDir: DIST, emptyOutDir: true } })
await build({
  configFile,
  logLevel: 'warn',
  build: { ssr: 'src/entry-server.jsx', outDir: SERVER, emptyOutDir: true, copyPublicDir: false, rollupOptions: { output: { format: 'es' } } },
})
const template = await fs.readFile(path.join(DIST, 'index.html'), 'utf8')
await fs.writeFile(path.join(SERVER, 'template.js'), `export default ${JSON.stringify(template)}\n`)
// As the build does for a live store: static files would answer before the handler.
for (const file of ['index.html', '_redirects', 'robots.txt']) await fs.rm(path.join(DIST, file), { force: true })

const { createNodeServer } = await import(pathToFileURL(path.join(ROOT, 'server', 'node.mjs')).href)
const server = await createNodeServer({ dist: DIST, build: SERVER, env: process.env })
server.listen(port, () => console.log(`[e2e] rendered storefront on http://localhost:${port}`))
