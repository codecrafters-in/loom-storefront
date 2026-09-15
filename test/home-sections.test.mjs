import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  actionsOf,
  faqOf,
  featuredProductOf,
  featuresGrid,
  featuresOf,
  imageOf,
  isExternal,
  logoRow,
  logosOf,
  onDark,
  testimonialsGrid,
  testimonialsOf,
  tilesLayout,
  tilesOf,
} from '../src/lib/home-sections.js'

/*
 * The nine newer home section types, as a merchant fills them in.
 *
 * A section arrives half-finished more often than not: a tile still waiting for its photo, a question with no answer
 * yet. The item that cannot be drawn is left out, the rest show, and nothing throws.
 */

const cols = (classes, prefix) => {
  const match = classes.split(' ').find((c) => c.startsWith(`${prefix}grid-cols-`))
  return match ? Number(match.slice(`${prefix}grid-cols-`.length)) : null
}

const photo = { url: 'https://x.test/a.jpg', alt: 'A coat' }

test('an image needs an address; buttons need a label and a place to go, two at most', () => {
  assert.equal(imageOf(undefined), null)
  assert.equal(imageOf({ alt: 'no address' }), null)
  assert.equal(imageOf({ url: '  ' }), null)
  assert.deepEqual(imageOf({ url: '/a.jpg' }), { url: '/a.jpg', alt: '', srcset: undefined })
  const sizes = [{ width: 512, url: 'https://x.test/a-512.jpg' }]
  assert.deepEqual(imageOf({ ...photo, srcset: sizes, extra: 1 }).srcset, sizes)

  const actions = actionsOf([
    { label: 'Shop', to: '/shop' },
    { label: 'No link' },
    null,
    { label: 'Linen', to: '/collections/linen', variant: 'sparkly' },
    { label: 'Third', to: '/c', variant: 'primary' },
  ])
  assert.deepEqual(actions, [
    { label: 'Shop', to: '/shop', variant: 'accent' },
    { label: 'Linen', to: '/collections/linen', variant: 'outline' },
  ])
  assert.deepEqual(actionsOf('nonsense'), [])
  assert.equal(actionsOf([{ label: 'A', to: '/a', variant: 'quiet' }])[0].variant, 'quiet')
})

test('buttons on a dark ground stay readable, whichever variant was chosen', () => {
  assert.deepEqual(onDark('accent'), { variant: 'accent', className: '' })
  assert.equal(onDark('primary').variant, 'quiet')
  assert.equal(onDark('quiet').variant, 'quiet')
  for (const variant of ['outline', 'ghost']) {
    const { variant: drawn, className } = onDark(variant)
    assert.equal(drawn, 'outline')
    assert.match(className, /!text-page/)
    assert.match(className, /hover:!text-ink/)
  }
})

test('links to another site open as plain links', () => {
  for (const to of ['https://vogue.example', 'http://x.test', '//cdn.x.test', 'mailto:hi@x.test', 'tel:+15550100']) assert.ok(isExternal(to), to)
  for (const to of ['/shop', '/collections/linen?sort=newest', '', undefined, 'shop']) assert.ok(!isExternal(to), String(to))
})

test('image tiles: a tile needs a title, a photo and a link; four at most', () => {
  const tiles = tilesOf([
    { title: 'Women', to: '/shop/women', image: photo, label: 'Shop now' },
    { title: 'Men', to: '/shop/men' },
    { title: '', to: '/shop/kids', image: photo },
    { title: 'Linen', to: '/collections/linen', image: photo, body: 'Cool for summer.' },
    { title: 'Knit', to: '/shop/knitwear', image: photo },
    { title: 'Coats', to: '/shop/outerwear', image: photo },
    { title: 'Five', to: '/5', image: photo },
  ])
  assert.deepEqual(tiles.map((t) => t.title), ['Women', 'Linen', 'Knit', 'Coats'])
  assert.equal(tiles[0].label, 'Shop now')
  assert.deepEqual(tilesOf(undefined), [])
})

test('image tiles: as many columns as tiles on a computer, stacked or two by two on a phone', () => {
  assert.equal(tilesLayout(0), null)
  assert.equal(tilesLayout('x'), null)
  assert.equal(cols(tilesLayout(2).grid, ''), 1)
  assert.equal(cols(tilesLayout(2).grid, 'sm:'), 2)
  assert.equal(cols(tilesLayout(3).grid, ''), 1)
  assert.equal(cols(tilesLayout(3).grid, 'md:'), 3)
  assert.equal(cols(tilesLayout(4).grid, ''), 2, 'four make two by two on a phone')
  assert.equal(cols(tilesLayout(4).grid, 'lg:'), 4)
  assert.equal(tilesLayout(4).compact, true)
  assert.equal(tilesLayout(9), tilesLayout(4))
  for (const n of [1, 2, 3, 4]) assert.ok(tilesLayout(n).sizes && tilesLayout(n).shot, String(n))
})

test('features: a title is enough; six at most, with paragraphs and an optional link', () => {
  const items = featuresOf([
    { icon: 'leaf', title: 'Natural fibres', body: 'Linen and wool.\n\nNamed mills.' },
    { title: '   ' },
    { image: photo, title: 'Mended', to: '/pages/care' },
    ...Array.from({ length: 6 }, (_, i) => ({ title: `Extra ${i}` })),
  ])
  assert.equal(items.length, 6)
  assert.deepEqual(items[0].body, ['Linen and wool.', 'Named mills.'])
  assert.equal(items[0].icon, 'leaf')
  assert.equal(items[1].image.url, photo.url)
  assert.equal(items[1].to, '/pages/care')
  assert.equal(items[2].body.length, 0)
})

