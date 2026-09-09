import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ isSsrBuild }) => ({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        /**
         * Split the two big libraries out of the app chunk, so a change to a
         * component does not invalidate 160KB of React for every returning
         * visitor.
         *
         * Not for the server bundle. There, React is an external that Node
         * resolves itself, and Rollup refuses to put an external in a manual
         * chunk — the prerender build fails outright rather than warning.
         */
        ...(isSsrBuild
          ? {}
          : { manualChunks: { react: ['react', 'react-dom'], router: ['react-router-dom'] } }),
      },
    },
  },
}))
