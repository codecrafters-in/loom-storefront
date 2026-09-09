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
usually decapitates the subject — and ranks candidates on how little of the
frame the crop throws away, so a 4:5 photo wins a 4:5 slot over a 5:4 one. It
then crops with `position: 'attention'` and grades everything toward a common
exposure so unrelated photographs read as one lookbook.

The grade is deliberately a nudge, not a rescue: a photograph that is mostly
dark background asks for a large boost, and the boost lands on the one bright
thing in the frame, which is usually the model's face.

Replace `public/images/` wholesale when you have real product photography. Keep
the ratios and nothing else needs to change.

## Layout balance

The rules the product page follows, and the reasoning, because these are the
ones that get undone first when someone adds a section.

**One container per page.** `.wrap` is 1440px; `.wrap-tight` narrows it to 1320
for pages built around one large image. Apply it to **every** section of such a
page — breadcrumbs, the grid, reviews, related, the loading skeleton and the
sticky bar.

Nesting a narrower box inside `.wrap` for one section is the mistake to avoid:
the content starts 100px further in than the breadcrumb above it, which reads as
a margin on one side and as a mistake on both. The skeleton matters too — put it
on a different container and the page shifts sideways the moment it loads.

**Unequal columns, on a container narrow enough to fill.** The product page is
`minmax(0,1fr)` and a fixed `30rem` inside `.wrap-tight` — about 57/39 on a
desktop, with a 480px measure for the buy column.

Two numbers have to agree here, and getting one right while the other is wrong
is what produces a page that looks empty:

| | |
| --- | --- |
| Container `1440px`, right column `26rem` | image resolves to 564px in a 764px track — **186px of dead space** beside it |
| Container `1240px`, right column `28rem` | image resolves to 564px in a 564px track — **none** |

A 4:5 image bounded by viewport height has a fixed size on any given screen, so
the column has to be sized around it rather than the other way round. Going
wider does not gain anything: the extra either becomes surplus beside the image,
or it grows the panel until the shot crops. At 1440 with a 30rem buy column the
crop reaches 15%, which is a head or a hem.

The buy column absorbs what is left, and it has its own ceiling — much past
30rem the measure stops being comfortable to read.

A 50/50 split fails for the other reason: it gives the buy column a ~600px
measure, roughly twice a comfortable reading width, so every line of trust copy
runs the full track.

On a viewport under about 900px tall the height cap binds first and 60–80px of
slack returns. That is the deliberate trade: the alternative is a taller image
that pushes the size picker below the fold.

**`min-w-0` on grid and flex children that hold text.** A grid item defaults to
`min-width: auto`, which means one long unbreakable string widens its track past
its share and pushes the layout off the page. This is the single most common
cause of "the right column is cut off".

**One heavy element per screen.** The buy button is the only filled, high-
contrast thing in the column. Fit, fabric, details, care and delivery used to be
five separate bordered cards; five competing boxes in a 26rem column is no
hierarchy at all. They are one accordion with hairline dividers now.

**Size the panel, not the image.** The gallery is a tinted panel that always
fills the column — `w-full`, `aspect-ratio: 4/5`, `max-height: 78vh` — with the
shot inside it under `object-cover`.

Sizing the *image* instead means any surplus becomes page background beside it,
which reads as a hole. Sizing the panel puts the surplus inside the frame: a
short viewport crops a few percent off a full-bleed shot rather than leaving a
gap in the layout. Dead space is zero at every viewport width and height.

Two traps worth naming:

- Setting an explicit `height` pins the box below its track on every wide screen
  and leaves a gap beside it. It looks correct in whichever window you tested in.
- The crop is biased to `50% 38%`, above centre. A centred crop takes from both
  ends, and on a garment that is the collar and the hem — the two things that
  identify it. Costs nothing on a screen tall enough not to crop.

**4:5, not square.** Square is right for shoes, which are wider than they are
tall, and it is what most shoe storefronts use. On a garment it takes the head
and the hem. 4:5 is what Zara, COS, Uniqlo and Everlane shoot to, and every
image `scripts/images.mjs` produces is 900×1125.

The ratio decides when the height cap starts to bite, in a 564px column:

| Ratio | Height at full width | Crops below a viewport of |
| --- | --- | --- |
| 1:1 | 564px | 723px |
| **4:5** | **705px** | **904px** |
| 3:4 | 752px | 964px |
| 2:3 | 846px | 1085px |

**Thumbnails beside the image on desktop, not below.** Below costs 100px of
vertical room, which for a portrait ratio is the dimension already under
pressure — the image gets shorter and the crop gets worse. A shoe store can put
them underneath because a square image has height to spare. Five, then a `+N`:
a rail longer than the image beside it stops reading as a control.

**Type scale follows the column.** The product title is `display-md`, not
`display-lg` — the larger step tops out near 52px, which in a 26rem column is
three words a line and a heading taller than the price, the picker and the
button combined.

## Spacing and shape

- `rounded-xs` is 2px. Almost everything uses it. Fashion retail reads as
  cheaper the rounder it gets.
- Section rhythm is `py-16 md:py-20`, and alternating bands use `bg-surface`
  against the `page` ground rather than borders.
- `.wrap` is the container: 1440px max, 1.25rem gutters rising to 3rem.
- Shadows come in three steps — `card`, `lift`, `panel` — and no element uses a
  custom one.
