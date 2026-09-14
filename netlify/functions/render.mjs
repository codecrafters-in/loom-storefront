/**
 * Netlify: every address without a file in dist/ (`preferStatic`) comes here.
 * Environment variables: SITE_URL, LOOM_CDN_SECONDS, LOOM_STALE_SECONDS (docs/DEPLOY.md).
 */
import { createHandler } from '../../server/handler.mjs'

const handle = createHandler({
  loadBundle: () => import('../../server-build/entry-server.js'),
  template: () => import('../../server-build/template.js').then((m) => m.default),
  env: process.env,
})

export default (request) => handle(request)

export const config = { path: '/*', preferStatic: true }
