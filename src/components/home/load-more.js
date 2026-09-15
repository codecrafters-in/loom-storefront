/**
 * The newer home section types (sections-more.jsx) are a chunk of their own.
 *
 * Most home pages use a few of them or none, and every page's first download already carries the older types, so
 * these load when a page has one. The chunk is loaded before anything renders it wherever that matters: on the server
 * before every render (entry-server.jsx), because `renderToString` would otherwise write nothing for them, and in the
 * browser before hydrating a page that has one (main.jsx), so the server's markup is adopted as it is rather than
 * waiting on the chunk while the rest of the page updates around it.
 */

let loaded = null
let loading = null

export function loadMoreSections() {
  loading ||= import('./sections-more.jsx').then(
    (module) => (loaded = module),
    (error) => {
      // A failed download (a deploy replaced the chunk, a dropped connection) is tried again next time.
      loading = null
      throw error
    },
  )
  return loading
}

/** The module once it is in, else null. */
export const moreSections = () => loaded

/** Marks the root element of each of these sections, so the browser knows the page it is about to hydrate has one. */
export const MARKER = 'data-home-section'
