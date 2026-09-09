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
 * Delete an entry from the lockfile to re-roll just that image.
 *
 * Unsplash photos are free to use commercially. Photographer credits are
 * written to public/images/CREDITS.md.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { products, categories, collections } from '../src/data/catalog.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'public/images')
const LOCK = path.join(ROOT, 'scripts/images.lock.json')
const FORCE = process.argv.includes('--force')

/**
 * Every shape carries the orientation to search for.
 *
 * This matters more than it looks: cropping a 3:2 banner out of a portrait
 * photograph throws away most of the frame and usually decapitates the subject.
 * Asking Unsplash for the right orientation up front means the crop is a trim,
 * not a rescue.
 */
const SHAPES = {
  product: { w: 900, h: 1125, orientation: 'portrait' },      // 4:5,  .shot
  category: { w: 640, h: 800, orientation: 'portrait' },      // 4:5,  .shot
  collection: { w: 1200, h: 800, orientation: 'landscape' },  // 3:2,  aspect-[3/2]
  hero: { w: 2400, h: 1350, orientation: 'landscape' },       // 16:9, full-bleed band
  editorial: { w: 1400, h: 1050, orientation: 'landscape' },  // 4:3,  aspect-[4/3]
}

export const colorSlug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const jobs = []
for (const p of products) {
  jobs.push({ key: `products/${p.slug}-1`, query: p._imageQuery, shape: 'product' })
  jobs.push({ key: `products/${p.slug}-2`, query: p._altQuery, shape: 'product' })

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
   * Fetching a real photograph of roughly that colour is no less honest than
   * the rest of this catalogue, which is stock photography standing in for
   * products throughout, and it actually looks like a different colourway.
   *
   * `colorQuery` is the colour-neutral half of the description, so the colour
   * name can lead the query instead of fighting the one already in it.
   */
  const colors = Object.keys(p.swatches || {})
  for (const name of colors.slice(1)) {
    const garment = p._colorQuery || p._imageQuery
    // Shortening beats rephrasing. A five-word query is an AND across all five
    // and "merino wool sweater folded studio" matches nothing in the library,
    // while its first three words match two thousand photographs.
    const short = garment.split(' ').slice(0, 3).join(' ')
    jobs.push({
      key: `products/${p.slug}-${colorSlug(name)}`,
      query: `${name} ${garment}`,
      fallbacks: [
        `${name.split(' ')[0]} ${garment}`,
        `${name} ${short}`,
        `${name.split(' ')[0]} ${short}`,
        garment,
        short,
      ],
      shape: 'product',
    })
  }
}
for (const c of categories) jobs.push({ key: `categories/${c.slug}`, query: c.imageQuery, shape: 'category' })
for (const c of collections) jobs.push({ key: `collections/${c.slug}`, query: c.imageQuery, shape: 'collection' })
jobs.push({ key: 'editorial/hero', query: 'fashion lookbook woman wool coat autumn street editorial wide', shape: 'hero' })
jobs.push({ key: 'editorial/craft', query: 'tailor sewing machine workshop hands fabric', shape: 'editorial' })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Try each query in turn and take the first that returns anything.
 *
 * Colourway queries fail on names a photo library has never been asked for —
 * "Slate Check", "Moss", "Chalk". Falling back to the first word and then to
 * the garment on its own means an obscure colour name costs a less specific
 * photograph rather than a missing file, which would leave that variant with a
 * broken image.
 */
async function searchAny(queries, orientation) {
  let last
  for (const q of queries.filter(Boolean)) {
    try {
      return await search(q, orientation)
    } catch (err) {
      last = err
    }
  }
  throw last
}

async function search(query, orientation = 'portrait') {
  const res = await fetch(
    `https://unsplash.com/napi/search/photos?query=${encodeURIComponent(query)}&per_page=8&orientation=${orientation}`,
    { headers: { accept: 'application/json' } },
  )
  if (!res.ok) throw new Error(`search "${query}": ${res.status}`)
  const json = await res.json()
  const hit = (json.results || [])[0]
  if (!hit) throw new Error(`no results for "${query}"`)
  return { id: hit.id, credit: hit.user?.name || 'Unsplash', raw: hit.urls?.raw }
}

