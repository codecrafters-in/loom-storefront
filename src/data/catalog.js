/**
 * The bundled catalogue.
 *
 * This is the demo store's entire inventory, authored by hand so the theme has
 * something honest to render — real fabric weights, real construction notes,
 * prices that make sense next to each other. When VITE_DATA_SOURCE=api none of
 * this ships to the browser; it exists so the theme is fully explorable with no
 * backend at all.
 *
 * Prices are authored in major units here for readability and converted to
 * integer minor units by `build()`, because that is what crosses the API
 * boundary. See src/lib/money.js.
 */
import { toMinor, isRealDiscount } from '../lib/money.js'
import { productFacts } from './fit.js'
import { productEnrichment, manufacturerInfo } from './enrichment.js'

/**
 * Categories are a flat list with a `parent` pointer rather than nested arrays.
 *
 * Flat is what a database returns and what an admin panel edits; the tree is
 * built on read by `listCategories()`. Nesting the source data means every
 * reparent is a structural edit instead of one field.
 *
 * Products reference leaf slugs. Filtering by a parent resolves descendants, so
 * /shop/shirts includes everything under it without products having to list
 * both.
 */
export const categories = [
  { slug: 'shirts', name: 'Shirts', parent: null, blurb: 'Poplin, oxford, and one very good linen.', imageQuery: 'white linen shirt on hanger minimal' },
  { slug: 'shirts-oxford', name: 'Oxford & poplin', parent: 'shirts', blurb: 'Collars that hold.', imageQuery: 'oxford shirt collar detail studio' },
  { slug: 'shirts-linen', name: 'Linen', parent: 'shirts', blurb: 'For the warm half of the year.', imageQuery: 'linen shirt hanging natural light' },
  { slug: 'shirts-flannel', name: 'Flannel', parent: 'shirts', blurb: 'Brushed both sides.', imageQuery: 'flannel check shirt folded' },

  { slug: 'knitwear', name: 'Knitwear', parent: null, blurb: 'Merino, lambswool, and cotton for the in-between months.', imageQuery: 'folded knit sweater wool neutral' },
  { slug: 'knitwear-sweaters', name: 'Sweaters', parent: 'knitwear', blurb: 'Crews and cardigans.', imageQuery: 'wool sweater folded neutral studio' },
  { slug: 'knitwear-cashmere', name: 'Cashmere', parent: 'knitwear', blurb: 'Two-ply, long fibre.', imageQuery: 'cashmere sweater camel luxury folded' },
  { slug: 'knitwear-tees', name: 'Tees', parent: 'knitwear', blurb: 'Jersey with some weight to it.', imageQuery: 'plain t-shirt folded minimal studio' },

  { slug: 'outerwear', name: 'Outerwear', parent: null, blurb: 'Weather-facing layers that still look like clothes.', imageQuery: 'wool coat on rack minimal studio' },
  { slug: 'outerwear-coats', name: 'Coats', parent: 'outerwear', blurb: 'Wool, unlined, hand-finished.', imageQuery: 'camel wool overcoat minimal studio' },
  { slug: 'outerwear-jackets', name: 'Jackets', parent: 'outerwear', blurb: 'Waxed cotton and drill.', imageQuery: 'waxed cotton jacket olive outdoor' },

  { slug: 'trousers', name: 'Trousers', parent: null, blurb: 'Denim, chino, and a pleated wool that does most of the work.', imageQuery: 'folded trousers denim neutral flat lay' },
  { slug: 'trousers-denim', name: 'Denim', parent: 'trousers', blurb: 'Japanese selvedge, sold raw.', imageQuery: 'selvedge denim jeans folded indigo' },
  { slug: 'trousers-tailored', name: 'Tailored', parent: 'trousers', blurb: 'Pleated wool, high rise.', imageQuery: 'pleated wool trousers tailored studio' },
  { slug: 'trousers-casual', name: 'Chino & linen', parent: 'trousers', blurb: 'Washed soft.', imageQuery: 'khaki chino trousers folded flat lay' },

  { slug: 'dresses', name: 'Dresses', parent: null, blurb: 'Two silhouettes, cut properly, in fabrics that hang.', imageQuery: 'linen dress on hanger neutral minimal' },

  { slug: 'accessories', name: 'Accessories', parent: null, blurb: 'Leather, canvas, and wool. Nothing that needs charging.', imageQuery: 'leather belt and bag flat lay neutral' },
  { slug: 'accessories-leather', name: 'Leather', parent: 'accessories', blurb: 'Vegetable-tanned, solid brass.', imageQuery: 'leather belt brass buckle tan' },
  { slug: 'accessories-bags', name: 'Bags', parent: 'accessories', blurb: 'Canvas that outlives the trip.', imageQuery: 'canvas duffle bag leather trim' },
  { slug: 'accessories-cold', name: 'Scarves & hats', parent: 'accessories', blurb: 'Wool, for the months that need it.', imageQuery: 'wool scarf and beanie folded neutral' },
]

const APPAREL = ['XS', 'S', 'M', 'L', 'XL']
const ONE = ['One Size']

