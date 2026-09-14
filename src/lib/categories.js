/**
 * Category trees of any depth, and the trail down one.
 *
 * The shop page used to flatten exactly two levels, so a third-level category
 * was not in its list at all: the page could not find its own name and titled
 * itself "All products". Breadcrumbs had the matching problem the other way
 * round, and printed a slug where a name belonged.
 */

/** Every category in a tree, parents before their children, each with its `parent` filled in. */
export function flattenCategories(tree = []) {
  const out = []
  const walk = (nodes, parent) => {
    for (const c of nodes || []) {
      out.push({ ...c, parent: c.parent ?? parent ?? null })
      walk(c.children, c.slug)
    }
  }
  walk(tree, null)
  return out
}

/** `[{ slug, name }]` from the root down to `slug`: the category's own `path` when sent, its parents walked when not. */
export function categoryTrail(slug, flat = []) {
  const bySlug = new Map(flat.map((c) => [c.slug, c]))
  const own = bySlug.get(slug)
  if (own?.path?.length) return own.path.map((step) => ({ slug: step.slug, name: step.name }))
  const out = []
  const seen = new Set()
  for (let c = own; c && !seen.has(c.slug); c = c.parent ? bySlug.get(c.parent) : null) {
    seen.add(c.slug)
    out.unshift({ slug: c.slug, name: c.name })
  }
  return out
}

/**
 * The trail to a product: its own `breadcrumbs`, or the deepest of its
 * categories found in the tree. A slug is the last resort, for a category the
 * tree does not know, and never the first.
 */
export function productTrail(product, tree) {
  if (product?.breadcrumbs?.length) return product.breadcrumbs
  const flat = flattenCategories(tree || [])
  const best = (product?.categories || [])
    .map((slug) => categoryTrail(slug, flat))
    .reduce((a, b) => (b.length > a.length ? b : a), [])
  return best.length ? best : (product?.categories || []).slice(0, 1).map((slug) => ({ slug, name: slug }))
}
