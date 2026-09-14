/**
 * The demo's products that are not clothes.
 *
 * A theme that says it sells anything has to be seen selling something other
 * than a shirt, or "any vertical" is a claim nobody can check. Each product here
 * exists to exercise one shape the apparel catalogue never had:
 *
 *  - `nova-phone` — two options that are not Colour and Size (Storage × Color),
 *    a combination that was never made, a sold-out one, a film in the gallery,
 *    an optional case offered on add, and specifications labelled by the store.
 *  - `field-notebook` — no options at all, and exact stock levels.
 *  - `brass-pen` — a radio option the gallery follows, an engraving priced on
 *    top with text the shopper types, and checkbox add-ons.
 *  - `house-coffee` — sold by the quarter kilo, a grind whose variants are made
 *    when bought (priced by `POST /products/:slug/combination`), stock hidden.
 *  - `desk-set` — a combo: one item from each group.
 *  - `garment-care-handbook` — digital, with a file to download once paid.
 *  - `leather-phone-case` — the accessory the others point at.
 *
 * Authored in the contract's own shape (ids, `optionIds`, `specList`) rather
 * than derived like the apparel, so the demo shows exactly what a Phase 2
 * backend sends. Prices are major units here and minor units on the wire.
 */

const CURRENCY = 'USD'
const usd = (major) => ({ amount: Math.round(major * 100), currency: CURRENCY })
const shot = (id, alt, extra = {}) => ({ id, url: `/images/products/${id}.svg`, alt, width: 900, height: 1125, ...extra })
const choice = (id, name, extra = {}) => ({ id, name, color: null, image: null, priceExtra: null, custom: false, ...extra })
const spec = (key, label, group, groupLabel, value, unit = null, facet = false) => ({ key, label, group, groupLabel, value, unit, ...(facet ? { facet } : {}) })

function variant(id, { options = {}, optionIds = {}, price, inventory, imageId = null }) {
  return {
    id,
    sku: id.replace(/^var_/, '').toUpperCase(),
    options,
    optionIds,
    price: usd(price),
    compareAtPrice: null,
    inventory,
    available: inventory > 0,
    imageId,
  }
}

/** Fills what every product carries, the way `build()` does for the apparel. */
function product(p, index) {
  const live = p.variants.filter((v) => v.available)
  return {
    id: `prod_any_${index + 1}`,
    type: 'goods',
    care: [],
    compareAtPrice: null,
    brand: null,
    swatches: {},
    published: true,
    fit: null,
    fabric: null,
    sizeChartId: null,
    createdAt: new Date(2026, 6, 1 + index * 9).toISOString(),
    ...p,
    price: p.variants.map((v) => v.price).reduce((a, b) => (b.amount < a.amount ? b : a)),
    // Low stock is about choices running out, so a product with one or two
    // variants never wears the badge just for existing.
    badges: [
      ...(p.badges || []),
      ...(live.length === 0 ? ['sold-out'] : p.variants.length > 2 && live.length <= 2 ? ['low-stock'] : []),
    ],
    social: {
      unitsAvailable: p.variants.reduce((a, v) => a + v.inventory, 0),
      boughtLast30Days: 8 + index * 11,
      savedCount: 5 + index * 4,
    },
  }
}

const RETURNS = {
  icon: 'refresh',
  label: '30-day returns',
  note: 'Unused and in its packaging. A prepaid label is in every parcel, and the refund goes back to your original payment method.',
}

export const brands = [
  {
    slug: 'nova',
    name: 'Nova',
    logo: { url: '/images/brands/nova.svg', alt: 'Nova' },
    description: 'Phones built to be kept for five years, and repaired in between.',
    seo: { title: 'Nova phones and accessories', description: 'Repairable phones with five years of updates, and the cases made for them.' },
  },
  {
    slug: 'field-office',
    name: 'Field Office',
    logo: null,
    description: 'Paper and brass for the desk, made in small runs in Porto.',
    seo: { title: 'Field Office stationery', description: 'Thread-sewn notebooks and solid brass pens, made in small runs.' },
  },
  {
    slug: 'north-roast',
    name: 'North Roast',
    logo: null,
    description: 'A two-person roastery that roasts on Tuesdays and ships on Wednesdays.',
    seo: { title: 'North Roast coffee', description: 'Washed coffees roasted every Tuesday and ground to order.' },
  },
]