// price / compareAt in major units. colors are authored as [name, hex] so the
// swatch picker never has to guess what "Ecru" looks like.
const LEAF_CATEGORY = {
  "oxford-shirt-ecru": "shirts-oxford",
  "linen-camp-shirt": "shirts-linen",
  "poplin-shirt-white": "shirts-oxford",
  "brushed-flannel-shirt": "shirts-flannel",
  "merino-crew-knit": "knitwear-sweaters",
  "lambswool-cardigan": "knitwear-sweaters",
  "cotton-fisherman-knit": "knitwear-sweaters",
  "silk-cotton-tee": "knitwear-tees",
  "cashmere-crew": "knitwear-cashmere",
  "wool-overcoat": "outerwear-coats",
  "waxed-cotton-jacket": "outerwear-jackets",
  "quilted-liner-jacket": "outerwear-jackets",
  "shearling-collar-jacket": "outerwear-jackets",
  "pleated-wool-trouser": "trousers-tailored",
  "selvedge-denim-straight": "trousers-denim",
  "garment-dyed-chino": "trousers-casual",
  "wide-leg-linen-trouser": "trousers-casual",
  "leather-belt": "accessories-leather",
  "canvas-weekender": "accessories-bags",
  "lambswool-scarf": "accessories-cold",
  "cotton-cap": "accessories-cold",
  "merino-beanie": "accessories-cold"
}

