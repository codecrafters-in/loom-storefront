/**
 * Fit, fabric and trust data.
 *
 * This is the highest-leverage data in an apparel catalogue and it is usually
 * the thinnest. Size and fit cause roughly two thirds of fashion returns, and
 * apparel return rates run 20–40% — the highest of any category. Every field
 * here exists to close that gap before the order, not after it.
 *
 * What the research supports, and what each field is for:
 *
 *  - **Garment measurements per size.** "Medium" means nothing across brands.
 *    A chest measurement in centimetres is checkable against something the
 *    shopper already owns, which is the only sizing signal that transfers.
 *  - **Model height and size worn.** The cheapest fit signal there is: it turns
 *    a photograph into a scale reference.
 *  - **Aggregated fit feedback.** "82% say true to size" from real purchasers
 *    outperforms any copy the brand writes about its own cut.
 *  - **Composition, weight and origin.** Drape, warmth and whether a thing is
 *    see-through are all weight questions. 190gsm linen and 110gsm linen are
 *    different products.
 *  - **Certifications.** OEKO-TEX and GOTS are third-party and checkable, which
 *    is what separates them from a brand claiming to be sustainable.
 *  - **Return and delivery terms next to the buy button.** Moving the return
 *    policy from the footer to beside add-to-cart is one of the better-attested
 *    lifts in apparel.
 *
 * Everything here ships through the API as part of the Product, so a real
 * backend can serve it and an admin panel can edit it.
 */

/** Garment measurements, laid flat, in centimetres. Keyed by fit block. */
export const sizeCharts = {
  tops: {
    unit: 'cm',
    note: 'Measured flat, garment not body. Chest is measured 2.5cm below the armhole and doubled.',
    columns: ['Size', 'Chest', 'Length', 'Shoulder', 'Sleeve'],
    rows: [
      ['XS', 96, 68, 43, 61],
      ['S', 102, 70, 45, 62],
      ['M', 108, 72, 47, 64],
      ['L', 114, 74, 49, 65],
      ['XL', 120, 76, 51, 66],
    ],
  },
  trousers: {
    unit: 'cm',
    note: 'Measured flat. Waist is the relaxed waistband, doubled. Inseam is unfinished on tailored styles.',
    columns: ['Size', 'Waist', 'Hip', 'Inseam', 'Leg opening'],
    rows: [
      ['XS', 74, 96, 76, 20],
      ['S', 79, 101, 76, 21],
      ['M', 84, 106, 78, 22],
      ['L', 89, 111, 78, 23],
      ['XL', 94, 116, 80, 24],
    ],
  },
  dresses: {
    unit: 'cm',
    note: 'Measured flat. Length runs from the highest shoulder point to the hem.',
    columns: ['Size', 'Bust', 'Waist', 'Hip', 'Length'],
    rows: [
      ['XS', 84, 66, 92, 116],
      ['S', 89, 71, 97, 117],
      ['M', 94, 76, 102, 118],
      ['L', 99, 81, 107, 119],
      ['XL', 104, 86, 112, 120],
    ],
  },
  outerwear: {
    unit: 'cm',
    note: 'Measured flat, cut to layer over a knit. Size as you would a jacket, not a shirt.',
    columns: ['Size', 'Chest', 'Length', 'Shoulder', 'Sleeve'],
    rows: [
      ['XS', 104, 84, 45, 62],
      ['S', 110, 86, 47, 63],
      ['M', 116, 88, 49, 65],
      ['L', 122, 90, 51, 66],
      ['XL', 128, 92, 53, 67],
    ],
  },
  belt: {
    unit: 'cm',
    note: 'Choose the size matching your usual trouser waist. Five holes, 2.5cm apart.',
    columns: ['Size', 'Fits waist', 'Total length', 'Width'],
    rows: [
      ['S', '76–86', 105, 3.5],
      ['M', '86–96', 115, 3.5],
      ['L', '96–106', 125, 3.5],
    ],
  },
}

/**
 * Per-product fit, fabric and provenance.
 *
 * `fit.verdict` is derived from real purchase feedback, not from the brand's
 * opinion of its own cut — which is the only version a shopper has reason to
 * believe.
 */
