/**
 * Generates every brand asset from one SVG mark.
 *
 *   npm run brand
 *
 * These are the small files with outsized impact: a browser tab with no icon
 * reads as unfinished, and a link shared without an Open Graph image gets a
 * grey box instead of a preview. Both are minutes of work and both are visible
 * on every share, forever.
 *
 * Everything derives from MARK below, so rebranding is one edit and one command.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { storefront } from '../src/data/storefront.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PUB = path.join(ROOT, 'public')

const INK = '#1A1815'
const PAGE = '#FAF8F5'
const ACCENT = '#9C4221'
const ACCENT_SOFT = '#F6E8E0'
const NAME = storefront.store.name

/**
 * A filled weave: three wefts crossing two warps, the warps drawn only in the
 * gaps so the threads interlock. Solid rather than stroked — a 1.5px line is
 * invisible at the 16px a browser tab actually renders, which is the entire
 * reason a favicon exists.
 */
const weave = (color) => `
  <g fill="${color}">
    <rect x="3.2" y="6.0" width="17.6" height="2.5" rx="1.25"/>
    <rect x="3.2" y="10.75" width="17.6" height="2.5" rx="1.25"/>
    <rect x="3.2" y="15.5" width="17.6" height="2.5" rx="1.25"/>
    <rect x="7.6" y="3.2" width="2.5" height="3.0" rx="1.25"/>
    <rect x="7.6" y="8.3" width="2.5" height="2.65" rx="1.25"/>
    <rect x="7.6" y="13.05" width="2.5" height="2.65" rx="1.25"/>
    <rect x="7.6" y="17.8" width="2.5" height="3.0" rx="1.25"/>
    <rect x="13.9" y="3.2" width="2.5" height="3.0" rx="1.25"/>
    <rect x="13.9" y="8.3" width="2.5" height="2.65" rx="1.25"/>
    <rect x="13.9" y="13.05" width="2.5" height="2.65" rx="1.25"/>
    <rect x="13.9" y="17.8" width="2.5" height="3.0" rx="1.25"/>
  </g>`

/** `scale` shrinks the glyph inside its tile for maskable icons. */
const mark = (color, scale = 1) =>
  `<g transform="translate(${(1 - scale) * 12} ${(1 - scale) * 12}) scale(${scale})">${weave(color)}</g>`

const svg = (bg, color, scale = 1, radius = 5.5) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">` +
  (bg ? `<rect width="24" height="24" rx="${radius}" fill="${bg}"/>` : '') +
  mark(color, scale) +
  `</svg>`

async function png(source, size, file, background = { r: 0, g: 0, b: 0, alpha: 0 }) {
  await sharp(Buffer.from(source))
    .resize(size, size, { fit: 'contain', background })
    .png({ compressionLevel: 9 })
    .toFile(path.join(PUB, file))
  return file
}

async function main() {
  await fs.mkdir(PUB, { recursive: true })
  const written = []

  // A filled accent tile, not a mark on white. At 16px in a tab, next to a
  // dozen other tabs, a coloured shape is findable and a thin drawing is not —
  // and it holds up on both light and dark browser chrome.
  await fs.writeFile(path.join(PUB, 'favicon.svg'), svg(ACCENT, ACCENT_SOFT))
  written.push('favicon.svg')

  written.push(await png(svg(ACCENT, ACCENT_SOFT), 32, 'favicon-32.png'))
  written.push(await png(svg(ACCENT, ACCENT_SOFT, 1, 4), 16, 'favicon-16.png'))

  // iOS ignores transparency and composites onto black, so this one is opaque.
  // It also applies its own corner radius, so the tile is drawn square.
  written.push(await png(svg(ACCENT, ACCENT_SOFT, 1, 0), 180, 'apple-touch-icon.png'))

  // Android maskable icons are cropped to a circle — the glyph is scaled to
  // 60% so nothing important lands outside the safe zone.
  written.push(await png(svg(ACCENT, ACCENT_SOFT, 0.6, 0), 512, 'icon-maskable-512.png'))
  written.push(await png(svg(ACCENT, ACCENT_SOFT), 512, 'icon-512.png'))
  written.push(await png(svg(ACCENT, ACCENT_SOFT), 192, 'icon-192.png'))

  // Open Graph card. Drawn rather than photographed so it never goes stale and
  // carries no third-party imagery.
  const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <rect width="1200" height="630" fill="${PAGE}"/>
    <rect x="0" y="0" width="1200" height="6" fill="${ACCENT}"/>
    <rect x="96" y="150" width="132" height="132" rx="30" fill="${ACCENT}"/>
    <g transform="translate(96 150) scale(5.5)">${weave(ACCENT_SOFT)}</g>
    <text x="96" y="382" font-family="Georgia, serif" font-size="88" fill="${INK}" letter-spacing="-2">${NAME}</text>
    <text x="96" y="436" font-family="Helvetica, Arial, sans-serif" font-size="25" fill="#6B645A">${storefront.store.tagline}</text>
    <text x="96" y="552" font-family="ui-monospace, Menlo, monospace" font-size="19" fill="${ACCENT}" letter-spacing="3">AN OPEN-SOURCE STOREFRONT THEME</text>
  </svg>`
  await sharp(Buffer.from(og)).jpeg({ quality: 88, mozjpeg: true }).toFile(path.join(PUB, 'og.jpg'))
  written.push('og.jpg')

  await fs.writeFile(
    path.join(PUB, 'manifest.webmanifest'),
    `${JSON.stringify(
      {
        name: `${NAME} — ${storefront.store.tagline}`,
        short_name: NAME,
        description: storefront.store.description,
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: PAGE,
        theme_color: ACCENT,
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      null,
      2,
    )}\n`,
  )
  written.push('manifest.webmanifest')

  await fs.writeFile(
    path.join(PUB, 'robots.txt'),
    `User-agent: *\nAllow: /\nDisallow: /checkout\nDisallow: /account\nDisallow: /cart\n\nSitemap: /sitemap.xml\n`,
  )
  written.push('robots.txt')

  console.log(written.map((f) => `ok    ${f}`).join('\n'))
}

main()
