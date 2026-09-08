import { useParams, Navigate } from 'react-router-dom'
import Promises from '../components/layout/Promises.jsx'
import { Breadcrumbs } from '../components/ui/index.jsx'

/**
 * The pages a storefront needs before it can take a real order. Content is a
 * plain block array so a merchant can move it into a CMS without touching the
 * renderer.
 */
const PAGES = {
  'size-guide': {
    title: 'Size guide',
    intro: 'Measurements are of the garment laid flat, not of the body. If you are between sizes, our cuts run generous — take the smaller one.',
    blocks: [
      { h: 'Tops and knitwear', table: [
        ['Size', 'Chest (cm)', 'Length (cm)', 'Sleeve (cm)'],
        ['XS', '96', '68', '61'], ['S', '102', '70', '62'], ['M', '108', '72', '64'],
        ['L', '114', '74', '65'], ['XL', '120', '76', '66'],
      ] },
      { h: 'Trousers', table: [
        ['Size', 'Waist (cm)', 'Hip (cm)', 'Inseam (cm)'],
        ['XS', '74', '96', '76'], ['S', '79', '101', '76'], ['M', '84', '106', '78'],
        ['L', '89', '111', '78'], ['XL', '94', '116', '80'],
      ] },
      { h: 'How we measure', p: 'Chest is measured across the garment one inch below the armhole and doubled. Length runs from the highest point of the shoulder to the hem. Every piece is measured in the size we photograph, which is a medium.' },
    ],
  },
  shipping: {
    title: 'Shipping & returns',
    intro: 'Free standard shipping over $150. Everything is tracked, and a prepaid return label is in every parcel.',
    blocks: [
      { h: 'Shipping', table: [
        ['Method', 'Time', 'Cost'],
        ['Standard', '2–4 working days', '$12, free over $150'],
        ['Express', 'Next working day', '$24'],
        ['International', '5–10 working days', 'Calculated at checkout'],
      ] },
      { h: 'Returns', p: 'Thirty days from delivery, unworn and with tags attached. Use the prepaid label in your parcel or start a return from your account. Refunds land within five working days of the parcel reaching us.' },
      { h: 'Repairs', p: 'We will repair anything we made, for as long as we are around. Send it to us and we will quote before doing any work — most seam and button repairs are free.' },
    ],
  },
  care: {
    title: 'Fabric & care',
    intro: 'Most clothes are washed too often and too hot. Airing a wool knit overnight does more than a wash cycle ever will.',
    blocks: [
      { h: 'Wool and cashmere', p: 'Hand wash cool with a wool shampoo, or use a machine wool cycle at 30°C in a mesh bag. Never tumble dry. Dry flat and reshape while damp. De-pill with a cashmere comb rather than a razor, which cuts fibres and makes it worse.' },
      { h: 'Linen', p: 'Machine wash cool and line dry. Linen creases — that is the fibre behaving correctly, not a fault. If you want it flat, iron while it is still slightly damp.' },
      { h: 'Cotton', p: 'Cool wash with like colours, tumble low or line dry. Garment-dyed pieces will lose a little colour in the first two washes; wash them separately to start.' },
      { h: 'Waxed cotton', p: 'Never machine wash and never dry clean — both strip the wax. Wipe with a damp cloth. Rewax once a year with heavy use.' },
      { h: 'Leather', p: 'Wipe with a dry cloth and condition twice a year. Keep it away from radiators and direct sun, which dry the hide out and crack it.' },
    ],
  },
  contact: {
    title: 'Contact',
    intro: 'A real person answers, usually within one working day.',
    blocks: [
      { h: 'Customer care', p: 'help@loom.example — orders, returns, sizing and repairs.' },
      { h: 'Press and wholesale', p: 'hello@loom.example' },
      { h: 'About this store', p: 'LOOM is a demo storefront built by CodeCrafters as an open-source theme. Nothing here ships and no payment is taken. The source, including the API contract for wiring it to a real backend, is on GitHub.' },
    ],
  },
}

export default function StaticPage() {
  const { slug } = useParams()
  const page = PAGES[slug]
  if (!page) return <Navigate to="/404" replace />

  return (
    <>
      <div className="wrap max-w-3xl py-10 pb-20">
        <Breadcrumbs trail={[{ label: 'Home', to: '/' }, { label: page.title }]} />
        <h1 className="mt-6 text-display-lg">{page.title}</h1>
        <p className="mt-5 text-[17px] leading-relaxed text-muted">{page.intro}</p>

        <div className="mt-12 space-y-12">
          {page.blocks.map((b) => (
            <section key={b.h}>
              <h2 className="text-display-md">{b.h}</h2>
              {b.p && <p className="mt-4 text-[15px] leading-relaxed text-muted">{b.p}</p>}
              {b.table && (
                <div className="mt-5 overflow-x-auto">
                  <table className="w-full border-collapse text-[14px]">
                    <thead>
                      <tr className="border-b border-line text-left">
                        {b.table[0].map((h) => (
                          <th key={h} className="py-2.5 pr-4 font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {b.table.slice(1).map((row) => (
                        <tr key={row[0]} className="border-b border-line">
                          {row.map((cell, i) => (
                            <td key={i} className={`py-2.5 pr-4 tabular-nums ${i === 0 ? 'text-ink' : 'text-muted'}`}>{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ))}
        </div>
      </div>
      <Promises />
    </>
  )
}
