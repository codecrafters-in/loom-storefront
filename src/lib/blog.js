/**
 * The blog, only for a store that has it on (`features.blog`).
 *
 * Switched off in Odoo, `/blog` and its posts answer the not-found page, and no menu or footer link leads there: a
 * link the merchant added by hand before switching the blog off would otherwise open a page that is not there.
 * Only an explicit `false` turns it off, so a backend that does not send the key keeps the blog it had.
 */
export const blogEnabled = (config) => config?.features?.blog !== false

/** `/blog`, `/blog/a-post`, `/blog?tag=news`: an address inside the blog. */
export const isBlogPath = (to) => typeof to === 'string' && /^\/blog(?:[/?#]|$)/.test(to)

/**
 * Menu entries (with `children`) or footer columns (with `links`) without the blog's addresses when the blog is off.
 * A footer column left with no links goes too, rather than showing a title over nothing.
 */
export function withoutBlogLinks(items, config) {
  if (!Array.isArray(items)) return []
  if (blogEnabled(config)) return items
  const out = []
  for (const item of items) {
    if (!item || isBlogPath(item.to)) continue
    const next = { ...item }
    if (Array.isArray(item.children)) next.children = withoutBlogLinks(item.children, config)
    if (Array.isArray(item.links)) {
      next.links = withoutBlogLinks(item.links, config)
      if (item.links.length > 0 && next.links.length === 0) continue
    }
    out.push(next)
  }
  return out
}