test('features: one per row on a phone; four make two by two on a tablet and one row on a computer', () => {
  assert.equal(cols(featuresGrid(4), ''), null)
  assert.equal(cols(featuresGrid(4), 'sm:'), 2)
  assert.equal(cols(featuresGrid(4), 'lg:'), 4)
  assert.equal(featuresGrid(3), 'sm:grid-cols-3 lg:grid-cols-3')
  assert.equal(featuresGrid(2), 'sm:grid-cols-2 lg:grid-cols-2')
  assert.equal(featuresGrid(5), 'sm:grid-cols-3 lg:grid-cols-3')
  assert.equal(featuresGrid(6), 'sm:grid-cols-3 lg:grid-cols-3')
  for (const value of [0, undefined, null, -1, 'x']) assert.equal(featuresGrid(value), '')
})

test('testimonials: a quote and its author; stars only for a rating of 1 to 5; a product link needs slug and title', () => {
  const items = testimonialsOf([
    { quote: 'Still my favourite coat.', author: 'Maya R.', detail: 'Brooklyn', rating: 5, product: { slug: 'wool-coat', title: 'Wool coat' } },
    { quote: 'No author.' },
    { author: 'No quote' },
    { quote: 'Fits well.\n\nWashes well.', author: 'Sam', rating: 7, product: { slug: 'x' }, image: { url: '' } },
    { quote: 'Good.', author: 'Ana', rating: '4.4', image: photo },
    { quote: 'Fine.', author: 'Lee', rating: 0 },
  ])
  assert.deepEqual(items.map((i) => i.author), ['Maya R.', 'Sam', 'Ana', 'Lee'])
  assert.equal(items[0].rating, 5)
  assert.deepEqual(items[0].product, { slug: 'wool-coat', title: 'Wool coat' })
  assert.equal(items[1].rating, null)
  assert.equal(items[1].product, null)
  assert.equal(items[1].image, null)
  assert.deepEqual(items[1].quote, ['Fits well.', 'Washes well.'])
  assert.equal(items[2].rating, 4)
  assert.equal(items[3].rating, null)
})

test('testimonials: up to three per row on a computer, in even rows', () => {
  assert.equal(testimonialsGrid(3), 'lg:grid-cols-3')
  assert.equal(testimonialsGrid(4), 'lg:grid-cols-2')
  assert.equal(testimonialsGrid(5), 'lg:grid-cols-3')
  assert.equal(testimonialsGrid(1), 'lg:grid-cols-1')
  assert.equal(testimonialsGrid(0), '')
})

test('logo bar: a logo needs a name, or an image that says what it is', () => {
  const logos = logosOf([{ name: 'Vogue', image: photo, to: 'https://vogue.example' }, { image: { url: '/l.svg', alt: 'Monocle' } }, { image: { url: '/l.svg' } }, { name: 'GQ' }])
  assert.deepEqual(logos.map((l) => l.name), ['Vogue', 'Monocle', 'GQ'])
  assert.equal(logos[2].image, null)
  assert.equal(logos[2].to, '')
})

test('logo bar: logos wrap in even rows, up to four on a tablet and six on a computer', () => {
  assert.equal(logoRow(4), 'md:basis-1/4 lg:basis-1/4')
  assert.equal(logoRow(5), 'md:basis-1/3 lg:basis-1/5')
  assert.equal(logoRow(6), 'md:basis-1/3 lg:basis-1/6')
  assert.equal(logoRow(8), 'md:basis-1/4 lg:basis-1/4')
  assert.equal(logoRow(0), '')
})

test('faq: a question with its answer, the answer in paragraphs', () => {
  const items = faqOf([{ question: 'Sizes?', answer: 'True to size.\n\n\nSize up for layering.' }, { question: 'Empty?', answer: '  ' }, { answer: 'No question' }])
  assert.deepEqual(items, [{ question: 'Sizes?', answer: ['True to size.', 'Size up for layering.'] }])
})

test('featured product: nothing without a slug and title; first photo, brand as a name, prices only as amounts', () => {
  assert.equal(featuredProductOf(undefined), null)
  assert.equal(featuredProductOf({ slug: 'coat' }), null)
  const product = featuredProductOf({
    slug: 'coat',
    title: 'Wool coat',
    images: [{ url: '' }, photo],
    brand: { name: 'LOOM' },
    price: { amount: 24000, currency: 'USD' },
    compareAtPrice: { amount: 32000, currency: 'USD' },
  })
  assert.equal(product.image.url, photo.url)
  assert.equal(product.brand, 'LOOM')
  assert.equal(product.price.amount, 24000)
  assert.equal(product.compareAtPrice.amount, 32000)
  const summary = featuredProductOf({ slug: 's', title: 'S', image: photo, brand: 'Mill', price: { amount: 'x' }, compareAtPrice: { amount: 1 } })
  assert.equal(summary.image.url, photo.url)
  assert.equal(summary.brand, 'Mill')
  assert.equal(summary.price, null)
  assert.equal(summary.compareAtPrice, null, 'no was-price without a price')
})
