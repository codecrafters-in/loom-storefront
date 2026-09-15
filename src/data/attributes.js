/**
 * The attribute vocabulary.
 *
 * Product enrichment fails in one of two ways. Free text everywhere gives you
 * "Fabric", "fabric", "Material" and "Composition" as four different attributes
 * across four products, and nothing can ever be filtered or compared. A closed
 * list gives you a merchandiser who cannot describe the thing they are selling.
 *
 * So: a suggested vocabulary with per-key value suggestions, and nothing
 * enforcing it. The admin combobox offers these first and accepts anything;
 * `GET /attributes` serves the same list so a real backend can grow it without
 * a deploy.
 *
 * `group` decides which block an attribute lands in on the specifications tab.
 * `highlight: true` marks the handful worth surfacing above the fold — a
 * highlights grid with fourteen rows is a specifications table with delusions.
 */
export const attributeGroups = [
  { id: 'general', label: 'General' },
  { id: 'fabric', label: 'Fabric & care' },
  { id: 'fit', label: 'Fit & measurements' },
  { id: 'sustainability', label: 'Sustainability' },
  { id: 'packaging', label: 'Packaging & origin' },
]

export const attributes = [
  // General — the ones a shopper scans first.
  { key: 'fabric', label: 'Fabric', group: 'general', highlight: true,
    values: ['Pure cotton', 'Organic cotton', 'Linen', 'Merino wool', 'Lambswool', 'Cashmere', 'Cotton-silk', 'Waxed cotton', 'Denim'] },
  { key: 'fit', label: 'Fit', group: 'general', highlight: true,
    values: ['Slim', 'Regular', 'Relaxed', 'Oversized', 'Tailored', 'Boxy'] },
  { key: 'sleeve', label: 'Sleeve', group: 'general', highlight: true,
    values: ['Full sleeve', 'Half sleeve', 'Three-quarter', 'Sleeveless'] },
  { key: 'neck', label: 'Neck type', group: 'general', highlight: true,
    values: ['Crew neck', 'Round neck', 'Camp collar', 'Button-down collar', 'Spread collar', 'Funnel neck', 'V-neck'] },
  { key: 'pattern', label: 'Pattern', group: 'general', highlight: true,
    values: ['Solid', 'Striped', 'Check', 'Herringbone', 'Cable knit', 'Graphic print'] },
  { key: 'closure', label: 'Closure', group: 'general',
    values: ['Button', 'Zip', 'Drawcord', 'Pull-on', 'Hook and bar'] },
  { key: 'occasion', label: 'Occasion', group: 'general', highlight: true,
    values: ['Everyday', 'Workwear', 'Formal', 'Outdoor', 'Evening'] },
  { key: 'idealFor', label: 'Ideal for', group: 'general',
    values: ['Women', 'Men', 'Unisex'] },
  { key: 'season', label: 'Season', group: 'general',
    values: ['All year', 'Spring/Summer', 'Autumn/Winter'] },
  { key: 'styleCode', label: 'Style code', group: 'general' },

  // Fabric and care.
  { key: 'composition', label: 'Composition', group: 'fabric', highlight: true },
  { key: 'weight', label: 'Weight', group: 'fabric', unit: 'gsm', highlight: true },
  { key: 'weave', label: 'Construction', group: 'fabric' },
  { key: 'lining', label: 'Lining', group: 'fabric', values: ['Unlined', 'Half-lined', 'Fully lined', 'Blanket-lined'] },
  { key: 'care', label: 'Fabric care', group: 'fabric',
    values: ['Machine wash cold', 'Hand wash cool', 'Dry clean only', 'Wool cycle', 'Do not tumble dry'] },
  { key: 'transparency', label: 'Opacity', group: 'fabric', values: ['Opaque', 'Semi-sheer', 'Sheer'] },
  { key: 'stretch', label: 'Stretch', group: 'fabric', values: ['None', 'Slight', 'Moderate'] },

  // Fit and measurements.
  { key: 'rise', label: 'Rise', group: 'fit', values: ['Low', 'Mid', 'High'] },
  { key: 'length', label: 'Length', group: 'fit', unit: 'cm' },
  { key: 'legOpening', label: 'Leg opening', group: 'fit', unit: 'cm' },
  { key: 'hem', label: 'Hem', group: 'fit', values: ['Straight', 'Curved', 'Unfinished'] },

  // Sustainability.
  { key: 'certifications', label: 'Certifications', group: 'sustainability' },
  { key: 'recycledContent', label: 'Recycled content', group: 'sustainability', unit: '%' },
  { key: 'repairable', label: 'Repairable', group: 'sustainability', values: ['Yes', 'No'] },

  // Packaging and origin — several of these are legally required in some
  // markets. India's Legal Metrology rules, for one, mandate the manufacturer
  // and packer address and the country of origin on an e-commerce listing.
  { key: 'madeBy', label: 'Woven by', group: 'packaging' },
  { key: 'millLocation', label: 'Mill location', group: 'packaging' },
  { key: 'genericName', label: 'Generic name', group: 'packaging' },
  { key: 'countryOfOrigin', label: 'Country of origin', group: 'packaging' },
  { key: 'manufacturer', label: 'Manufacturer name and address', group: 'packaging' },
  { key: 'packer', label: 'Packer name and address', group: 'packaging' },
  { key: 'importer', label: 'Importer name and address', group: 'packaging' },
  { key: 'netQuantity', label: 'Net quantity', group: 'packaging' },
  { key: 'packOf', label: 'Pack of', group: 'packaging' },
]

export const attributeByKey = Object.fromEntries(attributes.map((a) => [a.key, a]))

/** A specification key the theme has no wording for ("tastingNotes", "made_in"), made readable: "Tasting notes", "Made in". */
export const readableKey = (key) => {
  const words = String(key || '').replace(/[_-]+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').trim().toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * The name a shopper sees for a specification: the theme's own wording, then the label the store sent with it (a
 * merchant's own specification, in the shopper's language), then the key made readable.
 */
export const specLabel = (key, specList) =>
  attributeByKey[key]?.label || (specList || []).find((spec) => spec.key === key)?.label || readableKey(key)

/** Icons a feature card can use. Anything else is an image URL. */
/**
 * Ready-made service rows for the assurances block.
 *
 * Offered as one-click starting points in the admin panel, not as a fixed list.
 * Nearly every apparel store promises some version of these four, and retyping
 * a returns policy per product is how three products end up promising three
 * different windows.
 */
export const assuranceTemplates = [
  { icon: 'refresh', label: '30-day returns, no reason needed',
    note: 'Unworn, tags attached. A prepaid label is in every parcel.' },
  { icon: 'ruler', label: 'Free size exchange, once per order',
    note: 'While the size you want is in stock.' },
  { icon: 'shield', label: 'Two-year seam and hardware guarantee',
    note: 'A seam that fails, a zip that stops running — we repair it or replace the piece.' },
  { icon: 'package', label: 'Pay on delivery available',
    note: 'Offered at checkout on domestic orders under the threshold you set.' },
  { icon: 'truck', label: 'Free insured delivery, signature required' },
  { icon: 'leaf', label: 'Certified supply chain, audited annually' },
  { icon: 'award', label: 'Free repairs for the life of the piece' },
]

export const featureIcons = [
  'sparkle', 'shield', 'refresh', 'truck', 'package', 'check', 'star',
  'heart', 'droplet', 'sun', 'wind', 'leaf', 'award', 'ruler', 'recycle', 'thermometer',
]

export default attributes
