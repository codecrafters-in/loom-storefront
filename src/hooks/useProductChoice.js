import { useEffect, useMemo, useState } from 'react'
import api from '../lib/api/index.js'
import {
  choiceIdsOf, chosenExtras, comboState, extrasTotal, galleryFor, initialCombo, initialExtras, initialSelection,
  isComplete, missingOption, missingText, modelOf, pick, priceFor, speaksChoices, toggleExtra, variantFor,
} from '../lib/variants.js'
import { clampQuantity, ruleOf, stepperProps } from '../lib/quantity.js'

/**
 * Everything a buy box decides, for any product.
 *
 * Which choices are made, which variant that is, what it costs with the extras
 * on top, what is still missing, and the exact request to send. Shared by the
 * product page, the sheet the sticky bar opens and the quick view, because two
 * copies of this is how "sold out" ends up struck through in one of them and
 * greyed in the other.
 *
 * `live` is false in the admin preview: nothing there may ask the server a
 * question about a product that has not been saved.
 */
export default function useProductChoice(product, { live = true } = {}) {
  const model = useMemo(() => modelOf(product), [product])
  const [selection, setSelection] = useState(() => initialSelection(model))
  const [extras, setExtras] = useState(() => initialExtras(model.extras))
  const [texts, setTexts] = useState({})
  const [combo, setCombo] = useState(() => initialCombo(product?.combo))
  const rule = ruleOf(product?.quantity)
  const [qty, setQty] = useState(rule.min)

  const variant = variantFor(model, selection)
  const complete = isComplete(model, selection)
  const chosenIds = choiceIdsOf(model, selection)
  const picked = chosenExtras(model.extras, extras)
  const extraAmount = extrasTotal(model.extras, extras)
  const set = comboState(product?.combo, combo)
  const gallery = useMemo(() => galleryFor(product, model, selection), [product, model, selection])

  /**
   * What only the server can price: a dynamic combination nobody has bought
   * yet, or extras on top of a variant (a pricelist can change what they add).
   * Keyed on the choices, so an answer to an earlier question never prices the
   * current one, and debounced, so ticking three add-ons asks once.
   */
  const quoteKey = live && complete && ((!variant && model.dynamic) || extraAmount > 0)
    ? [...chosenIds, ...picked.map((x) => x.choice.id)].join('|')
    : ''
  const [quote, setQuote] = useState(null)
  useEffect(() => {
    if (!quoteKey) return undefined
    let alive = true
    const timer = setTimeout(() => {
      api
        .getCombination(product.slug, quoteKey.split('|').filter(Boolean))
        .then((data) => alive && setQuote({ key: quoteKey, data }))
        .catch((error) => alive && setQuote({ key: quoteKey, error }))
    }, 250)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [product?.slug, quoteKey])
  const answer = quoteKey && quote?.key === quoteKey ? quote : null

  let shown = answer?.data
    ? { price: answer.data.price, compareAt: answer.data.compareAtPrice }
    : priceFor(model, selection, product, extraAmount)
  if (set.extra) {
    const bump = (m) => m && { ...m, amount: m.amount + set.extra }
    shown = { price: bump(shown.price), to: bump(shown.to), compareAt: bump(shown.compareAt) }
  }

  const cap = typeof variant?.inventory === 'number' ? variant.inventory : undefined
  const missing = missingOption(model, selection)
  const needsText = missingText(model, selection, model.extras, extras, texts)
  // A complete selection with no variant and nothing dynamic is a combination
  // that was never made, reached by restoring a stale link.
  const invalid = answer?.error?.code === 'invalid_combination' || (complete && !variant && !model.dynamic && model.options.length > 0)
  const unavailable = answer?.data ? !answer.data.available : Boolean(variant && !variant.available)

  // The first thing standing between the shopper and the bag names the button.
  const blocker = missing
    ? `Select ${missing.name.toLowerCase()}`
    : set.missing.length
      ? `Choose ${set.missing[0].name.toLowerCase()}`
      : needsText.length
        ? `Enter ${needsText[0].name.toLowerCase()}`
        : invalid
          ? 'Not available'
          : unavailable
            ? 'Out of stock'
            : null

  /** The body for `addToCart`, in the shape docs/API.md describes. */
  const request = () => {
    const custom = [
      ...model.options.flatMap((o) => o.choices.filter((c) => c.custom && c.id === selection[o.id])),
      ...picked.map((x) => x.choice).filter((c) => c.custom),
    ]
      .map((c) => ({ choiceId: c.id, text: String(texts[c.id] || '').trim().slice(0, 200) }))
      .filter((c) => c.text)
    return {
      // A backend that predates choice ids gets the variant id it understands.
      ...(speaksChoices(product) || !variant
        ? { productSlug: product.slug, choiceIds: chosenIds }
        : { variantId: variant.id }),
      quantity: clampQuantity(qty, rule, cap),
      ...(picked.length ? { extraChoiceIds: picked.map((x) => x.choice.id) } : {}),
      ...(custom.length ? { customValues: custom } : {}),
      ...(product.type === 'combo' ? { comboItems: Object.values(combo).map((comboItemId) => ({ comboItemId })) } : {}),
    }
  }

  return {
    model,
    selection,
    variant,
    gallery,
    shown,
    missing,
    blocker,
    ready: !blocker,
    // Nothing the shopper can choose will fix these; the sticky bar disables rather than scrolls.
    stuck: !missing && !set.missing.length && !needsText.length && Boolean(blocker),
    extras,
    texts,
    combo,
    qty,
    stepper: stepperProps(rule, cap),
    pickChoice: (optionId, choiceId) => setSelection((s) => pick(model, s, optionId, choiceId)),
    restore: (variantId) => setSelection(initialSelection(model, variantId)),
    toggleExtra: (optionId, choiceId) => setExtras((s) => toggleExtra(model.extras, s, optionId, choiceId)),
    setText: (choiceId, text) => setTexts((t) => ({ ...t, [choiceId]: String(text).slice(0, 200) })),
    pickCombo: (groupId, itemId) => setCombo((c) => ({ ...c, [groupId]: itemId })),
    setQty: (q) => setQty(clampQuantity(q, rule, cap)),
    request,
  }
}
