/**
 * Vercel: every address without a file in dist/ comes here (see the rewrites in vercel.json).
 * Environment variables: SITE_URL, LOOM_CDN_SECONDS, LOOM_STALE_SECONDS (docs/DEPLOY.md).
 */
import { createHandler } from '../server/handler.mjs'

const handle = createHandler({
  loadBundle: () => import('../server-build/entry-server.js'),
  template: () => import('../server-build/template.js').then((m) => m.default),
  env: process.env,
})

export const GET = (request) => handle(request)
export const HEAD = GET
