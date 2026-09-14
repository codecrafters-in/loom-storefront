/**
 * What a crawler that does not run JavaScript reads from a page's `<head>`.
 *
 * Deliberately regex-based and dependency-free: the question is what is in the
 * raw bytes, and a real DOM parser would be one more thing to install for a
 * check that only needs tags and attributes.
 */
const attr = (tag, name) => {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'))
  return match ? decode(match[2] ?? match[3]) : undefined
}

const decode = (s) =>
  s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

export function readHead(html) {
  const head = (html.match(/<head[^>]*>([\s\S]*?)<\/head>/i) || [, html])[1]
  const titles = [...head.matchAll(/<title[^>]*>([\s\S]*?)<\/title>/gi)].map((m) => decode(m[1].trim()))
  const meta = {}
  for (const [tag] of head.matchAll(/<meta\b[^>]*>/gi)) {
    const key = attr(tag, 'property') || attr(tag, 'name')
    // The first one wins, as it does for most scrapers.
    if (key && !(key in meta)) meta[key] = attr(tag, 'content')
  }
  const canonicalTag = head.match(/<link\b[^>]*rel\s*=\s*["']canonical["'][^>]*>/i)
  const jsonld = []
  for (const [, body] of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(body)
      jsonld.push(...(Array.isArray(data) ? data : data['@graph'] || [data]))
    } catch {
      jsonld.push({ invalid: body.slice(0, 200) })
    }
  }
  return { title: titles[0] || '', meta, canonical: canonicalTag ? attr(canonicalTag[0], 'href') : undefined, jsonld }
}
