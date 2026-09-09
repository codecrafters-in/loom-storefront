/**
 * Product enrichment.
 *
 * Three blocks, each answering a different question and each earning its place
 * on the page differently:
 *
 *   highlights   Six key/value pairs above the fold. The scan, not the read —
 *                a shopper deciding whether to keep reading at all.
 *   features     Icon, title, a sentence. The two or three things that make
 *                this piece different, in the merchant's own words.
 *   specs        The full table, grouped, below the fold. Nobody reads it
 *                cover to cover; everybody uses it to check one thing.
 *
 * The split matters. Putting everything in one long table means the shopper
 * either reads none of it or has to hunt for the two facts that would have
 * decided the purchase. Putting everything above the fold means the buy button
 * moves off the screen.
 *
 * `attributes.js` supplies the suggested keys and values; nothing here is
 * required, and every block degrades to nothing when a product has no data.
 */

const shirtSpecs = (extra = {}) => ({
  sleeve: 'Full sleeve',
  closure: 'Button',
  lining: 'Unlined',
  hem: 'Straight',
  idealFor: 'Unisex',
  ...extra,
})

export const productEnrichment = {
  'oxford-shirt-ecru': {
    highlights: [
      { key: 'fabric', value: 'Pure cotton' },
      { key: 'weave', value: 'Oxford' },
      { key: 'neck', value: 'Button-down collar' },
      { key: 'fit', value: 'Relaxed' },
      { key: 'weight', value: '140 gsm' },
      { key: 'occasion', value: 'Everyday' },
    ],
    features: [
      {
        icon: 'sparkle',
        title: 'Washed twice before it is cut',
        body: 'So the collar sits flat from the first wear rather than the fifteenth, and the shirt does not shrink into a different size after a month.',
      },
      {
        icon: 'ruler',
        title: 'A half-size roomier through the chest',
        body: 'Cut wider than a dress shirt on purpose. It is meant to be worn open over a tee, not tucked under a jacket.',
      },
      {
        icon: 'award',
        title: 'Single-needle side seams',
        body: 'One row of stitching instead of two. Slower to make, flatter against the body, and it does not twist in the wash.',
      },
    ],
    specs: shirtSpecs({ pattern: 'Solid', stretch: 'None', transparency: 'Opaque', care: 'Machine wash cold' }),
  },

  'linen-camp-shirt': {
    highlights: [
      { key: 'fabric', value: 'Linen' },
      { key: 'weight', value: '190 gsm' },
      { key: 'neck', value: 'Camp collar' },
      { key: 'fit', value: 'Boxy' },
      { key: 'season', value: 'Spring/Summer' },
      { key: 'occasion', value: 'Everyday' },
    ],
    features: [
      {
        icon: 'leaf',
        title: 'European flax, not generic linen',
        body: 'Grown in the Kortrijk belt where flax has been retted in the fields for centuries. Longer fibres, so it softens rather than pills.',
      },
      {
        icon: 'wind',
        title: 'Heavy enough to hang',
        body: '190gsm is roughly twice a summer shirting. It is the difference between linen that looks considered and linen that looks slept in.',
      },
      {
        icon: 'sun',
        title: 'A collar that holds an open neck',
        body: 'Cut wide and interfaced lightly, so it stays where you put it instead of collapsing by lunchtime.',
      },
    ],
    specs: shirtSpecs({ sleeve: 'Half sleeve', pattern: 'Solid', transparency: 'Opaque', care: 'Machine wash cold' }),
  },

  'merino-crew-knit': {
    highlights: [
      { key: 'fabric', value: 'Merino wool' },
      { key: 'weight', value: '260 gsm' },
      { key: 'neck', value: 'Crew neck' },
      { key: 'fit', value: 'Regular' },
      { key: 'season', value: 'All year' },
      { key: 'care', value: 'Wool cycle' },
    ],
    features: [
      {
        icon: 'thermometer',
        title: '19.5 micron, so it can go against skin',
        body: 'Anything above about 22 micron is the wool people remember itching. This is fine enough to wear with nothing underneath.',
      },
      {
        icon: 'award',
        title: 'Fully fashioned, not cut and sewn',
        body: 'Each panel is knitted to shape rather than cut from a sheet. No bulk at the shoulder seam and nothing to unravel.',
      },
      {
        icon: 'recycle',
        title: 'Responsible Wool Standard',
        body: 'Audited end to end, from the farm to the yarn. Mulesing-free and traceable to the flock.',
      },
    ],
    specs: {
      sleeve: 'Full sleeve', pattern: 'Solid', lining: 'Unlined', idealFor: 'Unisex',
      stretch: 'Slight', care: 'Hand wash cool', repairable: 'Yes',
    },
  },

  'selvedge-denim-straight': {
    highlights: [
      { key: 'fabric', value: 'Denim' },
      { key: 'weight', value: '460 gsm' },
      { key: 'fit', value: 'Regular' },
      { key: 'rise', value: 'Mid' },
      { key: 'closure', value: 'Button' },
      { key: 'occasion', value: 'Everyday' },
    ],
    features: [
      {
        icon: 'award',
        title: 'Shuttle-loomed in Okayama',
        body: 'Narrow looms running at a fraction of the speed of a projectile loom, which is what produces a self-finished edge that will not fray.',
      },
      {
        icon: 'droplet',
        title: 'Sold raw and unwashed',
        body: 'Expect a stiff first month, indigo on your hands, and then a pair that has creased to you and nobody else.',
      },
      {
        icon: 'ruler',
        title: 'Straight through the thigh, no taper',
        body: 'The leg opening matches the knee. It sits over a boot without bunching and does not read as a skinny fit that gave up.',
      },
    ],
    specs: {
      pattern: 'Solid', hem: 'Unfinished', idealFor: 'Unisex', stretch: 'None',
      legOpening: '20', care: 'Machine wash cold', repairable: 'Yes',
    },
  },

  'wool-overcoat': {
    highlights: [
      { key: 'fabric', value: 'Virgin wool' },
      { key: 'weight', value: '750 gsm' },
      { key: 'lining', value: 'Unlined' },
      { key: 'fit', value: 'Tailored' },
      { key: 'season', value: 'Autumn/Winter' },
      { key: 'care', value: 'Dry clean only' },
    ],
    features: [
      {
        icon: 'award',
        title: 'Double-faced, hand-stitched at every edge',
        body: 'Two cloths bonded, then split and closed by hand. No lining, no bulk, and a coat that drapes instead of standing away from you.',
      },
      {
        icon: 'thermometer',
        title: '750gsm without the weight',
        body: 'Warm because it is dense rather than because it is padded, so it holds a shoulder line a puffer never will.',
      },
      {
        icon: 'recycle',
        title: 'Made to be repaired',
        body: 'Unlined construction means a tear is reachable. Send it back and we quote before touching it.',
      },
    ],
    specs: {
      sleeve: 'Full sleeve', closure: 'Button', pattern: 'Solid', idealFor: 'Unisex',
      occasion: 'Formal', repairable: 'Yes',
    },
  },

  'cashmere-crew': {
    highlights: [
      { key: 'fabric', value: 'Cashmere' },
      { key: 'weight', value: '300 gsm' },
      { key: 'neck', value: 'Crew neck' },
      { key: 'fit', value: 'Regular' },
      { key: 'season', value: 'Autumn/Winter' },
      { key: 'care', value: 'Hand wash cool' },
    ],
    features: [
      {
        icon: 'star',
        title: 'Grade-A, which is a fibre length not a marketing word',
        body: 'Longer fibres are what decide whether a sweater pills in a season or softens for a decade. Grade-A is 34mm and up.',
      },
      {
        icon: 'award',
        title: 'Two-ply, knitted in Hawick',
        body: 'Two yarns twisted together before knitting. Twice the work and roughly twice the life of a single-ply at the same gauge.',
      },
      {
        icon: 'refresh',
        title: 'Comb it, do not shave it',
        body: 'A cashmere comb lifts pills off. A razor cuts the fibres and guarantees more of them next month.',
      },
    ],
    specs: {
      sleeve: 'Full sleeve', pattern: 'Solid', lining: 'Unlined', idealFor: 'Unisex',
      stretch: 'Slight', repairable: 'Yes',
    },
  },
}

/**
 * Compliance fields.
 *
 * Legally required on an e-commerce listing in several markets — India's Legal
 * Metrology rules mandate the manufacturer and packer address, the country of
 * origin and the net quantity — so this is a first-class block rather than
 * something to bury in the description.
 */
export const manufacturerInfo = {
  genericName: 'Apparel',
  countryOfOrigin: 'See product specifications',
  manufacturer: 'LOOM Studio, 14 Bhagwati Estate, Narol, Ahmedabad 382405, India',
  packer: 'LOOM Studio, 14 Bhagwati Estate, Narol, Ahmedabad 382405, India',
  importer: 'Not applicable — dispatched from origin',
  netQuantity: '1',
  packOf: '1',
}

export default productEnrichment