export const productFacts = {
  'oxford-shirt-ecru': {
    chart: 'tops',
    fit: { verdict: 'true-to-size', feedback: { small: 8, true: 84, large: 8 }, sample: 214,
      note: 'Cut a half-size roomier through the chest than a dress shirt. If you want it fitted, size down.',
      model: { height: 185, size: 'M', label: '6\'1"' } },
    fabric: { composition: [['Cotton', 100]], weight: 140, weave: 'Oxford', origin: 'Guimarães, Portugal',
      certifications: ['OEKO-TEX Standard 100'] },
  },
  'linen-camp-shirt': {
    chart: 'tops',
    fit: { verdict: 'runs-large', feedback: { small: 4, true: 61, large: 35 }, sample: 138,
      note: 'Deliberately boxy. Most people take their usual size; size down for a closer fit.',
      model: { height: 180, size: 'M', label: '5\'11"' } },
    fabric: { composition: [['European flax linen', 100]], weight: 190, weave: 'Plain', origin: 'Kortrijk, Belgium',
      certifications: ['European Flax', 'OEKO-TEX Standard 100'] },
  },
  'poplin-shirt-white': {
    chart: 'tops',
    fit: { verdict: 'runs-small', feedback: { small: 31, true: 64, large: 5 }, sample: 96,
      note: 'A traditional shirt cut. If you are between sizes, take the larger.',
      model: { height: 183, size: 'M', label: '6\'0"' } },
    fabric: { composition: [['Cotton', 100]], weight: 120, weave: 'Two-ply 100s poplin', origin: 'Como, Italy',
      certifications: ['OEKO-TEX Standard 100'] },
  },
  'brushed-flannel-shirt': {
    chart: 'tops',
    fit: { verdict: 'true-to-size', feedback: { small: 9, true: 82, large: 9 }, sample: 118,
      note: 'Room for a tee underneath without going up a size.',
      model: { height: 178, size: 'M', label: '5\'10"' } },
    fabric: { composition: [['Cotton', 100]], weight: 210, weave: 'Double-brushed twill', origin: 'Bergamo, Italy',
      certifications: ['OEKO-TEX Standard 100'] },
  },
  'merino-crew-knit': {
    chart: 'tops',
    fit: { verdict: 'true-to-size', feedback: { small: 6, true: 88, large: 6 }, sample: 302,
      note: 'Fully fashioned, so it holds its shape. Take your usual size.',
      model: { height: 175, size: 'S', label: '5\'9"' } },
    fabric: { composition: [['Extra-fine merino wool', 100]], weight: 260, weave: '12gg fully fashioned',
      origin: 'Biella, Italy', certifications: ['Responsible Wool Standard', 'OEKO-TEX Standard 100'] },
  },
  'lambswool-cardigan': {
    chart: 'tops',
    fit: { verdict: 'runs-large', feedback: { small: 3, true: 68, large: 29 }, sample: 121,
      note: 'Cut to layer over a shirt. Size down if you will wear it over a tee.',
      model: { height: 180, size: 'M', label: '5\'11"' } },
    fabric: { composition: [['Shetland lambswool', 100]], weight: 420, weave: '7gg saddle shoulder',
      origin: 'Hawick, Scotland', certifications: ['Responsible Wool Standard'] },
  },
  'cotton-fisherman-knit': {
    chart: 'tops',
    fit: { verdict: 'runs-large', feedback: { small: 5, true: 63, large: 32 }, sample: 74,
      note: 'Drop shoulder and a generous body. Size down for a neater fit.',
      model: { height: 172, size: 'S', label: '5\'8"' } },
    fabric: { composition: [['Organic cotton', 100]], weight: 380, weave: '5gg cable', origin: 'Porto, Portugal',
      certifications: ['GOTS Organic', 'OEKO-TEX Standard 100'] },
  },
  'silk-cotton-tee': {
    chart: 'tops',
    fit: { verdict: 'true-to-size', feedback: { small: 11, true: 80, large: 9 }, sample: 267,
      note: 'Side-seamed rather than tubular, so it follows the body without clinging.',
      model: { height: 178, size: 'M', label: '5\'10"' } },
    fabric: { composition: [['Cotton', 70], ['Mulberry silk', 30]], weight: 180, weave: 'Jersey',
      origin: 'Porto, Portugal', certifications: ['OEKO-TEX Standard 100'] },
  },
  'cashmere-crew': {
    chart: 'tops',
    fit: { verdict: 'true-to-size', feedback: { small: 7, true: 86, large: 7 }, sample: 88,
      note: 'Knitted to layer under a coat. Take your usual size.',
      model: { height: 183, size: 'M', label: '6\'0"' } },
    fabric: { composition: [['Grade-A cashmere', 100]], weight: 300, weave: '12gg 2-ply fully fashioned',
      origin: 'Hawick, Scotland', certifications: ['Good Cashmere Standard'] },
  },
  'wool-overcoat': {
    chart: 'outerwear',
    fit: { verdict: 'true-to-size', feedback: { small: 6, true: 85, large: 9 }, sample: 58,
      note: 'Cut to go over a jacket. Take your usual size — it is already generous.',
      model: { height: 186, size: 'M', label: '6\'1"' } },
    fabric: { composition: [['Virgin wool', 100]], weight: 750, weave: 'Double-faced, hand-stitched',
      origin: 'Prato, Italy', certifications: ['Responsible Wool Standard'] },
  },
  'waxed-cotton-jacket': {
    chart: 'outerwear',
    fit: { verdict: 'runs-small', feedback: { small: 27, true: 68, large: 5 }, sample: 167,
      note: 'A trim, short cut. Size up if you plan to wear a heavy knit underneath.',
      model: { height: 180, size: 'M', label: '5\'11"' } },
    fabric: { composition: [['Waxed cotton', 100]], weight: 380, weave: '8oz Millerain', origin: 'Lancashire, England',
      certifications: [] },
  },
  'quilted-liner-jacket': {
    chart: 'outerwear',
    fit: { verdict: 'true-to-size', feedback: { small: 10, true: 81, large: 9 }, sample: 143,
      note: 'Cut trim to disappear under a coat.',
      model: { height: 175, size: 'S', label: '5\'9"' } },
    fabric: { composition: [['Recycled polyester shell', 100], ['Recycled polyester fill', 100]], weight: 180,
      weave: 'Ripstop, diamond quilt', origin: 'Da Nang, Vietnam',
      certifications: ['Global Recycled Standard', 'bluesign approved'] },
  },
  'shearling-collar-jacket': {
    chart: 'outerwear',
    fit: { verdict: 'true-to-size', feedback: { small: 12, true: 79, large: 9 }, sample: 76,
      note: 'Blanket-lined, so it is roomier than the measurement suggests.',
      model: { height: 183, size: 'M', label: '6\'0"' } },
    fabric: { composition: [['Cotton drill', 100]], weight: 480, weave: '14oz drill', origin: 'Izmir, Türkiye',
      certifications: ['OEKO-TEX Standard 100'] },
  },
  'pleated-wool-trouser': {
    chart: 'trousers',
    fit: { verdict: 'true-to-size', feedback: { small: 9, true: 83, large: 8 }, sample: 189,
      note: 'A genuinely high rise. Sold with an unfinished hem — allow for tailoring.',
      model: { height: 180, size: 'M', label: '5\'11"' } },
    fabric: { composition: [['Tropical wool', 100]], weight: 260, weave: 'Plain weave', origin: 'Biella, Italy',
      certifications: ['Responsible Wool Standard'] },
  },
  'selvedge-denim-straight': {
    chart: 'trousers',
    fit: { verdict: 'runs-small', feedback: { small: 34, true: 61, large: 5 }, sample: 231,
      note: 'Sold raw and unwashed. It will relax about 2cm in the waist after a week. Take your usual size.',
      model: { height: 178, size: 'M', label: '5\'10"' } },
    fabric: { composition: [['Cotton', 100]], weight: 460, weave: '13.5oz shuttle-loomed selvedge',
      origin: 'Okayama, Japan', certifications: [] },
  },
  'garment-dyed-chino': {
    chart: 'trousers',
    fit: { verdict: 'true-to-size', feedback: { small: 8, true: 85, large: 7 }, sample: 176,
      note: 'No elastane, so there is no give. Take your usual size.',
      model: { height: 182, size: 'M', label: '6\'0"' } },
    fabric: { composition: [['Pima cotton', 100]], weight: 300, weave: '9oz twill', origin: 'Lima, Peru',
      certifications: ['OEKO-TEX Standard 100'] },
  },
  'wide-leg-linen-trouser': {
    chart: 'trousers',
    fit: { verdict: 'runs-large', feedback: { small: 4, true: 64, large: 32 }, sample: 94,
      note: 'Drawcord waist with inner elastic, so it forgives a size either way.',
      model: { height: 170, size: 'S', label: '5\'7"' } },
    fabric: { composition: [['Washed linen', 100]], weight: 185, weave: 'Plain', origin: 'Kortrijk, Belgium',
      certifications: ['European Flax'] },
  },
  'linen-slip-dress': {
    chart: 'dresses',
    fit: { verdict: 'true-to-size', feedback: { small: 10, true: 82, large: 8 }, sample: 108,
      note: 'Cut on the true bias, so it falls around rather than over. Adjustable straps give 5cm.',
      model: { height: 176, size: 'S', label: '5\'9"' } },
    fabric: { composition: [['Washed linen', 100]], weight: 160, weave: 'Bias-cut plain', origin: 'Kortrijk, Belgium',
      certifications: ['European Flax', 'OEKO-TEX Standard 100'] },
  },
  'poplin-shirt-dress': {
    chart: 'dresses',
    fit: { verdict: 'runs-large', feedback: { small: 5, true: 66, large: 29 }, sample: 87,
      note: 'Dropped shoulder and a self belt — works loose or defined. Size down for a neater line.',
      model: { height: 174, size: 'S', label: '5\'9"' } },
    fabric: { composition: [['Cotton', 100]], weight: 120, weave: 'Poplin', origin: 'Como, Italy',
      certifications: ['OEKO-TEX Standard 100'] },
  },
  'leather-belt': {
    chart: 'belt',
    fit: { verdict: 'true-to-size', feedback: { small: 12, true: 82, large: 6 }, sample: 143,
      note: 'Order the size matching your trouser waist, not your jeans label.', model: null },
    fabric: { composition: [['Full-grain leather', 100]], weight: null, weave: 'Vegetable-tanned',
      origin: 'Tuscany, Italy', certifications: ['Leather Working Group Gold'] },
  },
  'canvas-weekender': {
    chart: null,
    fit: { verdict: null, feedback: null, sample: 92, note: '48 × 28 × 24cm. Fits three days without pretending to fit five.', model: null },
    fabric: { composition: [['Cotton canvas', 100], ['Bridle leather trim', 100]], weight: 610, weave: '18oz canvas',
      origin: 'Chennai, India', certifications: ['Leather Working Group Gold'] },
  },
  'lambswool-scarf': {
    chart: null,
    fit: { verdict: null, feedback: null, sample: 204, note: '190 × 32cm — long enough to actually wrap.', model: null },
    fabric: { composition: [['Lambswool', 100]], weight: 280, weave: 'Twill, brushed twice',
      origin: 'Scottish Borders', certifications: ['Responsible Wool Standard'] },
  },
  'cotton-cap': {
    chart: null,
    fit: { verdict: 'true-to-size', feedback: { small: 9, true: 84, large: 7 }, sample: 61,
      note: 'Brass slide adjuster fits 54–61cm.', model: null },
    fabric: { composition: [['Washed cotton twill', 100]], weight: 260, weave: 'Twill', origin: 'Dhaka, Bangladesh',
      certifications: ['OEKO-TEX Standard 100'] },
  },
  'merino-beanie': {
    chart: null,
    fit: { verdict: 'true-to-size', feedback: { small: 6, true: 89, large: 5 }, sample: 155,
      note: 'Double-layer rib, one size, fits 54–60cm.', model: null },
    fabric: { composition: [['Extra-fine merino wool', 100]], weight: 240, weave: '2×2 rib, double layer',
      origin: 'Biella, Italy', certifications: ['Responsible Wool Standard'] },
  },
}

export const VERDICT_LABEL = {
  'true-to-size': 'True to size',
  'runs-small': 'Runs small',
  'runs-large': 'Runs large',
}