/** A third level under Goods, so breadcrumbs and category pages are tested past two. */
export const anyCategories = [
  { slug: 'goods', name: 'Goods', parent: null, blurb: 'Things we did not sew: paper, brass, coffee and a phone.', image: { url: '/images/categories/goods.svg', alt: 'A notebook, a brass pen and a bag of coffee' } },
  { slug: 'goods-desk', name: 'Desk', parent: 'goods', blurb: 'Paper and brass, and a handbook for the clothes.', image: { url: '/images/categories/goods.svg', alt: 'Desk' } },
  { slug: 'goods-pantry', name: 'Pantry', parent: 'goods', blurb: 'Coffee, ground the way you brew it.', image: { url: '/images/categories/goods.svg', alt: 'Pantry' } },
  { slug: 'goods-tech', name: 'Tech', parent: 'goods', blurb: 'Fewer devices, kept longer.', image: { url: '/images/categories/goods.svg', alt: 'Tech' } },
  { slug: 'goods-tech-phones', name: 'Phones', parent: 'goods-tech', blurb: 'A phone, and what goes around it.', image: { url: '/images/categories/goods.svg', alt: 'Phones' } },
]

const nova = brands[0]
const brandRef = ({ slug, name, logo }) => ({ slug, name, logo })

const phoneVariant = (storage, color, price, inventory) =>
  variant(`var_nova_phone_${storage}_${color.toLowerCase()}`, {
    options: { Storage: `${storage} GB`, Color: color },
    optionIds: { storage: `storage-${storage}`, color: `color-${color.toLowerCase()}` },
    price,
    inventory,
    imageId: `nova-phone-${color.toLowerCase()}`,
  })

