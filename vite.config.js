import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ isSsrBuild, mode }) => ({
  plugins: [react()],
  /**
   * Which data layer this build talks to, as a constant the bundler can read.
   *
   * `src/lib/api/index.js` imports both adapters and picks one. Picked at run
   * time, both ship: every visitor to a live store downloaded the whole demo
   * backend, and every demo visitor the HTTP client. With the answer known at
   * build time Rollup drops the other one — the largest single saving in the
   * first download. `loadEnv` sees the same variables the bundle does,
   * `.env.local` and the shell alike.
   */
  define: {
    __LOOM_API__: JSON.stringify((loadEnv(mode, process.cwd(), 'VITE_').VITE_DATA_SOURCE || 'mock').toLowerCase() === 'api'),
  },
  build: {
    // The manifest names the entry chunk and everything it pulls in, which is
    // what scripts/budget.mjs measures. Matching `dist/assets/index-*.js` by
    // filename breaks the first time the entry is renamed.
    manifest: true,
    rollupOptions: {
      output: {
        /**
         * One vendor chunk, so a change to a component does not invalidate
         * 160KB of library for every returning visitor.
         *
         * It used to be two — `react` and `router` — and that did not work.
         * `react-router-dom` imports React, so Rollup hoisted all of React into
         * the router chunk and emitted a **30-byte** `react` chunk that nothing
         * loaded: a wasted request and a comment describing something that was
         * not happening. They are downloaded together on the first paint
         * regardless, so one chunk is the honest shape. The split that actually
         * pays is app versus vendor, and that is the one kept.
         *
         * Not for the server bundle. There, React is an external that Node
         * resolves itself, and Rollup refuses to put an external in a manual
         * chunk — the prerender build fails outright rather than warning.
         */
        ...(isSsrBuild
          ? {}
          : { manualChunks: { vendor: ['react', 'react-dom', 'react-router-dom'] } }),
      },
    },
  },
}))
