/**
 * Which data layer the build in dist/ was made for: 'api' (a live store) or 'mock' (the demo).
 *
 * Read from the file vite.config.js writes next to the manifest, not from the environment, so a check that runs after
 * the build describes the build that is there.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist')

export function builtFor(dist = DIST) {
  // For a script run on its own (its tests), whatever dist/ holds.
  if (process.env.LOOM_BUILD_MODE) return process.env.LOOM_BUILD_MODE === 'api' ? 'api' : 'mock'
  try {
    return JSON.parse(fs.readFileSync(path.join(dist, '.vite', 'loom-build.json'), 'utf8')).dataSource === 'api' ? 'api' : 'mock'
  } catch {
    return 'mock'
  }
}
