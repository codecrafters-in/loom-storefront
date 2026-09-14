import { lineDetails } from '../../lib/cart-lines.js'
import { unitLabel } from '../../lib/quantity.js'

/**
 * The small print under a bag line: options and extras, the text a shopper
 * typed, and what is in a set.
 *
 * One component for the bag, the drawer, the checkout summary and the order
 * page, so an engraving never shows in the bag and vanishes from the receipt.
 * `quantity` adds "Qty 2" — or "Qty 0.75 kg" — for the places with no stepper.
 */
export default function LineDetails({ line, quantity = false, className = 'text-[12px] text-faint' }) {
  const { summary, custom, combo } = lineDetails(line)
  const unit = unitLabel(line.quantityRule)
  const text = [summary, quantity && `Qty ${line.quantity}${unit ? ` ${unit}` : ''}`].filter(Boolean).join('  ·  ')
  if (!text && !custom.length && !combo.length) return null
  return (
    <div className={`mt-1 space-y-0.5 ${className}`}>
      {text && <p>{text}</p>}
      {custom.map((c) => (
        <p key={c}>{c}</p>
      ))}
      {combo.length > 0 && (
        <ul className="list-inside list-disc">
          {combo.map((c, i) => (
            <li key={`${i}-${c}`}>{c}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
