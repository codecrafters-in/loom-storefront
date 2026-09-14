/**
 * The document head, as data.
 *
 * A single-page app has one `index.html`, so the title, the description, the
 * Open Graph card and the Product markup all have to be written at runtime —
 * and a crawler that does not run JavaScript sees none of it. Prerendering
 * fixes that, but only if the head can be produced *without* a DOM.
 *
 * So `Seo` builds a list of tags and this module either applies them to a real
 * document or hands them to the prerenderer. One description of the head, two
 * ways of realising it, and no chance of the two drifting.
 */

/** Collected during a server render. `null` in a browser, always. */
let sink = null

export function startCollecting() {
  sink = []
}

export function stopCollecting() {
  const tags = sink || []
  sink = null
  return tags
}

export function record(tags) {
  if (sink) sink.push(...tags)
}

export const collecting = () => sink !== null

/* ── applying, in a browser ────────────────────────────────────────────── */

export function applyHead(tags) {
  if (typeof document === 'undefined') return

  // A whole page's head: drop the previous page's language alternates this page does not have (a noindex page has
  // none). A partial update (the structured data, loaded later) leaves them alone.
  if (tags.some((tag) => tag.kind === 'link' && tag.rel === 'canonical')) {
    const languages = new Set(tags.filter((tag) => tag.kind === 'link' && tag.hreflang).map((tag) => tag.hreflang))
    for (const el of document.head.querySelectorAll('link[rel="alternate"][hreflang]')) {
      if (!languages.has(el.getAttribute('hreflang'))) el.remove()
    }
  }

  for (const tag of tags) {
    if (tag.kind === 'title') {
      document.title = tag.text
    } else if (tag.kind === 'meta') {
      upsert(`meta[${tag.attr}="${tag.key}"]`, 'meta', (el) => {
        el.setAttribute(tag.attr, tag.key)
        el.setAttribute('content', tag.content || '')
      })
    } else if (tag.kind === 'link') {
      // One link per rel, or per rel and language for `alternate` links (hreflang).
      const selector = tag.hreflang ? `link[rel="${tag.rel}"][hreflang="${tag.hreflang}"]` : `link[rel="${tag.rel}"]:not([hreflang])`
      upsert(selector, 'link', (el) => {
        el.setAttribute('rel', tag.rel)
        if (tag.hreflang) el.setAttribute('hreflang', tag.hreflang)
        el.setAttribute('href', tag.href)
      })
    } else if (tag.kind === 'jsonld') {
      const existing = document.getElementById(JSONLD_ID)
      if (!tag.data) {
        existing?.remove()
        continue
      }
      const el = existing || document.createElement('script')
      el.id = JSONLD_ID
      el.type = 'application/ld+json'
      el.textContent = JSON.stringify(tag.data)
      if (!existing) document.head.appendChild(el)
    }
  }
}

const JSONLD_ID = 'seo-jsonld'

function upsert(selector, tagName, set) {
  let el = document.head.querySelector(selector)
  if (!el) {
    el = document.createElement(tagName)
    document.head.appendChild(el)
  }
  set(el)
}

/* ── rendering, for the prerenderer ────────────────────────────────────── */

/**
 * `</script>` inside JSON-LD would close the script tag early and hand the rest
 * of the payload to the HTML parser. Product descriptions come from merchants,
 * so this is not hypothetical.
 */
const escapeJson = (value) =>
  JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')

const escapeAttr = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

/**
 * The identity of a tag, for the purpose of "there is only one of these".
 *
 * A page can render more than one `Seo` — a layout default and a route's own —
 * and in a document the second simply overwrites the first. Emitting both into
 * static HTML does not overwrite anything: a browser keeps the *first* title it
 * meets, so the generic one wins and every page shares it. Which is the bug
 * prerendering was supposed to fix.
 */
const identity = (tag) =>
  tag.kind === 'meta' ? `meta:${tag.attr}:${tag.key}` : tag.kind === 'link' ? `link:${tag.rel}:${tag.hreflang || ''}` : tag.kind

export function renderHead(tags) {
  const last = new Map()
  for (const tag of tags) last.set(identity(tag), tag)

  const out = []
  for (const tag of last.values()) {
    if (tag.kind === 'title') out.push(`<title>${escapeAttr(tag.text)}</title>`)
    else if (tag.kind === 'meta') out.push(`<meta ${tag.attr}="${escapeAttr(tag.key)}" content="${escapeAttr(tag.content)}">`)
    else if (tag.kind === 'link') {
      const lang = tag.hreflang ? ` hreflang="${escapeAttr(tag.hreflang)}"` : ''
      out.push(`<link rel="${escapeAttr(tag.rel)}"${lang} href="${escapeAttr(tag.href)}">`)
    }
    else if (tag.kind === 'jsonld' && tag.data)
      out.push(`<script type="application/ld+json" id="${JSONLD_ID}">${escapeJson(tag.data)}</script>`)
  }
  return out.join('\n    ')
}