const RAW = [
  {
    slug: 'nova-phone',
    title: 'Nova Phone 2',
    subtitle: '6.1-inch OLED, two-day battery, five years of updates',
    description:
      'A phone sized for one hand and built to be kept: a battery you can replace, a frame held with screws rather than glue, and five years of software updates written into the warranty. The 256 GB is the one most people should buy.',
    details: ['Nova Phone 2', 'USB-C cable, 1 m', 'SIM tool', 'Printed repair guide'],
    brand: brandRef(nova),
    categories: ['goods', 'goods-tech', 'goods-tech-phones'],
    tags: ['tech'],
    rating: { average: 4.6, count: 58 },
    images: [
      shot('nova-phone-graphite', 'Nova Phone 2 in Graphite', { color: 'Graphite' }),
      shot('nova-phone-2', 'Nova Phone 2, the camera module'),
      shot('nova-phone-silver', 'Nova Phone 2 in Silver', { color: 'Silver' }),
      shot('nova-phone-sage', 'Nova Phone 2 in Sage', { color: 'Sage' }),
      {
        id: 'nova-phone-film',
        type: 'video',
        provider: 'youtube',
        // A Creative Commons short from the Blender Foundation stands in for a
        // product film. Privacy-enhanced, and only loaded once somebody asks.
        embedUrl: 'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ',
        url: '/images/products/nova-phone-2.svg',
        alt: 'Sample film: Big Buck Bunny, Blender Foundation',
      },
    ],
    options: [
      {
        id: 'storage', name: 'Storage', displayType: 'pills', role: null, imagesFollow: false, mode: 'variant',
        values: ['128 GB', '256 GB', '512 GB'],
        choices: [
          choice('storage-128', '128 GB'),
          choice('storage-256', '256 GB', { priceExtra: usd(100) }),
          choice('storage-512', '512 GB', { priceExtra: usd(300) }),
        ],
      },
      {
        id: 'color', name: 'Color', displayType: 'color', role: 'color', imagesFollow: true, mode: 'variant',
        values: ['Graphite', 'Silver', 'Sage'],
        choices: [
          choice('color-graphite', 'Graphite', { color: '#4A4C50' }),
          choice('color-silver', 'Silver', { color: '#D9DADC' }),
          choice('color-sage', 'Sage', { color: '#A7B39A' }),
        ],
      },
    ],
    // 512 GB is not made in Sage, and 128 GB Silver has sold out: the picker
    // has to tell those two apart.
    variants: [
      phoneVariant(128, 'Graphite', 699, 8),
      phoneVariant(128, 'Silver', 699, 0),
      phoneVariant(128, 'Sage', 699, 12),
      phoneVariant(256, 'Graphite', 799, 3),
      phoneVariant(256, 'Silver', 799, 6),
      phoneVariant(256, 'Sage', 799, 9),
      phoneVariant(512, 'Graphite', 999, 4),
      phoneVariant(512, 'Silver', 999, 7),
    ],
    stock: { display: 'low', lowThreshold: 5 },
    quantity: { min: 1, max: 2, step: 1, unit: 'Units', decimals: false },
    optionalProductSlugs: ['leather-phone-case'],
    accessorySlugs: ['leather-phone-case', 'field-notebook'],
    enrichment: {
      labels: { details: 'In the box' },
      highlights: [
        { key: 'screen_size', label: 'Screen size', value: '6.1 in' },
        { key: 'battery_capacity', label: 'Battery capacity', value: '4,000 mAh' },
        { key: 'camera', label: 'Main camera', value: '48 MP' },
        { key: 'phone_weight', label: 'Weight', value: '172 g' },
      ],
      features: [
        { icon: 'refresh', title: 'Five years of updates', body: 'Security and system updates until 2031, in writing. A phone that stops getting them is a phone you have to replace, whatever state the hardware is in.' },
        { icon: 'shield', title: 'A battery you can change', body: 'Six screws and a pull tab. The battery is the part that wears first, so it is the part that should be the easiest to replace.' },
      ],
      assurances: [
        RETURNS,
        { icon: 'shield', label: 'Two-year warranty, repairs in five working days', note: 'Screen and battery repairs are fixed-price after the warranty, and the prices are published.' },
      ],
      specs: { screen_size: '6.1 in', battery_capacity: '4,000 mAh', camera: '48 MP', phone_weight: '172 g', water_resistance: 'IP68' },
      specList: [
        spec('screen_size', 'Screen size', 'display', 'Display', '6.1', 'in', true),
        spec('resolution', 'Resolution', 'display', 'Display', '2532 × 1170'),
        spec('refresh_rate', 'Refresh rate', 'display', 'Display', '120', 'Hz'),
        spec('battery_capacity', 'Battery capacity', 'battery', 'Battery & charging', '4,000', 'mAh'),
        spec('charging', 'Charging', 'battery', 'Battery & charging', '30 W wired, 15 W wireless'),
        spec('camera', 'Main camera', 'camera', 'Camera', '48', 'MP'),
        spec('front_camera', 'Front camera', 'camera', 'Camera', '12', 'MP'),
        spec('phone_weight', 'Weight', 'general', 'General', '172', 'g'),
        spec('water_resistance', 'Water resistance', 'general', 'General', 'IP68', null, true),
      ],
      manufacturer: {
        genericName: 'Mobile phone',
        countryOfOrigin: 'India',
        manufacturer: 'Nova Devices, Chennai 600032, India',
        packer: 'Nova Devices, Chennai 600032, India',
        netQuantity: '1 N',
        packOf: '1',
      },
    },
  },
  {
    slug: 'field-notebook',
    title: 'Field Notebook',
    subtitle: 'A5, dot grid, 192 pages of 90 gsm paper',
    description:
      'Thread-sewn so it lies flat from the first page, on paper heavy enough for a fountain pen not to show through. The cover is cloth over board and takes a year in a bag without going soft at the corners.',
    details: ['192 pages, dot grid', '90 gsm acid-free paper', 'Thread-sewn, lays flat', 'Cloth-bound board cover'],
    brand: brandRef(brands[1]),
    categories: ['goods', 'goods-desk'],
    tags: ['paper'],
    rating: { average: 4.8, count: 41 },
    images: [shot('field-notebook-1', 'Field Notebook, closed'), shot('field-notebook-2', 'Field Notebook, open on a dot grid spread')],
    options: [],
    variants: [variant('var_field_notebook', { price: 18, inventory: 40, imageId: 'field-notebook-1' })],
    stock: { display: 'exact', lowThreshold: 5 },
    quantity: { min: 1, max: 20, step: 1, unit: 'Units', decimals: false },
    accessorySlugs: ['brass-pen'],
    enrichment: {
      labels: { details: 'Details' },
      highlights: [
        { key: 'pages', label: 'Pages', value: '192' },
        { key: 'paper_weight', label: 'Paper', value: '90 gsm' },
        { key: 'ruling', label: 'Ruling', value: 'Dot grid' },
      ],
      features: [
        { icon: 'ruler', title: 'Lies flat on page one', body: 'Thread-sewn signatures rather than glue, so the book opens flat without breaking its spine.' },
      ],
      assurances: [RETURNS],
      specs: { pages: '192', paper_weight: '90 gsm', ruling: 'Dot grid', page_size: 'A5' },
      specList: [
        spec('pages', 'Pages', 'paper', 'Paper', '192'),
        spec('paper_weight', 'Paper weight', 'paper', 'Paper', '90', 'gsm'),
        spec('ruling', 'Ruling', 'paper', 'Paper', 'Dot grid', null, true),
        spec('page_size', 'Size', 'paper', 'Paper', 'A5 (148 × 210 mm)'),
        spec('binding', 'Binding', 'binding', 'Binding', 'Thread-sewn'),
        spec('cover', 'Cover', 'binding', 'Binding', 'Cloth over board'),
      ],
      manufacturer: { genericName: 'Notebook', countryOfOrigin: 'Portugal', manufacturer: 'Field Office, Porto 4000-322, Portugal', netQuantity: '1 N', packOf: '1' },
    },
  },
  {
    slug: 'brass-pen',
    title: 'Brass Pocket Pen',
    subtitle: 'Solid brass, takes a standard refill',
    description:
      'Machined from one bar of brass, so it has the weight of something that will outlast its refills. Raw brass darkens where your hand holds it; the blackened finish wears back to brass at the edges instead.',
    details: ['Solid brass body and cap', 'Takes any G2-style refill', 'Black ink refill fitted', 'Engraving by hand, up to four letters'],
    brand: brandRef(brands[1]),
    categories: ['goods', 'goods-desk'],
    tags: ['brass'],
    rating: { average: 4.7, count: 36 },
    images: [
      shot('brass-pen-1', 'Brass Pocket Pen in raw brass', { color: 'Raw brass' }),
      shot('brass-pen-2', 'Brass Pocket Pen, engraved initials'),
      shot('brass-pen-blackened', 'Brass Pocket Pen, blackened', { color: 'Blackened' }),
    ],
    options: [
      {
        // The gallery follows the finish, not a colour — `imagesFollow` is about
        // which option the photographs were taken per, whatever it is called.
        id: 'finish', name: 'Finish', displayType: 'radio', role: null, imagesFollow: true, mode: 'variant',
        values: ['Raw brass', 'Blackened'],
        choices: [choice('finish-raw', 'Raw brass'), choice('finish-blackened', 'Blackened', { priceExtra: usd(6) })],
      },
    ],
    extraOptions: [
      {
        id: 'engraving', name: 'Engraving', displayType: 'radio', multiple: false, required: true,
        choices: [
          choice('engraving-none', 'No engraving'),
          choice('engraving-initials', 'Initials', { priceExtra: usd(12), custom: true }),
        ],
      },
      {
        id: 'add-ons', name: 'Add-ons', displayType: 'pills', multiple: true, required: false,
        choices: [choice('add-gift-box', 'Gift box', { priceExtra: usd(5) }), choice('add-refills', 'Three spare refills', { priceExtra: usd(4) })],
      },
    ],
    variants: [
      variant('var_brass_pen_raw', { options: { Finish: 'Raw brass' }, optionIds: { finish: 'finish-raw' }, price: 28, inventory: 15, imageId: 'brass-pen-1' }),
      variant('var_brass_pen_blackened', { options: { Finish: 'Blackened' }, optionIds: { finish: 'finish-blackened' }, price: 34, inventory: 4, imageId: 'brass-pen-blackened' }),
    ],
    stock: { display: 'low', lowThreshold: 5 },
    quantity: { min: 1, max: 10, step: 1, unit: 'Units', decimals: false },
    optionalProductSlugs: ['field-notebook'],
    accessorySlugs: ['field-notebook', 'house-coffee'],
    enrichment: {
      labels: { details: 'Details' },
      highlights: [
        { key: 'body_material', label: 'Body', value: 'Solid brass' },
        { key: 'pen_length', label: 'Length', value: '130 mm' },
        { key: 'refill', label: 'Refill', value: 'G2-style' },
      ],
      features: [
        { icon: 'award', title: 'Engraved by hand', body: 'Up to four letters, cut into the barrel by hand rather than lasered on, so they do not wear off.' },
      ],
      assurances: [RETURNS],
      specs: { body_material: 'Solid brass', pen_length: '130 mm', pen_weight: '28 g', refill: 'G2-style' },
      specList: [
        spec('body_material', 'Body', 'body', 'Body', 'Solid brass', null, true),
        spec('pen_length', 'Length', 'body', 'Body', '130', 'mm'),
        spec('pen_weight', 'Weight', 'body', 'Body', '28', 'g'),
        spec('refill', 'Refill', 'writing', 'Writing', 'G2-style'),
        spec('ink', 'Ink', 'writing', 'Writing', 'Black'),
      ],
      manufacturer: { genericName: 'Ballpoint pen', countryOfOrigin: 'Portugal', manufacturer: 'Field Office, Porto 4000-322, Portugal', netQuantity: '1 N', packOf: '1' },
    },
  },
  {
    slug: 'house-coffee',
    title: 'House Coffee',
    subtitle: 'Washed Ethiopian and Colombian, sold by the kilo',
    description:
      'Roasted on Tuesdays and ground to order, so it arrives within a week of the roast. Buy it by the quarter kilo: a quarter lasts one person about a fortnight, which is about as long as ground coffee stays worth drinking.',
    details: ['Roasted every Tuesday', 'Ground to order', 'Valved, resealable bag', 'Price is per kilo'],
    brand: brandRef(brands[2]),
    categories: ['goods', 'goods-pantry'],
    tags: ['coffee'],
    rating: { average: 4.5, count: 22 },
    images: [shot('house-coffee-1', 'A bag of House Coffee'), shot('house-coffee-2', 'House Coffee beans')],
    options: [
      {
        // Dynamic: only the whole-bean variant exists until somebody buys a
        // grind, so the other grinds are priced by the server.
        id: 'grind', name: 'Grind', displayType: 'select', role: null, imagesFollow: false, mode: 'dynamic',
        values: ['Whole bean', 'Espresso', 'Filter', 'French press'],
        choices: [
          choice('grind-whole', 'Whole bean'),
          choice('grind-espresso', 'Espresso'),
          choice('grind-filter', 'Filter'),
          choice('grind-french-press', 'French press', { priceExtra: usd(2) }),
        ],
      },
    ],
    variants: [
      variant('var_house_coffee_whole', { options: { Grind: 'Whole bean' }, optionIds: { grind: 'grind-whole' }, price: 32, inventory: 60, imageId: 'house-coffee-1' }),
    ],
    stock: { display: 'hidden', lowThreshold: 5 },
    quantity: { min: 0.25, max: 5, step: 0.25, unit: 'kg', decimals: true },
    alternativeSlugs: ['field-notebook'],
    enrichment: {
      labels: { details: 'Details' },
      highlights: [
        { key: 'roast', label: 'Roast', value: 'Medium' },
        { key: 'coffee_origin', label: 'Origin', value: 'Ethiopia, Colombia' },
        { key: 'tasting_notes', label: 'Tastes of', value: 'Stone fruit, cocoa' },
      ],
      features: [
        { icon: 'sun', title: 'A week from roast', body: 'Roasted on Tuesday, ground and packed on Wednesday, with you by the weekend.' },
      ],
      assurances: [{ icon: 'refresh', label: 'Not for you? We replace the next bag', note: 'Tell us how you brew and we send a different roast instead. Opened food cannot come back, so we do it this way.' }],
      specs: { roast: 'Medium', coffee_origin: 'Ethiopia, Colombia', process: 'Washed', tasting_notes: 'Stone fruit, cocoa' },
      specList: [
        spec('roast', 'Roast', 'coffee', 'Coffee', 'Medium', null, true),
        spec('coffee_origin', 'Origin', 'coffee', 'Coffee', 'Ethiopia, Colombia'),
        spec('process', 'Process', 'coffee', 'Coffee', 'Washed'),
        spec('tasting_notes', 'Tasting notes', 'coffee', 'Coffee', 'Stone fruit, cocoa, brown sugar'),
      ],
      manufacturer: { genericName: 'Roasted coffee', countryOfOrigin: 'Ethiopia', manufacturer: 'North Roast, Leeds LS6 1AA, United Kingdom', netQuantity: 'By weight', packOf: '1' },
    },
  },
  {
    slug: 'desk-set',
    type: 'combo',
    title: 'The Desk Set',
    subtitle: 'A pen and a notebook, boxed together',
    description:
      'A Brass Pocket Pen and a Field Notebook in a recycled board box, for somebody who writes things down. Choose the finish of the pen; the set costs less than the two apart.',
    details: ['One Brass Pocket Pen', 'One Field Notebook', 'Recycled board box'],
    brand: brandRef(brands[1]),
    categories: ['goods', 'goods-desk'],
    tags: ['paper', 'brass', 'gift'],
    rating: { average: 4.9, count: 12 },
    images: [shot('desk-set-1', 'The Desk Set: notebook and pen'), shot('desk-set-2', 'The Desk Set in its box')],
    options: [],
    variants: [variant('var_desk_set', { price: 44, inventory: 25, imageId: 'desk-set-1' })],
    combo: [
      {
        id: 'combo-pen',
        name: 'Pen',
        items: [
          { id: 'combo-pen-raw', productSlug: 'brass-pen', variantId: 'var_brass_pen_raw', extraPrice: usd(0) },
          { id: 'combo-pen-blackened', productSlug: 'brass-pen', variantId: 'var_brass_pen_blackened', extraPrice: usd(6) },
        ],
      },
      {
        id: 'combo-notebook',
        name: 'Notebook',
        items: [{ id: 'combo-notebook-dot', productSlug: 'field-notebook', variantId: 'var_field_notebook', extraPrice: usd(0) }],
      },
    ],
    stock: { display: 'low', lowThreshold: 5 },
    quantity: { min: 1, max: 5, step: 1, unit: 'Units', decimals: false },
    enrichment: {
      labels: { details: 'In the box' },
      highlights: [{ key: 'set_contents', label: 'Contents', value: 'Pen and notebook' }, { key: 'box', label: 'Box', value: 'Recycled board' }],
      features: [{ icon: 'package', title: 'Ready to give', body: 'Boxed and wrapped in tissue, with the receipt left out.' }],
      assurances: [RETURNS],
      specs: { set_contents: 'Pen and notebook', box: 'Recycled board' },
      specList: [
        spec('set_contents', 'Contents', 'set', 'The set', 'Pen and notebook'),
        spec('set_pieces', 'Pieces', 'set', 'The set', '2'),
        spec('box', 'Box', 'set', 'The set', 'Recycled board'),
      ],
      manufacturer: { genericName: 'Stationery set', countryOfOrigin: 'Portugal', manufacturer: 'Field Office, Porto 4000-322, Portugal', netQuantity: '2 N', packOf: '2' },
    },
  },
  {
    slug: 'garment-care-handbook',
    type: 'digital',
    title: 'Garment Care Handbook',
    subtitle: 'A PDF on washing, drying, storing and mending',
    description:
      'Everything we know about keeping clothes going, by fibre: how to wash wool without felting it, how to dry linen so it needs less ironing, and the six stitches that mend most of what goes wrong. A download, not a parcel.',
    details: ['40-page PDF', 'Download link on your order page once paid', 'Free updates'],
    categories: ['goods', 'goods-desk'],
    tags: ['guide'],
    rating: { average: 4.8, count: 19 },
    images: [shot('garment-care-handbook-1', 'Garment Care Handbook cover'), shot('garment-care-handbook-2', 'Garment Care Handbook, a page')],
    options: [],
    variants: [variant('var_garment_care_handbook', { price: 12, inventory: 999, imageId: 'garment-care-handbook-1' })],
    stock: { display: 'hidden', lowThreshold: 5 },
    quantity: { min: 1, max: 1, step: 1, unit: 'Units', decimals: false },
    download: { name: 'Garment Care Handbook (PDF)', url: '/downloads/garment-care-handbook.pdf' },
    enrichment: {
      labels: { details: 'What you get' },
      highlights: [{ key: 'file_format', label: 'Format', value: 'PDF' }, { key: 'page_count', label: 'Pages', value: '40' }],
      features: [{ icon: 'sparkle', title: 'By fibre, not by garment', body: 'Wool, cotton, linen, silk and the blends, because the fibre decides the care and the label rarely says enough.' }],
      assurances: [{ icon: 'refresh', label: 'Refund within 14 days, no questions', note: 'A download cannot be sent back, so we simply refund it.' }],
      specs: { file_format: 'PDF', page_count: '40', language: 'English' },
      specList: [spec('file_format', 'Format', 'file', 'File', 'PDF', null, true), spec('page_count', 'Pages', 'file', 'File', '40'), spec('language', 'Language', 'file', 'File', 'English')],
      manufacturer: { genericName: 'Digital guide', countryOfOrigin: 'India', manufacturer: 'LOOM Studio, Ahmedabad 382405, India' },
    },
  },
  {
    slug: 'leather-phone-case',
    title: 'Leather Phone Case',
    subtitle: 'Vegetable-tanned leather, for Nova Phone 2',
    description:
      'A case cut from one piece of vegetable-tanned leather and stitched by hand at the edge. It darkens where you hold it, which is the point of leather rather than a flaw in it.',
    details: ['Vegetable-tanned leather', 'Hand-stitched edge', 'Fits Nova Phone 2'],
    categories: ['goods', 'goods-tech', 'goods-tech-phones'],
    tags: ['leather', 'tech'],
    rating: { average: 4.4, count: 15 },
    images: [shot('leather-phone-case-1', 'Leather Phone Case'), shot('leather-phone-case-2', 'Leather Phone Case, stitching detail')],
    options: [],
    variants: [variant('var_leather_phone_case', { price: 39, inventory: 30, imageId: 'leather-phone-case-1' })],
    stock: { display: 'low', lowThreshold: 5 },
    quantity: { min: 1, max: 5, step: 1, unit: 'Units', decimals: false },
    accessorySlugs: ['nova-phone'],
    enrichment: {
      labels: { details: 'Details' },
      highlights: [{ key: 'case_material', label: 'Material', value: 'Vegetable-tanned leather' }, { key: 'fits', label: 'Fits', value: 'Nova Phone 2' }],
      features: [{ icon: 'leaf', title: 'Tanned with bark', body: 'Vegetable tanning takes weeks rather than hours, and it is why the leather ages instead of cracking.' }],
      assurances: [RETURNS],
      specs: { case_material: 'Vegetable-tanned leather', fits: 'Nova Phone 2' },
      specList: [spec('case_material', 'Material', 'case', 'Case', 'Vegetable-tanned leather', null, true), spec('fits', 'Fits', 'case', 'Case', 'Nova Phone 2')],
      manufacturer: { genericName: 'Phone case', countryOfOrigin: 'India', manufacturer: 'LOOM Studio, Ahmedabad 382405, India', netQuantity: '1 N', packOf: '1' },
    },
  },
]

export const anyProducts = RAW.map(product)
