/**
 * Vercel: every address without a file in dist/ comes here (see the rewrites in vercel.json).
 * Environment variables: SITE_URL, LOOM_CDN_SECONDS, LOOM_STALE_SECONDS, LOOM_WEBHOOK_SECRET (docs/DEPLOY.md).
 */
import { createHandler } from '../server/handler.mjs'

const handle = createHandler({
  loadBundle: () => import('../server-build/entry-server.js'),
  template: () => import('../server-build/template.js').then((m) => m.default),
  env: process.env,
})

export const GET = (request) => handle(request)
export const HEAD = GET
// Cache purges from Odoo (`/__loom/revalidate`).
export const POST = GET