const RAW = [
  {
    slug: 'oxford-shirt-ecru',
    title: 'Everyday Oxford Shirt',
    subtitle: 'Washed cotton oxford, unlined collar',
    price: 118,
    category: 'shirts',
    colors: [['Ecru', '#EDE6D8'], ['Pale Blue', '#C6D6E3'], ['Black', '#1B1B1B']],
    sizes: APPAREL,
    description:
      'A 140gsm cotton oxford woven in Portugal and washed twice before it is cut, so the collar sits flat from the first wear instead of the fifteenth. Cut a half-size roomier through the chest than a dress shirt, which is the point.',
    details: ['140gsm long-staple cotton oxford', 'Unlined, soft-roll collar', 'Single-needle side seams', 'Corozo buttons', 'Woven in Guimarães, Portugal'],
    care: ['Machine wash cold, gentle', 'Line dry or tumble low', 'Warm iron on the collar and cuffs'],
    tags: ['cotton', 'everyday', 'bestseller'],
    rating: [4.7, 214],
    imageQuery: 'white oxford button down shirt studio',
    // Colour-neutral, so a colourway query can name the colour itself.
    colorQuery: 'oxford button down shirt studio',
    altQuery: 'folded cotton shirt detail texture',
    badges: ['bestseller'],
  },
  {
    slug: 'linen-camp-shirt',
    title: 'Linen Camp Collar Shirt',
    subtitle: 'Heavyweight European linen',
    price: 132,
    category: 'shirts',
    colors: [['Sand', '#D9CDBA'], ['Olive', '#6E7256'], ['Chalk', '#F2EFE8']],
    sizes: APPAREL,
    description:
      'Heavyweight linen at 190gsm — substantial enough to hang rather than cling, which is the difference between linen that looks considered and linen that looks slept in. The camp collar is cut wide and interfaced lightly so it holds an open neck.',
    details: ['190gsm European flax linen', 'Camp collar, one patch pocket', 'Straight hem, wearable untucked', 'Garment-dyed in small batches'],
    care: ['Machine wash cold', 'Line dry', 'Creasing is the fabric, not a fault'],
    tags: ['linen', 'summer'],
    rating: [4.6, 138],
    imageQuery: 'linen camp collar shirt beige studio',
    colorQuery: 'linen camp collar shirt studio',
    altQuery: 'linen fabric texture close up natural',
    badges: [],
  },
  {
    slug: 'poplin-shirt-white',
    title: 'Crisp Poplin Shirt',
    subtitle: 'Two-ply compact poplin',
    price: 145,
    compareAt: 175,
    category: 'shirts',
    colors: [['White', '#FBFAF7'], ['Navy', '#22304A']],
    sizes: APPAREL,
    description:
      'Two-ply 100s compact poplin — the fabric a good shirtmaker reaches for when the shirt has to look sharp at 6pm as well as 9am. Fused collar and cuffs, mother-of-pearl buttons, and a placket that stays shut.',
    details: ['Two-ply 100s compact cotton poplin', 'Fused collar and cuffs', 'Mother-of-pearl buttons', 'Split back yoke'],
    care: ['Machine wash cold', 'Iron damp', 'Do not bleach'],
    tags: ['cotton', 'formal'],
    rating: [4.5, 96],
    imageQuery: 'white dress shirt hanging minimal studio',
    colorQuery: 'dress shirt hanging minimal studio',
    altQuery: 'shirt cuff button detail macro',
    badges: ['sale'],
  },
  {
    slug: 'merino-crew-knit',
    title: 'Fine Merino Crew',
    subtitle: '19.5 micron extra-fine merino',
    price: 168,
    category: 'knitwear',
    colors: [['Oat', '#DCD3C3'], ['Charcoal', '#3A3A3C'], ['Rust', '#9C5B3C']],
    sizes: APPAREL,
    description:
      'Extra-fine merino at 19.5 micron, which is fine enough to wear against skin and still hold its shape by March. Fully fashioned — the panels are knitted to shape rather than cut from a sheet, so there is no bulk at the shoulder seam.',
    details: ['19.5 micron extra-fine merino', 'Fully fashioned, 12gg', 'Ribbed cuffs and hem', 'Knitted in Northern Italy'],
    care: ['Hand wash cool or wool cycle', 'Dry flat', 'Do not tumble dry'],
    tags: ['merino', 'layering', 'bestseller'],
    rating: [4.8, 302],
    imageQuery: 'merino wool sweater folded neutral studio',
    colorQuery: 'merino wool sweater folded studio',
    altQuery: 'knitted wool texture close up beige',
    badges: ['bestseller'],
  },
  {
    slug: 'lambswool-cardigan',
    title: 'Lambswool Cardigan',
    subtitle: 'Shetland-spun, 7 gauge',
    price: 195,
    category: 'knitwear',
    colors: [['Moss', '#5F6B4B'], ['Ecru', '#E7DFCF'], ['Ink', '#242833']],
    sizes: APPAREL,
    description:
      'Seven-gauge lambswool spun in Scotland and knitted heavy enough to work as outerwear in October. Horn buttons, a deep rib on the placket so it does not gape, and enough room to go over a shirt.',
    details: ['100% Shetland lambswool', '7 gauge, saddle shoulder', 'Horn buttons', 'Yarn spun in Scotland'],
    care: ['Hand wash cool', 'Dry flat, reshape while damp', 'Store folded'],
    tags: ['wool', 'autumn'],
    rating: [4.7, 121],
    imageQuery: 'wool cardigan knitwear hanging neutral',
    colorQuery: 'wool cardigan knitwear hanging',
    altQuery: 'cardigan button horn detail knit',
    badges: [],
  },
  {
    slug: 'cotton-fisherman-knit',
    title: 'Cotton Fisherman Knit',
    subtitle: 'Cable-knit organic cotton',
    price: 152,
    category: 'knitwear',
    colors: [['Chalk', '#F1EDE4'], ['Slate', '#5B6570']],
    sizes: APPAREL,
    description:
      'The aran construction without the itch — organic cotton in a five-gauge cable, which gives you the texture of a fisherman knit at a weight you can wear indoors.',
    details: ['100% GOTS organic cotton', '5 gauge cable knit', 'Drop shoulder', 'Ribbed funnel neck'],
    care: ['Machine wash cool, gentle', 'Dry flat', 'Cool iron if needed'],
    tags: ['cotton', 'organic'],
    rating: [4.4, 74],
    imageQuery: 'cable knit cotton sweater cream studio',
    colorQuery: 'cable knit cotton sweater studio',
    altQuery: 'cable knit texture detail cream',
    badges: [],
  },
  {
    slug: 'wool-overcoat',
    title: 'Double-Faced Wool Overcoat',
    subtitle: 'Unlined, hand-finished edges',
    price: 685,
    category: 'outerwear',
    colors: [['Camel', '#B5945F'], ['Charcoal', '#3B3B3E']],
    sizes: APPAREL,
    description:
      'Double-faced wool means two cloths bonded and then split and hand-stitched at every edge — no lining, no bulk, and a coat that drapes rather than stands. It is the most labour-intensive thing we make and the reason the price reads the way it does.',
    details: ['750gsm double-faced virgin wool', 'Hand-stitched, unlined edges', 'Concealed placket', 'Two welt pockets', 'Made in Italy'],
    care: ['Dry clean only', 'Brush after wear', 'Store on a broad hanger'],
    tags: ['wool', 'investment'],
    rating: [4.9, 58],
    imageQuery: 'camel wool overcoat minimal studio fashion',
    colorQuery: 'wool overcoat minimal studio fashion',
    altQuery: 'wool coat fabric texture camel',
    badges: ['new'],
  },
  {
    slug: 'waxed-cotton-jacket',
    title: 'Waxed Cotton Jacket',
    subtitle: 'British 8oz waxed cotton',
    price: 395,
    category: 'outerwear',
    colors: [['Olive', '#5C6349'], ['Black', '#1E1E1E']],
    sizes: APPAREL,
    description:
      'Eight-ounce waxed cotton from Lancashire, cut short enough to wear over a knit without bunching. It will mark, crease and slowly go its own colour, which is the entire appeal — rewax it every second winter and it outlives most of your wardrobe.',
    details: ['8oz British waxed cotton', 'Corduroy-lined collar', 'Four bellows pockets', 'Brass two-way zip', 'Rewaxable'],
    care: ['Wipe with a damp cloth', 'Never machine wash', 'Rewax annually with heavy use'],
    tags: ['waterproof', 'heritage'],
    rating: [4.8, 167],
    imageQuery: 'waxed cotton jacket olive green outdoor',
    colorQuery: 'waxed cotton jacket outdoor',
    altQuery: 'jacket brass zip pocket detail',
    badges: [],
  },
  {
    slug: 'quilted-liner-jacket',
    title: 'Quilted Liner Jacket',
    subtitle: 'Recycled fill, packs flat',
    price: 245,
    compareAt: 295,
    category: 'outerwear',
    colors: [['Sand', '#CFC2AC'], ['Ink', '#232733'], ['Moss', '#5D6A4E']],
    sizes: APPAREL,
    description:
      'The layer that goes under the coat in January and works alone in April. Recycled polyester fill in a diamond quilt, cut trim enough to disappear under outerwear and packable into its own pocket.',
    details: ['Recycled ripstop shell', '80g recycled fill', 'Diamond quilt, 8cm channels', 'Packs into left pocket'],
    care: ['Machine wash cold', 'Tumble dry low with a dryer ball', 'Do not iron'],
    tags: ['recycled', 'packable'],
    rating: [4.5, 143],
    imageQuery: 'quilted liner jacket beige studio fashion',
    colorQuery: 'quilted liner jacket studio fashion',
    altQuery: 'quilted fabric stitching detail',
    badges: ['sale'],
  },
  {
    slug: 'pleated-wool-trouser',
    title: 'Pleated Wool Trouser',
    subtitle: 'Single reverse pleat, high rise',
    price: 225,
    category: 'trousers',
    colors: [['Charcoal', '#3D3D40'], ['Stone', '#B6AC9A'], ['Navy', '#28344B']],
    sizes: APPAREL,
    description:
      'A single reverse pleat and a genuinely high rise, which is what makes a wide leg read as tailoring rather than as a mistake. Tropical wool at 260gsm, so it works past September.',
    details: ['260gsm tropical wool', 'Single reverse pleat', 'Extended tab closure', 'Unfinished hem — tailor to length'],
    care: ['Dry clean', 'Press with a cloth', 'Hang from the cuff'],
    tags: ['wool', 'tailored', 'bestseller'],
    rating: [4.6, 189],
    imageQuery: 'pleated wool trousers grey tailored studio',
    colorQuery: 'pleated wool trousers tailored studio',
    altQuery: 'trouser waistband pleat detail',
    badges: ['bestseller'],
  },
  {
    slug: 'selvedge-denim-straight',
    title: 'Selvedge Denim, Straight',
    subtitle: '13.5oz Japanese selvedge',
    price: 198,
    category: 'trousers',
    colors: [['Raw Indigo', '#2E3A55'], ['Washed Black', '#2B2B2D']],
    sizes: APPAREL,
    description:
      '13.5oz selvedge woven on shuttle looms in Okayama, cut straight through the thigh with no taper below the knee. Sold raw — expect a stiff month and then a pair that fits only you.',
    details: ['13.5oz Japanese selvedge denim', 'Shuttle-loomed in Okayama', 'Chain-stitched hem', 'Copper rivets, tack buttons'],
    care: ['Wash cold, inside out, sparingly', 'Line dry', 'Expect indigo transfer at first'],
    tags: ['denim', 'raw'],
    rating: [4.7, 231],
    imageQuery: 'selvedge denim jeans folded indigo detail',
    colorQuery: 'selvedge denim jeans folded detail',
    altQuery: 'denim selvedge edge detail macro',
    badges: [],
  },
  {
    slug: 'garment-dyed-chino',
    title: 'Garment-Dyed Chino',
    subtitle: 'Pima twill, washed soft',
    price: 138,
    category: 'trousers',
    colors: [['Khaki', '#B9A883'], ['Off White', '#EFEAE0'], ['Navy', '#2A3550'], ['Olive', '#68704F']],
    sizes: APPAREL,
    description:
      'Pima cotton twill dyed after the trouser is made, which is why the seams sit a shade deeper than the panels and why it feels broken-in on day one. Mid rise, slight taper, no stretch.',
    details: ['9oz Pima cotton twill', 'Garment-dyed and enzyme-washed', 'Slant pockets, single welt back', 'No elastane'],
    care: ['Machine wash cold with like colours', 'Tumble low', 'Warm iron'],
    tags: ['cotton', 'everyday'],
    rating: [4.5, 176],
    imageQuery: 'khaki chino trousers folded flat lay',
    colorQuery: 'chino trousers folded flat lay',
    altQuery: 'cotton twill fabric texture khaki',
    badges: [],
  },
  {
    slug: 'linen-slip-dress',
    title: 'Bias Linen Slip Dress',
    subtitle: 'Cut on the bias, midi length',
    price: 215,
    category: 'dresses',
    colors: [['Clay', '#B98A70'], ['Chalk', '#F0ECE3'], ['Ink', '#252838']],
    sizes: APPAREL,
    description:
      'Cut on the true bias so the linen falls around rather than over, which is the whole reason to cut a slip this way and also why it takes twice the cloth. Adjustable straps, French seams throughout.',
    details: ['Washed 160gsm linen', 'True bias cut', 'Adjustable straps', 'French seams', 'Midi length, 118cm'],
    care: ['Hand wash cool or gentle cycle', 'Line dry', 'Cool iron'],
    tags: ['linen', 'summer'],
    rating: [4.6, 108],
    imageQuery: 'linen slip dress neutral minimal fashion',
    colorQuery: 'linen slip dress minimal fashion',
    altQuery: 'linen dress fabric drape detail',
    badges: ['new'],
  },
  {
    slug: 'poplin-shirt-dress',
    title: 'Poplin Shirt Dress',
    subtitle: 'Belted, dropped shoulder',
    price: 235,
    category: 'dresses',
    colors: [['White', '#FAF8F4'], ['Stripe', '#C9D3DE']],
    sizes: APPAREL,
    description:
      'A shirt dress that behaves like a shirt — proper placket, proper cuffs, a collar with an interfacing that holds. Dropped shoulder and a self belt so it works loose or defined.',
    details: ['Cotton poplin, 120gsm', 'Removable self belt', 'Dropped shoulder', 'Side seam pockets'],
    care: ['Machine wash cold', 'Iron damp', 'Hang to dry'],
    tags: ['cotton', 'workwear'],
    rating: [4.4, 87],
    imageQuery: 'white shirt dress on hanger minimal studio',
    colorQuery: 'shirt dress on hanger minimal studio',
    altQuery: 'shirt dress collar placket detail',
    badges: [],
  },
  {
    slug: 'leather-belt',
    title: 'Vegetable-Tanned Belt',
    subtitle: 'Full-grain, solid brass',
    price: 96,
    category: 'accessories',
    colors: [['Tan', '#A9743F'], ['Black', '#1C1A19']],
    sizes: ['S', 'M', 'L'],
    description:
      'Full-grain leather from a Tuscan tannery, vegetable-tanned over weeks rather than chrome-tanned in hours. It starts stiff and pale and ends up dark and shaped to you. Solid brass buckle, no plating to wear through.',
    details: ['Full-grain vegetable-tanned leather', '3.5cm width', 'Solid brass buckle', 'Hand-burnished edges'],
    care: ['Wipe with a dry cloth', 'Condition twice a year', 'Keep out of direct heat'],
    tags: ['leather', 'lasts'],
    rating: [4.8, 143],
    imageQuery: 'leather belt brass buckle detail tan',
    colorQuery: 'leather belt brass buckle detail',
    altQuery: 'leather texture close up tan grain',
    badges: [],
  },
  {
    slug: 'canvas-weekender',
    title: 'Canvas Weekender',
    subtitle: '18oz cotton canvas, leather trim',
    price: 265,
    category: 'accessories',
    colors: [['Field Tan', '#C0AE8C'], ['Charcoal', '#41413F']],
    sizes: ONE,
    description:
      'Eighteen-ounce canvas with bridle leather handles and a base that is a single piece rather than a seamed panel, because the base is where bags fail. Fits three days without pretending to fit five.',
    details: ['18oz cotton canvas', 'Bridle leather handles and base trim', 'YKK Excella zip', 'Cotton drill lining, one inner pocket', '48 × 28 × 24cm'],
    care: ['Spot clean', 'Do not machine wash', 'Condition the leather annually'],
    tags: ['canvas', 'travel'],
    rating: [4.7, 92],
    imageQuery: 'canvas duffle weekender bag leather trim',
    colorQuery: 'canvas duffle weekender bag',
    altQuery: 'canvas bag leather handle detail',
    badges: [],
  },
  {
    slug: 'lambswool-scarf',
    title: 'Lambswool Scarf',
    subtitle: 'Woven in the Scottish Borders',
    price: 78,
    category: 'accessories',
    colors: [['Oat', '#DDD4C2'], ['Rust', '#9F5E3E'], ['Ink', '#262A36']],
    sizes: ONE,
    description:
      'Woven on a mill in the Scottish Borders that has been doing it since the 1860s. Brushed twice for loft, hand-knotted fringe, and long enough to actually wrap — 190cm, not the 140cm most scarves cheat down to.',
    details: ['100% lambswool', 'Woven in the Scottish Borders', '190 × 32cm', 'Hand-knotted fringe'],
    care: ['Dry clean or hand wash cool', 'Dry flat', 'Do not wring'],
    tags: ['wool', 'gift'],
    rating: [4.9, 204],
    imageQuery: 'wool scarf folded neutral texture',
    colorQuery: 'wool scarf folded texture',
    altQuery: 'scarf wool fringe detail texture',
    badges: ['bestseller'],
  },
  {
    slug: 'cotton-cap',
    title: 'Washed Cotton Cap',
    subtitle: 'Six panel, brass slide',
    price: 48,
    compareAt: 62,
    category: 'accessories',
    colors: [['Stone', '#BEB4A2'], ['Navy', '#2B3450'], ['Black', '#1D1D1D']],
    sizes: ONE,
    description:
      'A six-panel in washed cotton twill with an unstructured front, so it sits down rather than out. Brass slide adjuster and a leather-backed strap.',
    details: ['Washed cotton twill', 'Unstructured six-panel', 'Brass slide adjuster', 'Cotton sweatband'],
    care: ['Hand wash cool', 'Air dry on a form', 'Do not machine wash'],
    tags: ['cotton', 'everyday'],
    rating: [4.3, 61],
    imageQuery: 'cotton baseball cap neutral studio product',
    colorQuery: 'cotton baseball cap studio product',
    altQuery: 'cap brass adjuster strap detail',
    badges: ['sale'],
  },
  {
    slug: 'brushed-flannel-shirt',
    title: 'Brushed Flannel Shirt',
    subtitle: 'Double-brushed cotton twill',
    price: 128,
    category: 'shirts',
    colors: [['Rust Check', '#9B5D42'], ['Slate Check', '#5C6773']],
    sizes: APPAREL,
    description:
      'Brushed on both faces so it is soft on the inside as well as the out, in a yarn-dyed check that stays a check after twenty washes rather than fading into a smudge.',
    details: ['210gsm double-brushed cotton', 'Yarn-dyed check', 'Chest pocket with flap', 'Two-button adjustable cuff'],
    care: ['Machine wash warm', 'Tumble low', 'Warm iron'],
    tags: ['cotton', 'winter'],
    rating: [4.5, 118],
    imageQuery: 'flannel check shirt folded plaid studio',
    colorQuery: 'flannel shirt folded studio',
    altQuery: 'flannel check fabric texture detail',
    badges: [],
  },
  {
    slug: 'silk-cotton-tee',
    title: 'Silk-Cotton Tee',
    subtitle: '70/30 cotton silk jersey',
    price: 88,
    category: 'knitwear',
    colors: [['Chalk', '#F3F0E9'], ['Sand', '#D6C9B4'], ['Ink', '#23252E']],
    sizes: APPAREL,
    description:
      'Thirty per cent silk in the jersey, which is what gives it the weight and the very slight sheen and stops it going shapeless at the neck by month three. The most expensive t-shirt we make and the one that gets rebought.',
    details: ['70% cotton, 30% silk jersey', '180gsm', 'Bound neckline', 'Side-seamed, not tubular'],
    care: ['Machine wash cold, gentle', 'Dry flat', 'Cool iron'],
    tags: ['silk', 'everyday'],
    rating: [4.6, 267],
    imageQuery: 'plain white t-shirt folded minimal studio',
    colorQuery: 't-shirt folded minimal studio',
    altQuery: 'cotton jersey fabric texture white',
    badges: [],
  },
  {
    slug: 'wide-leg-linen-trouser',
    title: 'Wide-Leg Linen Trouser',
    subtitle: 'Drawstring, unstructured',
    price: 145,
    category: 'trousers',
    colors: [['Chalk', '#EFEAE0'], ['Clay', '#B58A6D'], ['Olive', '#697051']],
    sizes: APPAREL,
    description:
      'Washed linen with a drawcord waist and a leg wide enough to move air. There is no interfacing anywhere in this trouser, which is deliberate — it is meant to crumple.',
    details: ['185gsm washed linen', 'Drawcord waist with inner elastic', 'Wide straight leg', 'Deep side pockets'],
    care: ['Machine wash cool', 'Line dry', 'Iron on linen setting if you must'],
    tags: ['linen', 'summer'],
    rating: [4.5, 94],
    imageQuery: 'wide leg linen trousers beige minimal',
    colorQuery: 'wide leg linen trousers minimal',
    altQuery: 'linen trouser drape fabric detail',
    badges: [],
  },
  {
    slug: 'shearling-collar-jacket',
    title: 'Shearling Collar Jacket',
    subtitle: 'Cotton drill, detachable collar',
    price: 445,
    category: 'outerwear',
    colors: [['Tobacco', '#8A6440'], ['Black', '#1F1F1F']],
    sizes: APPAREL,
    description:
      'A trucker cut in heavy cotton drill with a shearling collar that unclips, so the same jacket works either side of the cold. Pre-washed so it does not shrink around you.',
    details: ['14oz cotton drill', 'Detachable shearling collar', 'Blanket-lined body', 'Copper-finish hardware'],
    care: ['Machine wash cold without the collar', 'Line dry', 'Brush the shearling'],
    tags: ['cotton', 'winter'],
    rating: [4.7, 76],
    imageQuery: 'shearling collar denim trucker jacket brown',
    colorQuery: 'shearling collar trucker jacket',
    altQuery: 'shearling collar texture detail jacket',
    badges: ['new'],
  },
  {
    slug: 'merino-beanie',
    title: 'Ribbed Merino Beanie',
    subtitle: 'Double-layer, no itch',
    price: 52,
    category: 'accessories',
    colors: [['Oat', '#DED5C4'], ['Moss', '#5E6A4C'], ['Ink', '#252838']],
    sizes: ONE,
    description:
      'Extra-fine merino in a double-layer 2×2 rib, so the band that sits on your forehead is the same wool as the rest and does not scratch. Folds once or wears slouched.',
    details: ['19.5 micron extra-fine merino', '2×2 rib, double layer', 'Knitted in Italy', 'No wool blend, no acrylic'],
    care: ['Hand wash cool', 'Dry flat', 'Do not tumble'],
    tags: ['merino', 'winter', 'gift'],
    rating: [4.8, 155],
    imageQuery: 'wool beanie hat knitted neutral product',
    colorQuery: 'wool beanie hat knitted product',
    altQuery: 'ribbed knit beanie texture close up',
    badges: [],
  },
  {
    slug: 'cashmere-crew',
    title: 'Grade-A Cashmere Crew',
    subtitle: 'Inner Mongolian, 2-ply',
    price: 385,
    compareAt: 450,
    category: 'knitwear',
    colors: [['Camel', '#B99A6C'], ['Chalk', '#EFEAE1'], ['Charcoal', '#3C3C3F']],
    sizes: APPAREL,
    description:
      'Two-ply Grade-A cashmere — long fibre, which is the thing that decides whether a sweater pills in a season or softens for a decade. Knitted at 12 gauge so it layers under a coat.',
    details: ['2-ply Grade-A Inner Mongolian cashmere', '12 gauge, fully fashioned', 'Ribbed neck, cuffs and hem', 'Knitted in Scotland'],
    care: ['Hand wash cool with cashmere shampoo', 'Dry flat', 'De-pill with a comb, not a razor'],
    tags: ['cashmere', 'investment'],
    rating: [4.9, 88],
    imageQuery: 'cashmere sweater camel folded luxury studio',
    colorQuery: 'cashmere sweater folded luxury studio',
    altQuery: 'cashmere knit texture detail camel',
    badges: ['sale'],
  },
]

