/**
 * The storefront's own Vite config, with a separate dependency cache per e2e dev server.
 *
 * The suite runs two dev servers from the same checkout (one per store). Sharing
 * `node_modules/.vite` would have them optimise dependencies into the same
 * folder at the same time, and would clobber the cache of a `npm run dev` the
 * developer has open. Nothing else differs from `vite.config.js`.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, mergeConfig } from 'vite'
import base from '../../vite.config.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

export default defineConfig((env) =>
  mergeConfig(typeof base === 'function' ? base(env) : base, {
    root,
    cacheDir: path.join(root, 'node_modules', '.vite-e2e', process.env.LOOM_E2E_VITE_TAG || 'default'),
    clearScreen: false,
  }),
)
