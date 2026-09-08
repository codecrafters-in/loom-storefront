# Theming

## The palette

Every colour in the theme is a CSS custom property holding an `R G B` triplet,
consumed through `rgb(var(--x) / <alpha-value>)`. Re-skinning is one block:

```css
/* src/index.css */
:root {
  --page:    250 248 245;   /* the page ground */
  --surface: 255 255 255;   /* cards, panels */
  --sunken:  241 237 230;   /* image wells, alternating bands */

  --ink:     26 24 21;      /* body text */
  --muted:   107 100 90;    /* secondary text */
  --faint:   125 117 106;   /* captions, counts */
  --line:    227 221 210;   /* hairlines */

  --accent:      124 74 45; /* links, active states, the buy accent */
  --accent-ink:  255 255 255;
  --accent-soft: 243 231 222;

  --sale: 163 52 31;
  --good: 63 107 74;
  --shadow: 60 50 38;       /* warm, never pure black */
}
```

The triplet form is not decorative — it is what makes `bg-accent/10` and
`text-ink/60` work. A hex variable breaks every opacity modifier in the theme.

Rules the palette follows:

- **Shadows are warm** (`60 50 38`, not `0 0 0`). A pure-black shadow on a warm
  ground reads as grey dirt; a warm one reads as depth. This is most of the
  difference between a premium light theme and a default one.
- **Three text weights, not five.** `ink` for what you read, `muted` for what
  supports it, `faint` for what you glance at. More than three and hierarchy
  stops being legible.
- **One accent.** Links, active filters, the price on sale and the primary
  button all pull from `--accent`. Two accents means neither reads as the
  action.

Contrast on the shipped palette: `ink` on `page` is 15.2:1, `muted` 6.4:1,
`faint` 4.9:1, `accent` 6.1:1 — all clear of WCAG AA for body text, and `faint`
is only used at 12px and above where it still passes.

## Type

| Role | Family | Where |
| --- | --- | --- |
| Display | Fraunces | `h1`–`h3`, prices in the buy box, the wordmark |
| Body | Inter | Everything else |
| Mono | JetBrains Mono | Eyebrows, SKUs, badges, counts |

A serif for headings and a grotesque for body is the standard editorial pairing
in fashion retail, and it does the work of making a catalogue read as a
publication rather than a database. Fraunces is variable, so the optical-size
axis keeps large headings tight and small ones readable without a second file.

Three display sizes, all fluid:

```js
'display-xl': 'clamp(2.75rem, 6vw, 5rem)'   // hero only
'display-lg': 'clamp(2rem, 4vw, 3.25rem)'   // page titles
'display-md': 'clamp(1.5rem, 2.6vw, 2.25rem)' // section headings
```

Body copy sits at 15px with `leading-relaxed`, and captions at 12–13px. Prices
and any number that changes use `tabular-nums` so the layout does not jitter
when a quantity or total updates.

## The logo

Drawn in `src/components/ui/Logo.jsx` rather than uploaded, so it inherits
`currentColor`, stays sharp at any size and costs no request. The glyph is a
loom: a frame, two warp threads, weft crossing over and under.

To use your own artwork:

```json
{ "store": { "logo": { "imageUrl": "https://cdn.yourstore.com/logo.svg", "height": 26 } } }
```

To change the drawn mark, edit the paths in `Logo.jsx` **and** the `mark()`
function in `scripts/brand.mjs`, then run `npm run brand` — favicons, app icons
and the Open Graph card all derive from the same geometry.

## Brand assets

`npm run brand` generates everything from that one mark:

| File | Purpose |
| --- | --- |
| `favicon.svg` | What modern browsers use; sharp at any DPI |
| `favicon-32.png`, `favicon-16.png` | Fallback |
| `apple-touch-icon.png` | 180px, opaque — iOS composites transparency onto black |
| `icon-192.png`, `icon-512.png` | Android home screen |
| `icon-maskable-512.png` | Scaled to 62% so a circular launcher crop keeps the mark |
| `og.jpg` | 1200×630 link preview |
| `manifest.webmanifest` | Installable metadata |
| `robots.txt` | Excludes cart, checkout, account |

These are the small files with outsized effect. A tab with no icon reads as
unfinished, and a link shared without an OG card gets a grey box — on every
share, forever.

## Imagery

Aspect ratios are fixed per surface so the grid never reflows as images decode:

| Surface | Ratio | Pixels |
| --- | --- | --- |
| Product shot (`.shot`) | 4:5 | 900 × 1125 |
| Category tile | 4:5 | 640 × 800 |
| Collection card | 3:2 | 1200 × 800 |
| Hero | 16:9 | 2400 × 1350 |
| Editorial | 4:3 | 1400 × 1050 |

`npm run images` fetches each one **in the matching orientation** — cropping a
3:2 banner out of a portrait photograph throws away most of the frame and
usually decapitates the subject — then crops with `position: 'attention'` and
grades everything to a common exposure so unrelated photographs read as one
lookbook.

Replace `public/images/` wholesale when you have real product photography. Keep
the ratios and nothing else needs to change.

## Spacing and shape

- `rounded-xs` is 2px. Almost everything uses it. Fashion retail reads as
  cheaper the rounder it gets.
- Section rhythm is `py-16 md:py-20`, and alternating bands use `bg-surface`
  against the `page` ground rather than borders.
- `.wrap` is the container: 1440px max, 1.25rem gutters rising to 3rem.
- Shadows come in three steps — `card`, `lift`, `panel` — and no element uses a
  custom one.
