/**
 * Fetches every image the storefront needs and writes optimised JPEGs into
 * public/images/.
 *
 *   npm run images         # only fetch what is missing
 *   npm run images:force   # re-fetch everything
 *
 * The first run resolves each query through Unsplash search and writes the
 * chosen photo ids into scripts/images.lock.json. Every run after that reads
 * the lockfile, so the same commit always produces the same store — search
 * results drift, and a catalogue whose photography changes under you is not a
 * catalogue you can design against.
 *
 * Delete an entry from the lockfile to re-roll just that image. Pin an entry by
 * hand (`{ "id": "<photo id>" }`) to overrule the search for one slot.
 *
 * Unsplash photos are free to use commercially. Photographer credits are
 * written to public/images/CREDITS.md.
 *
 * Picking a photograph is three checks, in this order, because each one is a
 * different way the catalogue used to end up wrong:
 *
 *   1. Watermarks. Unsplash+ (`plus`/`premium`) photos are ranked first by
 *      search and served with a tiled "Unsplash+" watermark baked into the
 *      pixels. Taking `results[0]` meant roughly two in five images arrived
 *      stamped. They are filtered out entirely.
 *   2. Relevance. Every slot declares the garment it must show; a candidate
 *      whose description does not mention that garment (or a synonym) is not
 *      considered, however well it ranks. This is what stopped a leather belt
 *      from standing in for a cap and an envelope from standing in for a tee.
 *   3. Colour, for the one-photo-per-colourway shots. The swatch hex is known,
 *      so candidates are sampled and ranked by how close the garment actually
 *      is to it. Names alone never worked — a photo library has no idea what
 *      "Moss" is.
 *
 * Every chosen photo id is also unique across the whole run. Two products
 * sharing a photograph reads as a bug, and the old top-hit rule produced eight
 * such pairs.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { products, categories, collections } from '../src/data/catalog.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'public/images')
const LOCK = path.join(ROOT, 'scripts/images.lock.json')
const CACHE = path.join(ROOT, 'node_modules/.cache/loom-images')
const FORCE = process.argv.includes('--force')
// `npm run images -- --only=beanie` re-rolls one slot without re-fetching the
// other hundred. Deleting its lockfile entry is what makes it re-roll; this
// only narrows which jobs are looked at.
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7)
// `npm run images -- --candidates=products/leather-belt-1` prints what the
// search would have to choose from, as JSON, and writes nothing. Pinning a
// better photograph into the lockfile by hand is the escape hatch this theme
// leans on, and it is unusable without a way to see the alternatives.
const CANDIDATES = (process.argv.find((a) => a.startsWith('--candidates=')) || '').slice(13)

/**
 * Every shape carries the orientation to search for.
 *
 * This matters more than it looks: cropping a 3:2 banner out of a portrait
 * photograph throws away most of the frame and usually decapitates the subject.
 * Asking Unsplash for the right orientation up front means the crop is a trim,
 * not a rescue — and candidates are still ranked on how little of the frame
 * their crop throws away, so a 5:4 photo loses to a 4:5 one for a 4:5 slot.
 */
const SHAPES = {
  product: { w: 900, h: 1125, orientation: 'portrait' },      // 4:5,  .shot
  category: { w: 640, h: 800, orientation: 'portrait' },      // 4:5,  .shot
  collection: { w: 1200, h: 800, orientation: 'landscape' },  // 3:2,  aspect-[3/2]
  hero: { w: 2400, h: 1350, orientation: 'landscape' },       // 16:9, full-bleed band
  editorial: { w: 1400, h: 1050, orientation: 'landscape' },  // 4:3,  aspect-[4/3]
}

export const colorSlug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/**
 * What each garment is allowed to be called.
 *
 * The key is the word this repo uses; the values are what a photographer might
 * have written in the caption. Matching is substring-based against the caption,
 * so "sweater" also catches "sweaters" and "oversized sweater".
 */
