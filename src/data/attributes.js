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
  { key: 'genericName', label: 'Generic name', group: 'packaging' },
  { key: 'countryOfOrigin', label: 'Country of origin', group: 'packaging' },
  { key: 'manufacturer', label: 'Manufacturer name and address', group: 'packaging' },
  { key: 'packer', label: 'Packer name and address', group: 'packaging' },
  { key: 'importer', label: 'Importer name and address', group: 'packaging' },
  { key: 'netQuantity', label: 'Net quantity', group: 'packaging' },
  { key: 'packOf', label: 'Pack of', group: 'packaging' },
]

export const attributeByKey = Object.fromEntries(attributes.map((a) => [a.key, a]))

/** Icons a feature card can use. Anything else is an image URL. */
export const featureIcons = [
  'sparkle', 'shield', 'refresh', 'truck', 'package', 'check', 'star',
  'heart', 'droplet', 'sun', 'wind', 'leaf', 'award', 'ruler', 'recycle', 'thermometer',
]

export default attributes
