/**
 * Options, choices and the variant they add up to — for any product.
 *
 * The picker used to know exactly two options, called `Color` and `Size`, and
 * everything else was a product it could not sell: a phone with storage, a pen
 * with a finish, a notebook with no options at all. This file knows none of
 * those words. It reads whatever options a product has, in whatever shape the
 * backend sent them, and answers three questions the page asks on every tap:
 * which variant is this, what does it cost, and which choices are still worth
 * offering.
 *
 * Pure, and no React, so every one of those answers has a unit test — the
 * picker is where a sparse matrix, a sold-out combination and a combination
 * that was never made all have to look different, and that is not something to
 * check by clicking.
 *
 * A selection is `{ optionId: choiceId }`. Older backends send option names and
 * value names only; they are given ids derived from the names (`Color` and
 * `Color:Ecru`), so the rest of the theme never branches on which one it has.
 */

/** Roles for a backend that predates them. The contract sets `role` in Odoo; only a missing one is guessed. */
const LEGACY_ROLE = { color: 'color', colour: 'color', size: 'size' }

const str = (v) => (v === null || v === undefined ? v : String(v))

/**
 * A product's options in the current contract's shape, whichever shape arrived.
 *
 * Exported for the demo adapter too, which serves the same derivation for
 * products authored the old way — so a product edited in the admin panel
 * (still Colour/Size-shaped until the generic editor) is sold exactly like one
 * authored with ids.
 */
export function optionsOf(product) {
  return (product?.options || []).map((o) => {
    const id = str(o.id ?? o.name)
    const role = o.role !== undefined ? o.role : LEGACY_ROLE[String(o.name).toLowerCase()] || null
    const choices = o.choices?.length
      ? o.choices.map((c) => ({ ...c, id: str(c.id) }))
      : (o.values || []).map((name) => ({
          id: `${id}:${name}`,
          name,
          color: product.swatches?.[name] || null,
          image: null,
          priceExtra: null,
          custom: false,
        }))
    return {
      id,
      name: o.name,
      displayType: o.displayType || (role === 'color' ? 'color' : 'pills'),
      role,
      imagesFollow: o.imagesFollow ?? role === 'color',
      mode: o.mode || 'variant',
      values: o.values || choices.map((c) => c.name),
      choices,
    }
  })
}

/** Attributes that do not make variants — engraving, a gift box — with string ids. */
export const extrasOf = (product) =>
  (product?.extraOptions || []).map((o) => ({
    ...o,
    id: str(o.id),
    choices: (o.choices || []).map((c) => ({ ...c, id: str(c.id) })),
  }))

/** `{ optionId: choiceId }` for one variant: its `optionIds`, or its option names looked up. */
export function keyOf(variant, options) {
  if (variant?.optionIds && Object.keys(variant.optionIds).length) {
    return Object.fromEntries(Object.entries(variant.optionIds).map(([k, v]) => [str(k), str(v)]))
  }
  const key = {}
  for (const o of options) {
    const choice = o.choices.find((c) => c.name === variant?.options?.[o.name])
    if (choice) key[o.id] = choice.id
  }
  return key
}

/** Everything the picker reads, derived once per product. */
export function modelOf(product) {
  const options = optionsOf(product)
  return {
    options,
    extras: extrasOf(product),
    entries: (product?.variants || []).map((variant) => ({ variant, key: keyOf(variant, options) })),
    dynamic: options.some((o) => o.mode === 'dynamic'),
  }
}

/**
 * Whether the backend takes `product_slug` and `choice_ids` for this product.
 *
 * A Phase 2 backend sends `optionIds` on every variant (an empty object for a
 * product with no options). One that does not only understands `variant_id`,
 * and sending it anything else is a 422 on the button a shopper came to press.
 */
export const speaksChoices = (product) =>
  Boolean(product?.variants?.length) && product.variants.every((v) => v.optionIds && typeof v.optionIds === 'object')

const fits = (key, selection) => Object.entries(selection).every(([id, choice]) => choice == null || key[id] === choice)

export const isComplete = (model, selection) => model.options.every((o) => selection[o.id] != null)

/** The first option still to choose, or null. It names the button: "Select storage". */
export const missingOption = (model, selection) => model.options.find((o) => selection[o.id] == null) || null

/** The variant the selection names, or null while it is incomplete or names a combination nobody made. */
export function variantFor(model, selection) {
  if (!isComplete(model, selection)) return null
  return model.entries.find((e) => model.options.every((o) => e.key[o.id] === selection[o.id]))?.variant || null
}