const GARMENTS = {
  shirt: ['shirt', 'blouse', 'button-down', 'button down', 'buttondown', 'button-up'],
  sweater: ['sweater', 'jumper', 'pullover', 'knitwear', 'knitted', 'knit'],
  cardigan: ['cardigan', 'knitwear', 'knit'],
  coat: ['coat', 'overcoat', 'topcoat', 'trench'],
  jacket: ['jacket', 'coat', 'anorak', 'parka', 'bomber'],
  trousers: ['trouser', 'trousers', 'pants', 'chino', 'chinos', 'slacks'],
  jeans: ['jeans', 'denim'],
  dress: ['dress', 'gown'],
  bag: ['bag', 'duffle', 'duffel', 'holdall', 'weekender', 'tote', 'luggage', 'satchel'],
  belt: ['belt'],
  scarf: ['scarf', 'scarves', 'shawl'],
  hat: ['beanie', 'hat', 'toque', 'cap'],
  tee: ['t-shirt', 'tshirt', 't shirt', 'tee ', 'tees'],
  clothing: ['clothing', 'clothes', 'garment', 'wardrobe', 'apparel', 'outfit', 'fashion', 'wearing'],
  fabric: ['fabric', 'textile', 'cloth', 'weave', 'thread', 'yarn', 'wool', 'linen', 'cotton'],
  sewing: ['sewing', 'tailor', 'seamstress', 'stitch', 'atelier', 'workshop', 'machine', 'needle'],
  leather: ['leather', 'hide', 'suede'],
}

/** Query words that name a garment, longest first so "t-shirt" wins over "shirt". */
const GARMENT_WORDS = [
  ['t-shirt', 'tee'], ['tshirt', 'tee'], ['tee', 'tee'],
  ['cardigan', 'cardigan'], ['sweater', 'sweater'], ['knitwear', 'sweater'], ['knit', 'sweater'],
  ['overcoat', 'coat'], ['coat', 'coat'], ['jacket', 'jacket'],
  ['trousers', 'trousers'], ['trouser', 'trousers'], ['chino', 'trousers'], ['pants', 'trousers'],
  ['jeans', 'jeans'], ['denim', 'jeans'],
  ['dress', 'dress'], ['shirt', 'shirt'],
  ['bag', 'bag'], ['duffle', 'bag'], ['weekender', 'bag'], ['tote', 'bag'],
  ['belt', 'belt'], ['scarf', 'scarf'],
  ['beanie', 'hat'], ['cap', 'hat'], ['hat', 'hat'],
]

/**
 * Captions that mean the photograph is of something else.
 *
 * Only unambiguous words: "girl in a white shirt" is a perfectly good shirt
 * photograph, but "kids" never is, and a smiling ten-year-old in a shearling
 * jacket is not what this catalogue sells.
 */
const NEGATIVE = [
  'child', 'children', 'kid', 'kids', 'baby', 'toddler', 'infant', 'newborn',
  'wedding', 'bride', 'groom', 'dog', 'puppy', 'cat', 'kitten',
  'mockup', 'mock-up', 'ai generated', 'ai-generated', 'illustration', 'cartoon',
  '3d render', '3d rendering', 'render of', 'blender', 'vector', 'clipart',
  // Branded frames. A demo storefront showing someone else's logo is a
  // different kind of wrong from an irrelevant photograph, and a harder one to
  // notice in review.
  'nike', 'adidas', 'supreme', 'gucci', 'prada', 'yankees', 'puma', 'reebok',
]

