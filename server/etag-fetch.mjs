/**
 * `fetch` with a memory of the API's ETags, for the render handler.
 *
 * In a browser, the HTTP cache revalidates a catalogue answer with `If-None-Match` and Odoo answers `304 Not Modified`
 * when nothing changed: a few bytes instead of the whole product. Node and worker runtimes have no HTTP cache, so every
 * render would download every answer again. This keeps the last answer per address (and language and currency) and
 * asks the question the browser would. Only anonymous GETs: nothing here is per customer.
 */
export function etagFetch(inner, { max = 500 } = {}) {
  const entries = new Map()

  async function fetchWithEtags(input, init = {}) {
    // Server runtimes do not implement request cache modes; the storefront's own setting means nothing here.
    const { cache: _mode, ...rest } = init // eslint-disable-line no-unused-vars
    const method = String(rest.method || 'GET').toUpperCase()
    const headers = new Headers(rest.headers)
    if (method !== 'GET' || headers.has('authorization')) return inner(input, { ...rest, headers })

    const key = [String(input), headers.get('x-loom-lang') || '', headers.get('x-loom-pricelist') || ''].join('\n')
    const known = entries.get(key)
    if (known) headers.set('if-none-match', known.etag)
    const response = await inner(input, { ...rest, headers })

    if (response.status === 304 && known) {
      entries.delete(key)
      entries.set(key, known)
      return new Response(known.body, { status: 200, headers: known.headers })
    }
    const etag = response.headers.get('etag')
    if (response.status === 200 && etag) {
      entries.delete(key)
      entries.set(key, { etag, body: await response.clone().text(), headers: [...response.headers] })
      if (entries.size > max) entries.delete(entries.keys().next().value)
    }
    return response
  }

  fetchWithEtags.etagCache = entries
  return fetchWithEtags
}