/**
 * One choice, in context: `available`, `sold-out`, `absent` or `unknown`.
 *
 * Four states, not two. "Sold out" and "never made in this combination" look
 * identical if you only track stock, and they answer different questions — one
 * is worth waiting for, the other is not. `unknown` is a dynamic option's
 * combination that nobody has bought yet, so it is not in `variants[]` and only
 * the server can price it.
 *
 * A choice is judged against the options *before* it, not all of them. Judging
 * against every other selection makes the picker circular: pick size M first
 * and half the colours strike through, pick one of those anyway and now it is M
 * that is struck. Reading left to right, the first option is always fully open
 * and each one after narrows to what exists under the ones already chosen,
 * which is the order a shopper reads the picker in.
 */
export function choiceState(model, selection, optionIndex, choiceId) {
  const scope = {}
  model.options.slice(0, optionIndex).forEach((o) => {
    if (selection[o.id] != null) scope[o.id] = selection[o.id]
  })
  scope[model.options[optionIndex].id] = choiceId
  const pool = model.entries.filter((e) => fits(e.key, scope))
  if (pool.some((e) => e.variant.available)) return 'available'
  if (pool.length) return 'sold-out'
  return model.dynamic ? 'unknown' : 'absent'
}

const choosable = (state) => state === 'available' || state === 'unknown'

/**
 * Where the picker starts.
 *
 * An option with one choice is already chosen — nobody should have to press
 * "One Size". The option the gallery follows starts on its first buyable
 * choice: defaulting to the first colour looks harmless until that colourway
 * sells out, and then every visitor lands on a product where everything is
 * struck through and concludes the whole thing is gone. Everything else starts
 * empty, so a size or a storage tier is a decision rather than a default
 * somebody bought by accident.
 */
export function initialSelection(model, variantId) {
  const wanted = variantId && model.entries.find((e) => e.variant.id === variantId)
  if (wanted) return { ...wanted.key }
  const selection = {}
  model.options.forEach((o, i) => {
    if (o.choices.length === 1) selection[o.id] = o.choices[0].id
    else if (o.imagesFollow) {
      const first = o.choices.find((c) => choosable(choiceState(model, selection, i, c.id))) || o.choices[0]
      if (first) selection[o.id] = first.id
    }
  })
  return selection
}

/**
 * Choose one value, keeping the later choices that still make sense.
 *
 * Changing colour keeps the size when that size still exists, in stock, in the
 * new colour. Clearing it every time makes the picker feel like it is fighting
 * you. A later choice that no longer works is dropped — except on the option
 * the gallery follows, which moves to its first choice that does, because an
 * empty selection there is a gallery with no photograph of the thing chosen.
 */
export function pick(model, selection, optionId, choiceId) {
  const next = { ...selection, [optionId]: choiceId }
  const at = model.options.findIndex((o) => o.id === optionId)
  model.options.forEach((o, i) => {
    if (i <= at || next[o.id] == null || choosable(choiceState(model, next, i, next[o.id]))) return
    const fallback = o.imagesFollow && o.choices.find((c) => choosable(choiceState(model, next, i, c.id)))
    if (fallback) next[o.id] = fallback.id
    else delete next[o.id]
  })
  return next
}

/** "Graphite · 256 GB" — what is chosen so far, in option order. */
export const selectionLabel = (model, selection) =>
  model.options
    .map((o) => o.choices.find((c) => c.id === selection[o.id])?.name)
    .filter(Boolean)
    .join(' · ')

/** The choice ids to send, options first and in option order. */
export const choiceIdsOf = (model, selection) => model.options.map((o) => selection[o.id]).filter((id) => id != null)

const lowest = (list) => list.reduce((a, b) => (b.amount < a.amount ? b : a))
const highest = (list) => list.reduce((a, b) => (b.amount > a.amount ? b : a))
const plus = (m, amount) => (m && amount ? { ...m, amount: m.amount + amount } : m)

/**
 * The price for what is chosen, which is not always a variant.
 *
 * The exact price once a variant is settled, and the range across what is still
 * possible before that. A range is the honest answer to "what does this cost"
 * when the answer depends on a choice not made yet; a single number that jumps
 * when the last option is picked reads as the page ignoring the picker.
 *
 * `extra` is the no-variant choices on top (an engraving, a gift box), in minor
 * units, added to both ends.
 */
