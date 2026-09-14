/**
 * Writes a Content-Security-Policy into every built HTML file.
 *
 *   npm run build     # runs this last, after prerender, sitemap and robots
 *
 * Last, because the policy lists the hash of every inline script, and the
 * prerenderer is what writes them: the API cache seed and the docs seed differ
 * on every page. Run it before prerendering and every page would ship a policy
 * that refuses its own data.
 *
 * The API origin comes from the same VITE_ variables Vite built the bundle
 * with — `.env`, `.env.local` and the environment, in Vite's order — so the
 * policy allows exactly the backend the JavaScript will call.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'
import { apiOriginFrom, applyCsp, inlineHandlers, inlineScriptHashes } from './lib/csp.mjs'
import { builtFor } from './lib/build-mode.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(ROOT, 'dist')

async function htmlFiles(dir) {
  const out = []
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await htmlFiles(full)))
    else if (entry.name.endsWith('.html')) out.push(full)
  }
  return out
}

async function main() {
  if (builtFor() === 'api') {
    // Every page of a live store is rendered on request, with its own data script: the handler sends the policy as a header.
    console.log('[csp] live store: the render handler sends the policy with each page')
    return
  }
  const env = { ...loadEnv('production', ROOT, 'VITE_') }
  const apiOrigin = apiOriginFrom(env)

  const files = await htmlFiles(DIST).catch(() => {
    throw new Error('dist/ does not exist — run `vite build` first.')
  })
  if (!files.length) throw new Error('dist/ has no HTML files to protect.')

  let hashes = 0
  for (const file of files) {
    const html = await fs.readFile(file, 'utf8')
    for (const handler of inlineHandlers(html)) {
      console.warn(`[csp] ${path.relative(DIST, file)} has an inline event handler the policy will block: ${handler.slice(0, 80)}`)
    }
    const out = applyCsp(html, { apiOrigin })
    hashes += inlineScriptHashes(out).length
    await fs.writeFile(file, out)
  }

  console.log(
    `[csp] ${files.length} pages, ${hashes} inline script hashes, api ${apiOrigin || 'none (same origin or demo data)'}`,
  )
}

main().catch((err) => {
  console.error(`[csp] ${err.message}`)
  process.exit(1)
})
