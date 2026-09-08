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
const ACCENT = '#7C4A2D'
const NAME = storefront.store.name

/** The loom glyph: a frame, two warp threads, weft crossing over and under. */
const mark = (stroke, scale = 1) => `
  <g transform="translate(${(1 - scale) * 12} ${(1 - scale) * 12}) scale(${scale})"
     fill="none" stroke="${stroke}" stroke-linecap="round">
    <rect x="2.5" y="2.5" width="19" height="19" rx="2.5" stroke-width="1.6"/>
    <path d="M9 3v18M15 3v18" stroke-width="1.3" opacity="0.45"/>
    <path d="M3 9h4.6M10.4 9h3.2M16.4 9H21M3 15h4.6M10.4 15h3.2M16.4 15H21" stroke-width="1.6"/>
  </g>`

const svg = (bg, stroke, scale = 1) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">` +
  (bg ? `<rect width="24" height="24" fill="${bg}"/>` : '') +
  mark(stroke, scale) +
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

  // Scalable favicon — the one modern browsers prefer, and the only one that
  // stays sharp on a 4x display.
  await fs.writeFile(path.join(PUB, 'favicon.svg'), svg(null, INK))
  written.push('favicon.svg')

  // Raster fallbacks. 32px is what a browser tab actually renders.
  written.push(await png(svg(PAGE, INK), 32, 'favicon-32.png'))
  written.push(await png(svg(PAGE, INK), 16, 'favicon-16.png'))

  // iOS ignores transparency and composites onto black, so this one is opaque.
  written.push(await png(svg(PAGE, INK), 180, 'apple-touch-icon.png'))

  // Android maskable icons are cropped to a circle by the launcher — the mark
  // is scaled to 62% so nothing important lands outside the safe zone.
  written.push(await png(svg(INK, PAGE, 0.62), 512, 'icon-maskable-512.png'))
  written.push(await png(svg(PAGE, INK), 512, 'icon-512.png'))
  written.push(await png(svg(PAGE, INK), 192, 'icon-192.png'))

  // Open Graph card. Drawn rather than photographed so it never goes stale and
  // carries no third-party imagery.
  const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <rect width="1200" height="630" fill="${PAGE}"/>
    <rect x="0" y="0" width="1200" height="6" fill="${ACCENT}"/>
    <g transform="translate(96 232) scale(4.6)">${mark(INK)}</g>
    <text x="96" y="392" font-family="Georgia, serif" font-size="92" fill="${INK}" letter-spacing="-2">${NAME}</text>
    <text x="96" y="452" font-family="Helvetica, Arial, sans-serif" font-size="26" fill="#6B645A">${storefront.store.tagline}</text>
    <text x="96" y="556" font-family="ui-monospace, Menlo, monospace" font-size="20" fill="${ACCENT}" letter-spacing="3">AN OPEN-SOURCE STOREFRONT THEME</text>
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
        theme_color: PAGE,
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