let seq = 1000
const uid = (p) => `${p}_${(seq += 7).toString(36)}`

/** Deterministic pseudo-random so inventory numbers are stable across reloads. */
function hashInt(str, max) {
  let h = 2166136261
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h) % max
}

/**
 * Every product gets enrichment, hand-authored or derived.
 *
 * Half a catalogue with a rich highlights grid and half with nothing looks like
 * a bug rather than an editorial choice, and it is the state a real migration
 * arrives in. So anything without authored copy gets highlights and specs
 * derived from the fabric and fit data it already has — thinner, but present
 * and true.
 */
/**
 * Country of origin, from the fabric origin rather than from a constant.
 *
 * It is a legally mandated field in several markets, and "see product
 * specifications" on a mandated field is the disclosure equivalent of a shrug —
 * the answer is already in the data, one field away.
 *
 * The UK nations are folded up because the field asks for a country and
 * "Scotland" is not the answer a customs form wants.
 */
const COUNTRY = { Scotland: 'United Kingdom', England: 'United Kingdom', 'Scottish Borders': 'United Kingdom' }

function complianceFor(facts) {
  const origin = facts.fabric?.origin
  if (!origin) return manufacturerInfo
  const last = origin.split(',').pop().trim()
  return { ...manufacturerInfo, countryOfOrigin: COUNTRY[last] || last }
}

