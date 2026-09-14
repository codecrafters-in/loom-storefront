import { useSyncExternalStore } from 'react'

/**
 * The shopper's language for the storefront's own text.
 *
 * The English text is the key: `t('Add to bag')`. English needs no catalog, a string nobody has translated yet shows in
 * English rather than as a key, and a component reads the same as before. A catalog maps English to the language;
 * a plural entry is keyed by the English plural form and holds the language's own forms (`one`, `few`, `many`…, as
 * `Intl.PluralRules` names them).
 *
 * Content (product names, pages, errors from Odoo) comes translated from the backend, which answers in the language
 * the storefront asks for with `X-Loom-Lang`.
 */

/** Languages with a catalog, by the URL code Odoo uses (`/fr/...`). */
export const CATALOGS = ['fr', 'es', 'de', 'it', 'pt', 'nl', 'ar', 'hi']
const RIGHT_TO_LEFT = new Set(['ar', 'he', 'fa', 'ur'])

const loaders = {
  fr: () => import('./catalogs/fr.js'),
  es: () => import('./catalogs/es.js'),
  de: () => import('./catalogs/de.js'),
  it: () => import('./catalogs/it.js'),
  pt: () => import('./catalogs/pt.js'),
  nl: () => import('./catalogs/nl.js'),
  ar: () => import('./catalogs/ar.js'),
  hi: () => import('./catalogs/hi.js'),
}

let language = 'en'
let fromAddress = false
let catalog = {}
let overrides = {}
const listeners = new Set()
const notify = () => listeners.forEach((listener) => listener())

/**
 * The language named at the start of a path (`/fr/shop` → `fr`), or '' for none. `/en/` counts too: on a store whose
 * default is Arabic, English has an address of its own.
 */
export function languageFromPath(pathname) {
  const first = String(pathname || '/').split('/')[1]
  return first === 'en' || CATALOGS.includes(first) ? first : ''
}

/**
 * Show the storefront in `code` (a URL code). `address`: it came from the page address, so the backend is asked for
 * it too; otherwise it is the store's default and the backend already answers in it.
 */
export async function setLanguage(code, { address = false } = {}) {
  const next = code === 'en' || CATALOGS.includes(code) ? code : 'en'
  catalog = next === 'en' ? {} : (await loaders[next]()).default
  language = next
  fromAddress = address && next !== 'en' ? true : address
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.lang = next
    document.documentElement.dir = RIGHT_TO_LEFT.has(next) ? 'rtl' : 'ltr'
  }
  notify()
}

/**
 * Text the merchant rewrote in Odoo for the language being shown, English text → theirs.
 *
 * Set while the settings provider renders, before anything below it does, so it notifies nobody: every component
 * that renders after it reads the new wording.
 */
export function setOverrides(map) {
  overrides = map && typeof map === 'object' ? map : {}
}

export const currentLanguage = () => language
/** Whether the page address chose the language (so every API call asks for it). */
export const languageFromAddress = () => fromAddress
export const isRightToLeft = () => RIGHT_TO_LEFT.has(language)
/** `/fr` while the page address names the language, else ''. Addresses handed to a payment page keep it, so the shopper comes back in their language. */
export const addressPrefix = () => (fromAddress ? `/${language}` : '')

const fill = (text, vars) => (vars ? String(text).replace(/\{(\w+)\}/g, (whole, key) => (vars[key] ?? whole)) : text)

/**
 * Marks English text written outside a component (a module-level list of labels, say) for translation, and returns it
 * unchanged. Translate it where it is shown, with `t(value)`: at module load the catalog has not arrived yet. The
 * catalog extraction script (`scripts/i18n-extract.mjs`) finds `t('…')`, `plural(…)` and `mark('…')`.
 */
export const mark = (text) => text

/** `t('Add {amount} for free shipping', { amount })`. */
export function t(text, vars) {
  const translated = overrides[text] ?? catalog[text]
  return fill(typeof translated === 'string' ? translated : text, vars)
}

/** `plural(count, '{count} item', '{count} items')`, by the language's plural rules (Arabic has six forms). */
export function plural(count, one, other, vars) {
  const values = { count, ...vars }
  const entry = overrides[other] ?? catalog[other]
  if (entry && typeof entry === 'object') {
    const form = new Intl.PluralRules(language).select(count)
    return fill(entry[form] ?? entry.other ?? other, values)
  }
  if (typeof entry === 'string') return fill(entry, values)
  return fill(count === 1 ? one : other, values)
}

const subscribe = (listener) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
const snapshot = () => language

/** The language on screen; a component using it re-renders when it changes. */
export function useLanguage() {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}
