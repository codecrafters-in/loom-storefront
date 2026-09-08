/**
 * Stable identity for a home rail's data source.
 *
 * Shared by the bootstrap builder and the section renderer: the server keys its
 * prefetched rails by this, the client looks them up by the same function.
 * Object key order must not produce a second entry, so the fields are written
 * out explicitly rather than serialised as-is.
 */
export function railKey(source = {}) {
  return JSON.stringify({
    sort: source.sort || 'featured',
    category: source.category || null,
    collection: source.collection || null,
    tags: source.tags || null,
    limit: source.limit || 4,
  })
}

export default railKey