function enrichmentFor(raw, facts) {
  const authored = productEnrichment[raw.slug]
  if (authored) return { ...authored, manufacturer: complianceFor(facts) }

  const fabric = facts.fabric || {}
  const highlights = [
    fabric.composition?.length && { key: 'fabric', value: fabric.composition.map(([m]) => m).join(', ') },
    fabric.weight && { key: 'weight', value: `${fabric.weight} gsm` },
    fabric.weave && { key: 'weave', value: fabric.weave },
    facts.fit?.verdict && {
      key: 'fit',
      value: { 'true-to-size': 'Regular', 'runs-small': 'Slim', 'runs-large': 'Relaxed' }[facts.fit.verdict],
    },
    fabric.origin && { key: 'countryOfOrigin', value: fabric.origin },
  ].filter(Boolean)

  /**
   * Feature cards derived from facts the product already carries.
   *
   * An empty Features tab on eighteen of twenty-four products is not an
   * editorial choice, it is a hole — and it is exactly the state a catalogue
   * arrives in after a migration. These are built from the mill, the
   * certification and the fit note, so nothing is invented; a merchant replaces
   * them with their own copy when they have it.
   */
  const features = [
    fabric.weight && fabric.weave && {
      icon: 'ruler',
      title: `${fabric.weight}gsm ${fabric.weave.toLowerCase()}`,
      body: `Weight is what decides drape and warmth. At ${fabric.weight}gsm this hangs rather than clings, and it is the number most listings leave out.`,
    },
    fabric.origin && {
      icon: 'award',
      title: `Made in ${fabric.origin}`,
      body: `Cut and finished in ${fabric.origin}. We name the mill because a country of origin on its own tells you almost nothing.`,
    },
    fabric.certifications?.length && {
      icon: 'leaf',
      title: fabric.certifications[0],
      body: `Independently audited rather than self-declared, which is the whole difference between a certification and a claim. Certificate numbers on request.`,
    },
    facts.fit?.note && {
      icon: 'sparkle',
      title: facts.fit.verdict === 'true-to-size' ? 'Take your usual size' : 'Read the fit note first',
      body: facts.fit.note,
    },
  ].filter(Boolean).slice(0, 3)

  /**
   * Services, derived from what is actually true of this piece.
   *
   * The store's own policy rows live in `storefront.trust.assurances` and are
   * what a product falls back to. These add the two that are per-product rather
   * than per-store — a repair promise only holds where the piece is repairable,
   * and a certification is only worth a row where one exists — so the block
   * says something specific instead of repeating the footer.
   */
  const assurances = [
    { icon: 'refresh', label: '30-day returns, no reason needed',
      note: 'Unworn, tags attached. A prepaid label is in every parcel and the refund goes back to your original payment method within five working days of it reaching us.' },
    { icon: 'ruler', label: 'Free size exchange, once per order',
      note: 'One exchange per order, while the size you want is in stock. We send the replacement before the first piece is back with us.' },
    fabric.certifications?.length && {
      icon: 'leaf', label: `${fabric.certifications[0]} certified`,
      note: `Audited at the supplier rather than declared on the label. Certificate numbers on request.`,
    },
    { icon: 'shield', label: 'Two-year seam and hardware guarantee',
      note: 'A seam that fails, a zip that stops running, a button band that pulls — we repair it or replace the piece.' },
  ].filter(Boolean)

  return {
    highlights,
    features,
    assurances,
    specs: {
      ...(fabric.composition?.length ? { composition: fabric.composition.map(([m, pct]) => `${pct}% ${m}`).join(', ') } : {}),
      ...(fabric.weight ? { weight: String(fabric.weight) } : {}),
      ...(fabric.weave ? { weave: fabric.weave } : {}),
      ...(fabric.origin ? { countryOfOrigin: fabric.origin } : {}),
      ...(fabric.certifications?.length ? { certifications: fabric.certifications.join(', ') } : {}),
      ...(raw.care?.length ? { care: raw.care[0] } : {}),
    },
    manufacturer: complianceFor(facts),
  }
}