/** Colour names this catalogue uses, and what a caption would call them. */
const COLOR_WORDS = {
  ecru: ['ecru', 'cream', 'off white', 'off-white', 'ivory', 'beige', 'oatmeal'],
  'pale blue': ['light blue', 'pale blue', 'sky blue', 'blue'],
  black: ['black'],
  sand: ['sand', 'beige', 'tan', 'khaki', 'camel'],
  olive: ['olive', 'green', 'khaki'],
  chalk: ['white', 'cream', 'ivory', 'off white', 'off-white'],
  white: ['white'],
  navy: ['navy', 'dark blue', 'blue'],
  oat: ['oat', 'oatmeal', 'cream', 'beige'],
  charcoal: ['charcoal', 'grey', 'gray', 'dark grey', 'dark gray'],
  rust: ['rust', 'terracotta', 'orange', 'burnt orange', 'brown'],
  moss: ['moss', 'green', 'olive'],
  ink: ['navy', 'dark blue', 'black'],
  slate: ['slate', 'grey', 'gray', 'blue grey'],
  camel: ['camel', 'tan', 'beige', 'brown'],
  stone: ['stone', 'beige', 'taupe', 'grey'],
  'raw indigo': ['indigo', 'blue', 'dark denim'],
  'washed black': ['black', 'faded black', 'charcoal'],
  khaki: ['khaki', 'beige', 'tan', 'olive'],
  'off white': ['off white', 'off-white', 'white', 'cream'],
  clay: ['clay', 'terracotta', 'rust', 'brown', 'tan'],
  tan: ['tan', 'brown', 'light brown'],
  'field tan': ['tan', 'beige', 'khaki'],
  tobacco: ['tobacco', 'brown', 'tan'],
  'rust check': ['rust', 'red', 'orange', 'brown', 'plaid', 'check'],
  'slate check': ['grey', 'gray', 'blue', 'plaid', 'check'],
  stripe: ['stripe', 'striped', 'pinstripe'],
}

/** Words that describe the photograph rather than its subject. */
const GENERIC = new Set([
  'a', 'an', 'the', 'and', 'on', 'in', 'of', 'with', 'up', 'close', 'shot', 'photo',
  'studio', 'minimal', 'product', 'neutral', 'flat', 'lay', 'natural', 'light',
  'editorial', 'detail', 'texture', 'macro', 'background',
])

const words = (s) => (s || '').toLowerCase().split(/[^a-z0-9-]+/).filter(Boolean)

/** The head noun of a query — the garment the slot has to show. */
function garmentOf(query) {
  let found = null
  for (const w of words(query)) {
    const hit = GARMENT_WORDS.find(([word]) => word === w)
    if (hit) found = hit[1]
  }
  return found
}

/**
 * One query, then progressively shorter ones.
 *
 * Unsplash search is an AND across the whole phrase. "cotton baseball cap
 * neutral studio product" matches exactly one photograph in the library — a
 * watermarked pair of gloves — and every long query in this file was quietly
 * behaving the same way, which is most of why the old catalogue looked
 * arbitrary: the search found nothing, so the fallback found anything.
 *
 * Dropping the words that describe the photograph rather than its subject, then
 * dropping from the front, keeps the head noun to the last. Each step is a
 * wider net over the same subject rather than a different subject.
 */
function chain(query, extra = []) {
  const all = words(query)
  const core = all.filter((w) => !GENERIC.has(w))
  const out = [
    query,
    core.join(' '),
    core.slice(-3).join(' '),
    core.slice(-2).join(' '),
    ...extra,
  ]
  return [...new Set(out.filter((q) => q && q.split(' ').length))]
}

const jobs = []
// Products and categories without a query bring their own artwork (the
// non-apparel demo products are drawn, not photographed), so there is nothing to fetch.
for (const p of products.filter((x) => x._imageQuery)) {
  const garment = garmentOf(p._imageQuery) || garmentOf(p._colorQuery) || 'clothing'
  const garmentQuery = p._colorQuery || p._imageQuery

  jobs.push({ key: `products/${p.slug}-1`, queries: chain(p._imageQuery), garment, shape: 'product' })

  /**
   * The second shot is a fabric or construction crop, and it is the one that
   * used to go wrong — a macro of "cotton jersey texture" is a caption that
   * matches paper, walls and envelopes as readily as a t-shirt. When no
   * candidate can be confirmed as this garment, falling through to another
   * photograph of the garment itself beats an unrelated close-up.
   */
  jobs.push({
    key: `products/${p.slug}-2`,
    queries: chain(p._altQuery, chain(garmentQuery)),
    garment,
    shape: 'product',
  })

  /**
   * One photograph per colourway beyond the first.
   *
   * Without these the theme's variant gallery cannot be seen working: every
   * variant pointed at the same shot, so picking a colour changed the swatch
   * and nothing else, and the feature read as broken.
   *
   * Deriving them by tinting the first shot was tried and thrown away — hue
   * rotation cannot recolour a near-white garment, so "Black" came out as an
   * underexposed white shirt, which looks like a bug rather than a colourway.
   *
   * Searching the colour name did not work either: "Moss lambswool cardigan"
   * returns nothing, the query falls back to the garment alone, and every
   * colourway lands on the same cream cardigan — which is exactly what the
   * store shipped. So colour is settled on the pixels instead:
   * `swatches[name]` is the hex the swatch picker paints, and candidates from
   * every query in the chain are pooled and ranked on how close the garment in
   * the frame actually is to it.
   */
  for (const [name, hex] of Object.entries(p.swatches || {}).slice(1)) {
    const named = (COLOR_WORDS[name.toLowerCase()] || [])[0]
    const short = chain(garmentQuery).slice(-2)
    jobs.push({
      key: `products/${p.slug}-${colorSlug(name)}`,
      queries: [
        ...short.map((q) => `${name.toLowerCase()} ${q}`),
        ...(named ? short.map((q) => `${named} ${q}`) : []),
        ...chain(garmentQuery),
      ],
      garment,
      color: { name, hex },
      shape: 'product',
    })
  }
}

