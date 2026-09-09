/**
 * Uploaded media.
 *
 * The storefront is a static site with no file server, so an upload here has
 * nowhere to go. Two bad options and one reasonable one:
 *
 *   - Data URLs inside the product record. Simple, and it puts megabytes into
 *     localStorage, which holds about five in total. The catalogue dies.
 *   - Object URLs. Free, and gone on the next reload.
 *   - A binary store with its own quota, and a `media:<id>` reference in the
 *     product. That is this file.
 *
 * IndexedDB gets a share of disk rather than a five-megabyte cap, survives a
 * reload, and holds video. Products store `media:<id>`; `resolve()` turns that
 * back into something an <img> or <video> can use, and passes every other URL
 * through untouched so the seeded catalogue and any CDN keep working.
 *
 * In api mode none of this runs — `uploadMedia` posts to your endpoint and the
 * product stores whatever URL comes back.
 */

const DB = 'loom-media'
const STORE = 'files'
const PREFIX = 'media:'

let ready = null
function open() {
  if (ready) return ready
  ready = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('This browser has no IndexedDB, so uploads cannot be stored locally.'))
      return
    }
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return ready
}

function tx(mode, run) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode)
        const store = t.objectStore(STORE)
        const result = run(store)
        t.oncomplete = () => resolve(result?.result ?? result)
        t.onerror = () => reject(t.error)
      }),
  )
}

export const isMediaRef = (url) => typeof url === 'string' && url.startsWith(PREFIX)
export const mediaId = (url) => (isMediaRef(url) ? url.slice(PREFIX.length) : null)

/* ── reading ───────────────────────────────────────────────────────────── */

// Resolved records are cached in memory. Every card in a grid asks for the same
// handful of ids, and a round trip to IndexedDB per <img> is a visible stutter.
const cache = new Map()

export async function get(id) {
  if (cache.has(id)) return cache.get(id)
  const record = await tx('readonly', (store) => store.get(id))
  if (record) cache.set(id, record)
  return record || null
}

export async function list() {
  const all = await tx('readonly', (store) => store.getAll())
  const items = all || []
  items.forEach((r) => cache.set(r.id, r))
  return items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

/**
 * Turn whatever a product stored into something a browser can render.
 *
 * Synchronous for everything except a `media:` reference, because the common
 * case is a plain URL and making every consumer await would push a loading
 * state into every image on the site.
 */
export function resolveSync(url) {
  if (!isMediaRef(url)) return url
  return cache.get(mediaId(url))?.src || null
}

export async function resolve(url) {
  if (!isMediaRef(url)) return url
  const record = await get(mediaId(url))
  return record?.src || null
}

/* ── writing ───────────────────────────────────────────────────────────── */

const uid = () => `m_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

/** Longest edge an uploaded still is stored at. Product shots are 900×1125. */
const MAX_EDGE = 1600
const JPEG_QUALITY = 0.82

/**
 * Images are re-encoded before storage.
 *
 * A phone photograph is four megabytes and 4000px wide; nothing on the page
 * renders it above 900. Downscaling on the way in is the difference between a
 * catalogue that holds fifty images and one that fails on the ninth.
 *
 * Video is stored as-is — re-encoding it in a browser is not something to do
 * on an upload button — so the size guard below matters more for video.
 */
async function encodeImage(file) {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height)
  bitmap.close?.()

  // WebP where it is supported, JPEG otherwise. PNG would keep transparency but
  // triples the size of a photograph, and product shots are not transparent.
  const webp = canvas.toDataURL('image/webp', JPEG_QUALITY)
  const src = webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', JPEG_QUALITY)
  return { src, width, height }
}

function probeVideo(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const el = document.createElement('video')
    el.preload = 'metadata'
    el.onloadedmetadata = () => {
      const meta = { width: el.videoWidth, height: el.videoHeight, duration: el.duration }
      URL.revokeObjectURL(url)
      resolve(meta)
    }
    el.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('That video could not be read.'))
    }
    el.src = url
  })
}

const toDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('That file could not be read.'))
    reader.readAsDataURL(file)
  })

const MAX_VIDEO_BYTES = 25 * 1024 * 1024

export async function upload(file) {
  const isVideo = file.type.startsWith('video/')
  if (!isVideo && !file.type.startsWith('image/')) {
    throw new Error(`${file.name} is not an image or a video.`)
  }
  if (isVideo && file.size > MAX_VIDEO_BYTES) {
    throw new Error(
      `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)}MB. Videos over 25MB belong on a CDN — paste the URL instead.`,
    )
  }

  const record = {
    id: uid(),
    name: file.name,
    type: isVideo ? 'video' : 'image',
    mime: file.type,
    createdAt: new Date().toISOString(),
  }

  if (isVideo) {
    const meta = await probeVideo(file)
    Object.assign(record, meta, { src: await toDataUrl(file) })
  } else {
    Object.assign(record, await encodeImage(file))
  }
  record.bytes = record.src.length

  try {
    await tx('readwrite', (store) => store.put(record))
  } catch (err) {
    throw new Error(`Could not store ${file.name}: ${err.message}. Browser storage may be full.`)
  }
  cache.set(record.id, record)

  return {
    id: record.id,
    url: `${PREFIX}${record.id}`,
    type: record.type,
    width: record.width,
    height: record.height,
    duration: record.duration ?? null,
    bytes: record.bytes,
    name: record.name,
  }
}

export async function remove(id) {
  await tx('readwrite', (store) => store.delete(id))
  cache.delete(id)
  return { ok: true }
}

/** Total bytes held, so the admin can see it before the quota does. */
export async function usage() {
  const items = await list()
  return {
    count: items.length,
    bytes: items.reduce((a, r) => a + (r.bytes || 0), 0),
  }
}

/**
 * Warm the cache for a set of URLs before rendering them.
 *
 * Called once by the media grid and by the product editor, so the synchronous
 * resolver has everything it needs and no image flashes empty.
 */
export async function preload(urls = []) {
  const ids = urls.filter(isMediaRef).map(mediaId).filter((id) => !cache.has(id))
  if (!ids.length) return
  await Promise.all(ids.map((id) => get(id)))
}