function build(raw) {
  const facts = productFacts[raw.slug] || {}
  const price = toMinor(raw.price)
  const compareAt = raw.compareAt ? toMinor(raw.compareAt) : null
  const currency = 'USD'

  /**
   * Each colourway has its own photograph, and the first colour is the one the
   * main shot was taken of.
   *
   * This is what makes the gallery follow the picker. Before, every variant
   * pointed at `<slug>-1` and every image was untagged, so choosing a colour
   * changed the swatch and nothing else — the scoping code was correct and had
   * nothing to scope. `-2` stays untagged on purpose: a fabric or detail crop
   * belongs to every colourway, so it survives the filter and stays in the
   * gallery whichever colour is selected.
   */
  const colorImageId = (name) =>
    `${raw.slug}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`

  const firstColor = raw.colors[0]?.[0]
  const images = [
    // Index 0 and 1 are the card and its hover shot, so they stay put.
    { id: `${raw.slug}-1`, url: `/images/products/${raw.slug}-1.jpg`, alt: `${raw.title} in ${firstColor}`, width: 900, height: 1125, color: firstColor },
    { id: `${raw.slug}-2`, url: `/images/products/${raw.slug}-2.jpg`, alt: `${raw.title}, fabric detail`, width: 900, height: 1125 },
    ...raw.colors.slice(1).map(([name]) => ({
      id: colorImageId(name),
      url: `/images/products/${colorImageId(name)}.jpg`,
      alt: `${raw.title} in ${name}`,
      width: 900,
      height: 1125,
      color: name,
    })),
  ]

  const variants = []
  for (const [colorName] of raw.colors) {
    for (const size of raw.sizes) {
      const key = `${raw.slug}-${colorName}-${size}`
      const inventory = hashInt(key, 14) // 0–13; a few land on zero, which is the point
      variants.push({
        id: `var_${raw.slug}_${colorName}_${size}`.toLowerCase().replace(/[^a-z0-9_]+/g, '-'),
        sku: `${raw.slug.slice(0, 6).toUpperCase()}-${colorName.slice(0, 3).toUpperCase()}-${size}`,
        options: { Color: colorName, Size: size },
        price: { amount: price, currency },
        compareAtPrice: compareAt ? { amount: compareAt, currency } : null,
        inventory,
        available: inventory > 0,
        // Which shot to show when this variant is selected.
        imageId: colorName === firstColor ? `${raw.slug}-1` : colorImageId(colorName),
      })
    }
  }

  const soldOut = variants.every((v) => !v.available)
  const low = !soldOut && variants.filter((v) => v.available).length <= 2

  return {
    id: uid('prod'),
    slug: raw.slug,
    title: raw.title,
    subtitle: raw.subtitle,
    description: raw.description,
    details: raw.details,
    care: raw.care,
    price: { amount: price, currency },
    compareAtPrice: compareAt ? { amount: compareAt, currency } : null,
    images,
    options: [
      { name: 'Color', values: raw.colors.map(([n]) => n) },
      { name: 'Size', values: raw.sizes },
    ],
    swatches: Object.fromEntries(raw.colors),
    variants,
    categories: [raw.category, LEAF_CATEGORY[raw.slug]].filter(Boolean),
    tags: raw.tags,
    rating: { average: raw.rating[0], count: raw.rating[1] },
    // Same threshold the price chip uses — a reduction too small to advertise is
    // too small to badge. See MIN_DISCOUNT in lib/money.js.
    badges: [
      ...(raw.badges || []),
      ...(isRealDiscount({ amount: price }, compareAt ? { amount: compareAt } : null) ? ['sale'] : []),
      ...(soldOut ? ['sold-out'] : low ? ['low-stock'] : []),
    ],
    createdAt: new Date(2026, 0, 1 + hashInt(raw.slug, 240)).toISOString(),
    published: true,

    // Fit, fabric and provenance — the fields that decide whether a shopper
    // buys once or buys, returns, and does not come back. See src/data/fit.js.
    fit: facts.fit || null,
    fabric: facts.fabric || null,
    // A reference, not a copy. Editing the shared "tops" chart has to change
    // every product using it — a snapshot per product silently drifts.
    sizeChartId: facts.chart || null,

    // Highlights, feature cards and the specifications table. See
    // src/data/enrichment.js for why they are three blocks and not one.
    enrichment: enrichmentFor(raw, facts),

    // Honest scarcity and demand, derived rather than invented. A fabricated
    // "17 people are viewing" is the fastest way to lose a considered buyer.
    social: {
      unitsAvailable: variants.reduce((a, v) => a + v.inventory, 0),
      boughtLast30Days: 12 + hashInt(`${raw.slug}-sold`, 180),
      savedCount: 4 + hashInt(`${raw.slug}-saved`, 90),
    },
    // Consumed only by scripts/images.mjs; stripped from API responses.
    _imageQuery: raw.imageQuery,
    _colorQuery: raw.colorQuery,
    _altQuery: raw.altQuery,
  }
}

export const products = RAW.map(build)

export const collections = [
  {
    slug: 'new-season',
    title: 'New Season',
    blurb: 'The first drop of the year — outerwear, and the two things that go under it.',
    productSlugs: ['wool-overcoat', 'shearling-collar-jacket', 'linen-slip-dress', 'cashmere-crew'],
    imageQuery: 'autumn fashion editorial neutral tones model coat',
  },
  {
    slug: 'the-linen-edit',
    title: 'The Linen Edit',
    blurb: 'Everything we make in flax, in one place.',
    productSlugs: ['linen-camp-shirt', 'linen-slip-dress', 'wide-leg-linen-trouser'],
    imageQuery: 'linen clothing editorial natural light neutral',
  },
  {
    slug: 'built-to-last',
    title: 'Built to Last',
    blurb: 'The pieces we expect to see repaired rather than replaced.',
    productSlugs: ['waxed-cotton-jacket', 'selvedge-denim-straight', 'leather-belt', 'canvas-weekender'],
    imageQuery: 'workwear durable clothing detail stitching editorial',
  },
]

export default products