for (const c of categories.filter((x) => x.imageQuery)) {
  jobs.push({
    key: `categories/${c.slug}`,
    queries: chain(c.imageQuery),
    garment: garmentOf(c.imageQuery) || 'clothing',
    shape: 'category',
  })
}
for (const c of collections) {
  jobs.push({
    key: `collections/${c.slug}`,
    queries: chain(c.imageQuery),
    garment: garmentOf(c.imageQuery) || 'clothing',
    shape: 'collection',
  })
}
jobs.push({
  key: 'editorial/hero',
  queries: chain('woman wool coat autumn street style', ['autumn fashion street style', 'wool coat street']),
  garment: 'coat',
  shape: 'hero',
})
jobs.push({
  key: 'editorial/craft',
  queries: chain('tailor sewing machine workshop', ['seamstress sewing garment', 'sewing machine fabric']),
  garment: 'sewing',
  shape: 'editorial',
})

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

const cache = { search: {}, color: {} }

async function loadCache() {
  await fs.mkdir(CACHE, { recursive: true })
  for (const name of ['search', 'color']) {
    cache[name] = JSON.parse(await fs.readFile(path.join(CACHE, `${name}.json`), 'utf8').catch(() => '{}'))
  }
}
const saveCache = () =>
  Promise.all(
    Object.entries(cache).map(([name, data]) =>
      fs.writeFile(path.join(CACHE, `${name}.json`), JSON.stringify(data)),
    ),
  )

/**
 * Thirty results, not one.
 *
 * The old code took `results[0]`, which is where Unsplash puts the photo it
 * most wants to sell — a watermarked Unsplash+ frame. Everything below is a
 * filter applied to the whole page of results instead.
 */
