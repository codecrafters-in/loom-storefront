/**
 * The documentation page (Docs.jsx, with its markdown renderer) is a chunk of its own.
 *
 * Only the demo and the storefront admin show documentation, so a live store's shoppers never download it. The chunk
 * is loaded before anything renders it wherever that matters: on the server before every render (entry-server.jsx
 * `prime`), because `renderToString` writes nothing for code still loading, and in the browser before hydrating a
 * documentation page (main.jsx), so the server's markup is adopted as it is.
 */
let loaded = null
let loading = null

export function loadDocsPage() {
  loading ||= import('./Docs.jsx').then(
    (module) => (loaded = module.default),
    (error) => {
      // A failed download is tried again next time.
      loading = null
      throw error
    },
  )
  return loading
}

/** The page component once it is in, else null. */
export const docsPage = () => loaded