async function download(entry) {
  // The raw URL from search is already signed; fall back to the photo endpoint
  // when replaying a lockfile that predates it.
  let raw = entry.raw
  if (!raw) {
    const res = await fetch(`https://unsplash.com/napi/photos/${entry.id}`, { headers: { accept: 'application/json' } })
    if (!res.ok) throw new Error(`photo ${entry.id}: ${res.status}`)
    raw = (await res.json()).urls.raw
  }
  const img = await fetch(`${raw}&w=2000&q=85&fm=jpg&fit=max`)
  if (!img.ok) throw new Error(`download ${entry.id}: ${img.status}`)
  return Buffer.from(await img.arrayBuffer())
}

/**
 * Crop to the target shape with `position: 'attention'`, which picks the most
 * detailed region rather than the centre — on a hanging garment shot the centre
 * is usually empty wall.
 *
 * The light grade pulls every photo toward one exposure so twenty-four
 * unrelated images read as one lookbook instead of a stock-photo pile.
 */
async function render(buf, shape) {
  const { w, h } = SHAPES[shape]
  const base = sharp(buf).resize(w, h, { fit: 'cover', position: 'attention' })
  const stats = await base.clone().stats()
  const mean = stats.channels.slice(0, 3).reduce((a, c) => a + c.mean, 0) / 3
  const exposure = Math.min(1.6, Math.max(0.75, 138 / Math.max(mean, 1)))
  return base
    .modulate({ saturation: 0.9, brightness: exposure })
    .linear(1.03, -2)
    .jpeg({ quality: 78, mozjpeg: true, progressive: true })
}

async function main() {
  const lock = FORCE ? {} : JSON.parse(await fs.readFile(LOCK, 'utf8').catch(() => '{}'))
  const credits = []
  let fetched = 0
  let skipped = 0

  for (const dir of ['products', 'categories', 'collections', 'editorial']) {
    await fs.mkdir(path.join(OUT, dir), { recursive: true })
  }

  for (const job of jobs) {
    const file = path.join(OUT, `${job.key}.jpg`)
    const exists = await fs.stat(file).then(() => true, () => false)

    if (exists && !FORCE && lock[job.key]) {
      credits.push([job.key, lock[job.key]])
      skipped += 1
      continue
    }

    try {
      const entry =
        lock[job.key] ||
        (await searchAny([job.query, ...(job.fallbacks || [])], SHAPES[job.shape].orientation))
      const buf = await download(entry)
      await (await render(buf, job.shape)).toFile(file)
      const { size } = await fs.stat(file)
      lock[job.key] = { id: entry.id, credit: entry.credit, query: job.query }
      credits.push([job.key, lock[job.key]])
      fetched += 1
      console.log(`ok    ${job.key}  ${Math.round(size / 1024)}kb  (${entry.credit})`)
      await sleep(180) // be polite to a free endpoint
    } catch (err) {
      console.error(`FAIL  ${job.key}  ${err.message}`)
      process.exitCode = 1
    }
  }

  await fs.writeFile(LOCK, `${JSON.stringify(lock, null, 2)}\n`)
  await fs.writeFile(
    path.join(OUT, 'CREDITS.md'),
    `# Photography\n\nAll images are from [Unsplash](https://unsplash.com), free to use commercially.\nRe-run \`npm run images:force\` to replace them with your own product photography.\n\n| File | Photographer | Photo |\n| --- | --- | --- |\n${credits
      .map(([key, c]) => `| \`${key}.jpg\` | ${c.credit} | [${c.id}](https://unsplash.com/photos/${c.id}) |`)
      .join('\n')}\n`,
  )

  console.log(`\n${fetched} fetched, ${skipped} already present, ${jobs.length} total.`)
}

main()