async function search(query, orientation) {
  const ck = `${orientation}:${query}`
  if (cache.search[ck]) return cache.search[ck]

  const res = await fetch(
    `https://unsplash.com/napi/search/photos?query=${encodeURIComponent(query)}&per_page=30&orientation=${orientation}`,
    { headers: { accept: 'application/json' } },
  )
  if (!res.ok) throw new Error(`search "${query}": ${res.status}`)
  const json = await res.json()

  const out = (json.results || [])
    // Watermark filter. `plus`/`premium` is the Unsplash+ library; its raw URLs
    // serve a tiled watermark, and no amount of cropping removes it.
    .filter((h) => !h.plus && !h.premium && !/premium_photo/.test(h.urls?.raw || ''))
    .map((h) => ({
      id: h.id,
      credit: h.user?.name || 'Unsplash',
      raw: h.urls?.raw,
      small: h.urls?.small,
      w: h.width,
      h: h.height,
      likes: h.likes || 0,
      // The caption a photographer wrote, plus the keyworded slug Unsplash
      // builds from it. Between them they name the subject often enough to
      // reject a photo of something else.
      text: [h.alt_description, h.description, h.short_description, (h.slug || '').replace(/-/g, ' ')]
        .filter(Boolean)
        .join(' ')
        .toLowerCase(),
    }))
  cache.search[ck] = out
  await sleep(120) // be polite to a free endpoint
  return out
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

const has = (text, term) => text.includes(term)

/** Does this photograph show the garment the slot is for? */
const showsGarment = (cand, garment) => (GARMENTS[garment] || [garment]).some((w) => has(cand.text, w))

const isNegative = (cand) => NEGATIVE.some((w) => has(cand.text, w))

/** How much of the query, beyond the garment itself, the caption accounts for. */
function termScore(cand, query) {
  const terms = words(query).filter((w) => w.length > 2 && !GENERIC.has(w))
  if (!terms.length) return 0.5
  return terms.filter((t) => has(cand.text, t.replace(/s$/, ''))).length / terms.length
}

/**
 * How much of the frame survives the crop.
 *
 * A 3:2 photo cropped to 4:5 loses 45% of its width, which is usually an arm
 * and half the garment. Ranking on this keeps the crop a trim.
 */
function shapeScore(cand, shape) {
  const target = SHAPES[shape].w / SHAPES[shape].h
  const actual = cand.w / cand.h
  const kept = Math.min(target, actual) / Math.max(target, actual)
  return kept
}

/** sRGB → CIELab, so colour distance means what the eye means by it. */
function lab([r, g, b]) {
  const f = (v) => {
    v /= 255
    return v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92
  }
  const [R, G, B] = [f(r), f(g), f(b)]
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047
  const y = R * 0.2126 + G * 0.7152 + B * 0.0722
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883
  const g2 = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const [fx, fy, fz] = [g2(x), g2(y), g2(z)]
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

const deltaE = (a, b) => Math.hypot(...lab(a).map((v, i) => v - lab(b)[i]))
const hexRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

/**
 * Two readings of a photograph's colour, because a garment is not always the
 * middle of the frame.
 *
 * `centre` is the average of the central half, which is the garment on every
 * studio and on-model shot. `coverage` is how much of the whole frame sits
 * near a given colour, which is what finds a navy cap on a pale background —
 * the centre reading alone picked a straw cap off a model wearing a navy
 * sweater, having measured the sweater.
 *
 * A 32×40 downsample is enough for both and keeps this to one small request
 * per candidate.
 */
async function sample(cand) {
  if (cache.color[cand.id]) return cache.color[cand.id]
  const res = await fetch(`${cand.small}`)
  if (!res.ok) throw new Error(`sample ${cand.id}: ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const px = await sharp(buf).resize(32, 40, { fit: 'cover' }).removeAlpha().raw().toBuffer()

  const grid = []
  for (let i = 0; i < px.length; i += 3) grid.push([px[i], px[i + 1], px[i + 2]])

  const centre = [0, 0, 0]
  let n = 0
  for (let y = 10; y < 30; y++) {
    for (let x = 8; x < 24; x++) {
      const p = grid[y * 32 + x]
      centre[0] += p[0]
      centre[1] += p[1]
      centre[2] += p[2]
      n += 1
    }
  }
  const out = { centre: centre.map((v) => Math.round(v / n)), grid }
  cache.color[cand.id] = out
  await sleep(60)
  return out
}

/** How well a candidate carries a colourway, from 0 to 1. */
function colorScore(sampled, hex) {
  const target = hexRgb(hex)
  const near = sampled.grid.filter((p) => deltaE(p, target) < 22).length / sampled.grid.length
  const coverage = Math.min(1, near / 0.22) // a fifth of the frame is a garment
  const centre = Math.max(0, 1 - deltaE(sampled.centre, target) / 70)
  return 0.6 * coverage + 0.4 * centre
}

/**
 * Every on-subject photograph the chain can reach, best first.
 *
 * `pick` stops at the first query that works, which is the right rule for a
 * build; this one keeps going, which is the right rule for a person deciding
 * what to pin.
 */
async function shortlist(job, used = new Set(), limit = 12) {
  const { orientation } = SHAPES[job.shape]
  const pool = new Map()
  for (const query of job.queries.filter(Boolean)) {
    for (const c of await search(query, orientation).catch(() => [])) {
      if (used.has(c.id) || isNegative(c) || pool.has(c.id)) continue
      if (!showsGarment(c, job.garment)) continue
      pool.set(c.id, {
        ...c,
        score: 0.7 * termScore(c, query) + 0.2 * shapeScore(c, job.shape) + 0.1 * Math.min(1, c.likes / 250),
      })
    }
  }
  return [...pool.values()].sort((a, b) => b.score - a.score).slice(0, limit)
}

/**
 * Pick the best photograph for one slot.
 *
 * Plain slots take the first query in the chain that produces a candidate
 * passing the garment check, so a specific query that finds nothing costs a
 * less specific photograph rather than a wrong one.
 *
 * Colourway slots pool every query in the chain first. A colour is a property
 * of the frame, not of the caption, so the widest honest pool of on-subject
 * photographs is the one worth sampling — settling on the first "olive linen
 * shirt" the search happens to know about is how three colourways ended up
 * being the same mustard shirt.
 */
async function pick(job, used) {
  const { orientation } = SHAPES[job.shape]
  const queries = job.queries.filter(Boolean)
  // A tenth of the score is how well the photograph did on Unsplash itself.
  // It breaks ties between two equally on-subject frames, and the one people
  // liked is reliably the better-lit one.
  const rank = (c, query, w = 0.63) =>
    w * termScore(c, query) + (0.9 - w) * shapeScore(c, job.shape) + 0.1 * Math.min(1, c.likes / 250)
  let relaxed = null
  const pool = new Map()

  for (const query of queries) {
    const all = await search(query, orientation).catch(() => [])
    const fresh = all.filter((c) => !used.has(c.id) && !isNegative(c))
    const onSubject = fresh.filter((c) => showsGarment(c, job.garment))

    // Keep the best off-subject candidate as a last resort, so a slot ends up
    // with a plausible photograph rather than none.
    if (!relaxed && fresh.length) {
      relaxed = fresh.map((c) => ({ c, s: rank(c, query) })).sort((a, b) => b.s - a.s)[0].c
    }
    if (!onSubject.length) continue

    if (!job.color) {
      const best = onSubject.map((c) => ({ c, s: rank(c, query) })).sort((a, b) => b.s - a.s)[0]
      return { ...best.c, query }
    }
    for (const c of onSubject) if (!pool.has(c.id)) pool.set(c.id, { c, s: rank(c, query, 0.6) })
    if (pool.size >= 24) break
  }

  if (job.color && pool.size) {
    // Colour is settled on the pixels: the swatch hex against the middle of the
    // frame, which on a studio or on-model shot is the garment.
    const names = COLOR_WORDS[job.color.name.toLowerCase()] || [job.color.name.toLowerCase()]
    const shortlist = [...pool.values()].sort((a, b) => b.s - a.s).slice(0, 12)
    const scored = []
    for (const { c, s } of shortlist) {
      let close = 0.35
      try {
        close = colorScore(await sample(c), job.color.hex)
      } catch {
        /* a preview that will not download is scored as indifferent */
      }
      const named = names.some((n) => has(c.text, n)) ? 1 : 0
      scored.push({ c, s: 0.5 * close + 0.2 * named + 0.3 * s })
    }
    const best = scored.sort((a, b) => b.s - a.s)[0]
    return { ...best.c, query: `${job.color.name} ${job.garment}` }
  }

  if (relaxed) return { ...relaxed, query: queries[0], loose: true }
  throw new Error(`no usable results for "${queries[0]}"`)
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

async function download(entry) {
  // The raw URL from search is already signed; fall back to the photo endpoint
  // when replaying a lockfile that predates it, or a hand-pinned id — which is
  // also where the photographer's name comes from, so pinning a slot is one
  // line of JSON rather than three.
  let { raw, credit } = entry
  if (!raw || !credit) {
    const res = await fetch(`https://unsplash.com/napi/photos/${entry.id}`, { headers: { accept: 'application/json' } })
    if (!res.ok) throw new Error(`photo ${entry.id}: ${res.status}`)
    const photo = await res.json()
    raw = raw || photo.urls.raw
    credit = credit || photo.user?.name || 'Unsplash'
  }
  const img = await fetch(`${raw}&w=2000&q=85&fm=jpg&fit=max`)
  if (!img.ok) throw new Error(`download ${entry.id}: ${img.status}`)
  return { buf: Buffer.from(await img.arrayBuffer()), credit }
}

/**
 * Crop to the target shape with `position: 'attention'`, which picks the most
 * detailed region rather than the centre — on a hanging garment shot the centre
 * is usually empty wall.
 *
 * The light grade pulls every photo toward one exposure so a hundred unrelated
 * images read as one lookbook instead of a stock-photo pile.
 *
 * The clamp is narrow on purpose. A photograph that is mostly dark background —
 * a coat against a shaded wall, a knit on a black backdrop — has a low mean
 * and asks for a large boost, and the boost lands on the one bright thing in
 * the frame, which is usually the model's face. At 1.6 the hero came back with
 * the face burnt to paper. Nothing here is worth a blown highlight, so the
 * grade nudges rather than rescues.
 */
async function render(buf, shape) {
  const { w, h } = SHAPES[shape]
  const base = sharp(buf).resize(w, h, { fit: 'cover', position: 'attention' })
  const stats = await base.clone().stats()
  const mean = stats.channels.slice(0, 3).reduce((a, c) => a + c.mean, 0) / 3
  const exposure = Math.min(1.18, Math.max(0.88, 138 / Math.max(mean, 1)))
  return base
    .modulate({ saturation: 0.9, brightness: exposure })
    .linear(1.03, -2)
    .jpeg({ quality: 78, mozjpeg: true, progressive: true })
}

async function main() {
  await loadCache()

  if (CANDIDATES) {
    const job = jobs.find((j) => j.key === CANDIDATES)
    if (!job) throw new Error(`no such slot: ${CANDIDATES}`)
    const list = await shortlist(job)
    await saveCache()
    console.log(JSON.stringify({ key: job.key, queries: job.queries, candidates: list }, null, 2))
    return
  }

  const lock = FORCE ? {} : JSON.parse(await fs.readFile(LOCK, 'utf8').catch(() => '{}'))
  const used = new Set(Object.values(lock).map((e) => e.id))
  let fetched = 0
  let skipped = 0

  for (const dir of ['products', 'categories', 'collections', 'editorial']) {
    await fs.mkdir(path.join(OUT, dir), { recursive: true })
  }

  for (const job of jobs.filter((j) => !ONLY || j.key.includes(ONLY))) {
    const file = path.join(OUT, `${job.key}.jpg`)
    const exists = await fs.stat(file).then(() => true, () => false)

    if (exists && !FORCE && lock[job.key]) {
      skipped += 1
      continue
    }

    try {
      const entry = lock[job.key] || (await pick(job, used))
      const { buf, credit } = await download(entry)
      await (await render(buf, job.shape)).toFile(file)
      const { size } = await fs.stat(file)
      used.add(entry.id)
      lock[job.key] = { id: entry.id, credit, query: entry.query || job.queries[0] }
      fetched += 1
      console.log(`ok    ${job.key}  ${Math.round(size / 1024)}kb  (${credit})${entry.loose ? '  [loose match]' : ''}`)
    } catch (err) {
      console.error(`FAIL  ${job.key}  ${err.message}`)
      process.exitCode = 1
    }
    await saveCache()
  }

  await fs.writeFile(LOCK, `${JSON.stringify(lock, null, 2)}\n`)
  await fs.writeFile(
    path.join(OUT, 'CREDITS.md'),
    `# Photography\n\nAll images are from [Unsplash](https://unsplash.com), free to use commercially.\nRe-run \`npm run images:force\` to replace them with your own product photography.\n\n| File | Photographer | Photo |\n| --- | --- | --- |\n${jobs
      .filter((j) => lock[j.key])
      .map((j) => `| \`${j.key}.jpg\` | ${lock[j.key].credit} | [${lock[j.key].id}](https://unsplash.com/photos/${lock[j.key].id}) |`)
      .join('\n')}\n`,
  )

  console.log(`\n${fetched} fetched, ${skipped} already present, ${jobs.length} total.`)
}

main()