export function priceFor(model, selection, product, extra = 0) {
  const variant = variantFor(model, selection)
  if (variant) {
    return { price: plus(variant.price, extra), compareAt: plus(variant.compareAtPrice ?? product?.compareAtPrice ?? null, extra) }
  }
  const pool = model.entries.filter((e) => fits(e.key, selection)).map((e) => e.variant.price).filter(Boolean)
  const prices = pool.length ? pool : model.entries.map((e) => e.variant.price).filter(Boolean)
  if (!prices.length) return { price: plus(product?.price, extra), compareAt: plus(product?.compareAtPrice ?? null, extra) }
  const low = lowest(prices)
  const high = highest(prices)
  return low.amount === high.amount
    ? { price: plus(low, extra), compareAt: plus(product?.compareAtPrice ?? null, extra) }
    : { price: plus(low, extra), to: plus(high, extra) }
}

/**
 * The gallery for the chosen value of the option images follow.
 *
 * Images tagged with that value, plus every untagged one (a detail crop, a
 * packshot) which belongs to all of them. Tags are value names in
 * `images[].color`, as today; a store that tags nothing sees every image.
 */
export function galleryFor(product, model, selection) {
  const images = product?.images || []
  const follow = model.options.find((o) => o.imagesFollow)
  const chosen = follow?.choices.find((c) => c.id === selection[follow.id])
  if (!chosen) return images
  const scoped = [
    ...images.filter((img) => img.color != null && img.color === chosen.name),
    ...images.filter((img) => img.color == null),
  ]
  return scoped.length ? scoped : images
}

/* ── extra options ─────────────────────────────────────────────────────── */

/**
 * `{ optionId: [choiceIds] }` to start from. A required single choice starts on
 * its first value, which is what Odoo does with a radio that must have one;
 * checkboxes and optional choices start empty.
 */
export const initialExtras = (extras) =>
  Object.fromEntries(extras.map((o) => [o.id, !o.multiple && o.required && o.choices[0] ? [o.choices[0].id] : []]))

/** Tick or untick one extra choice. A single-choice option replaces; `null` clears it. */
export function toggleExtra(extras, state, optionId, choiceId) {
  const option = extras.find((o) => o.id === optionId)
  const current = state[optionId] || []
  if (!option) return state
  if (!option.multiple) return { ...state, [optionId]: choiceId == null ? [] : [choiceId] }
  return {
    ...state,
    [optionId]: current.includes(choiceId) ? current.filter((id) => id !== choiceId) : [...current, choiceId],
  }
}

/** The chosen extra choices, with their option. */
export const chosenExtras = (extras, state) =>
  extras.flatMap((o) => (state[o.id] || []).map((id) => ({ option: o, choice: o.choices.find((c) => c.id === id) })))
    .filter((x) => x.choice)

/** What the chosen extras add, in minor units. */
export const extrasTotal = (extras, state) =>
  chosenExtras(extras, state).reduce((sum, x) => sum + (x.choice.priceExtra?.amount || 0), 0)

/** Custom choices that are chosen and still have no text — the button waits for them. */
export const missingText = (model, selection, extras, extraState, texts) =>
  [
    ...model.options.flatMap((o) => o.choices.filter((c) => c.custom && c.id === selection[o.id])),
    ...chosenExtras(extras, extraState).map((x) => x.choice).filter((c) => c.custom),
  ].filter((c) => !String(texts[c.id] || '').trim())

/* ── combos ────────────────────────────────────────────────────────────── */

/**
 * Groups with only one item it can be are chosen already, like single-choice options.
 * Odoo sends `combo: null` for every product that is not a combo; a `= []` default only replaces
 * `undefined`, so null is handled explicitly (it crashed the prerendered product pages).
 */
export const initialCombo = (groups) =>
  Object.fromEntries(
    (groups || [])
      .map((g) => [g.id, g.items.filter((i) => i.available !== false)])
      .filter(([, live]) => live.length === 1)
      .map(([id, live]) => [id, live[0].id]),
  )

/** What a combo selection still lacks, and what it adds to the price. */
export function comboState(groups, picks) {
  groups = groups || []
  picks = picks || {}
  const missing = groups.filter((g) => !g.items.some((i) => i.id === picks[g.id]))
  const extra = groups.reduce((sum, g) => sum + (g.items.find((i) => i.id === picks[g.id])?.extraPrice?.amount || 0), 0)
  return { missing, extra, complete: missing.length === 0 }
}
