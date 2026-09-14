/**
 * The demo's information pages. A live store's pages come from `GET /pages/:slug`
 * (written in the backend); only the demo adapter reads this file.
 */
export const pages = {
  'size-guide': {
    title: 'Size guide',
    intro: 'Measurements are of the garment laid flat, not of the body. If you are between sizes, our cuts run generous — take the smaller one.',
    blocks: [
      { type: 'table', h: 'Tops and knitwear', table: [
        ['Size', 'Chest (cm)', 'Length (cm)', 'Sleeve (cm)'],
        ['XS', '96', '68', '61'], ['S', '102', '70', '62'], ['M', '108', '72', '64'],
        ['L', '114', '74', '65'], ['XL', '120', '76', '66'],
      ] },
      { type: 'table', h: 'Trousers', table: [
        ['Size', 'Waist (cm)', 'Hip (cm)', 'Inseam (cm)'],
        ['XS', '74', '96', '76'], ['S', '79', '101', '76'], ['M', '84', '106', '78'],
        ['L', '89', '111', '78'], ['XL', '94', '116', '80'],
      ] },
      { type: 'text', h: 'How we measure', p: 'Chest is measured across the garment one inch below the armhole and doubled. Length runs from the highest point of the shoulder to the hem. Every piece is measured in the size we photograph, which is a medium.' },
    ],
  },
  shipping: {
    title: 'Shipping & returns',
    intro: 'Free standard shipping over $150. Everything is tracked, and a prepaid return label is in every parcel.',
    blocks: [
      { type: 'table', h: 'Shipping', table: [
        ['Method', 'Time', 'Cost'],
        ['Standard', '2–4 working days', '$12, free over $150'],
        ['Express', 'Next working day', '$24'],
        ['International', '5–10 working days', 'Calculated at checkout'],
      ] },
      { type: 'text', h: 'Returns', p: 'Thirty days from delivery, unworn and with tags attached. Use the prepaid label in your parcel or start a return from your account. Refunds land within five working days of the parcel reaching us.' },
      { type: 'text', h: 'Repairs', p: 'We will repair anything we made, for as long as we are around. Send it to us and we will quote before doing any work — most seam and button repairs are free.' },
    ],
  },
  care: {
    title: 'Fabric & care',
    intro: 'Most clothes are washed too often and too hot. Airing a wool knit overnight does more than a wash cycle ever will.',
    blocks: [
      { type: 'text', h: 'Wool and cashmere', p: 'Hand wash cool with a wool shampoo, or use a machine wool cycle at 30°C in a mesh bag. Never tumble dry. Dry flat and reshape while damp. De-pill with a cashmere comb rather than a razor, which cuts fibres and makes it worse.' },
      { type: 'text', h: 'Linen', p: 'Machine wash cool and line dry. Linen creases — that is the fibre behaving correctly, not a fault. If you want it flat, iron while it is still slightly damp.' },
      { type: 'text', h: 'Cotton', p: 'Cool wash with like colours, tumble low or line dry. Garment-dyed pieces will lose a little colour in the first two washes; wash them separately to start.' },
      { type: 'faq', h: 'Can waxed cotton go in the machine?', p: 'Never machine wash and never dry clean — both strip the wax. Wipe with a damp cloth. Rewax once a year with heavy use.' },
      { type: 'faq', h: 'How do I look after leather?', p: 'Wipe with a dry cloth and condition twice a year. Keep it away from radiators and direct sun, which dry the hide out and crack it.' },
    ],
  },
  contact: {
    title: 'Contact',
    intro: 'A real person answers, usually within one working day.',
    blocks: [
      { type: 'contact', h: 'Customer care' },
      { type: 'contact-form', h: 'Send us a message' },
      { type: 'text', h: 'About this store', p: 'LOOM is a demo storefront built by CodeCrafters as an open-source theme. Nothing here ships and no payment is taken. The source, including the API contract for wiring it to a real backend, is on GitHub.' },
    ],
  },
}
