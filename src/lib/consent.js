/**
 * Cookie consent, when the store asks for it (`storefront.consent`).
 *
 * The choice is kept in this browser and sent to the backend as proof
 * (`POST /consents`). Analytics stays quiet until it is allowed (opt-in) or
 * until it is refused (opt-out), and Google Consent Mode v2 hears the same
 * answer, so a tag manager on the page follows it too.
 */
import api from './api/index.js'
import { setConsent } from './analytics.js'

const KEY = 'loom.consent'
const VISITOR = 'loom.visitor'
export const CONSENT_OPEN_EVENT = 'loom:consent-open'

function gtag() {
  window.dataLayer = window.dataLayer || []
  window.dataLayer.push(arguments)
}

const state = (on) => (on ? 'granted' : 'denied')

function signal(command, { analytics, marketing }) {
  try {
    gtag('consent', command, {
      analytics_storage: state(analytics),
      ad_storage: state(marketing),
      ad_user_data: state(marketing),
      ad_personalization: state(marketing),
    })
  } catch {
    // Consent signalling must never break the page.
  }
}

/** The visitor's saved choice for this policy version, or null. */
export function savedConsent(policyVersion) {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null')
    return saved && saved.policyVersion === policyVersion ? saved.choices : null
  } catch {
    return null
  }
}

function visitorId() {
  try {
    let id = localStorage.getItem(VISITOR)
    if (!id) {
      id = (crypto.randomUUID?.() || `${Date.now()}${Math.random()}`).replace(/[^A-Za-z0-9]/g, '').slice(0, 32)
      localStorage.setItem(VISITOR, id)
    }
    return id
  } catch {
    return `anon${Date.now()}`
  }
}

/** Defaults before the visitor has chosen, from the store's mode. */
export function startConsent(consent) {
  if (!consent?.enabled || typeof window === 'undefined') return null
  const saved = savedConsent(consent.policyVersion)
  const optIn = consent.mode !== 'opt-out'
  const choices = saved || { analytics: !optIn, marketing: !optIn }
  signal('default', choices)
  setConsent(choices.analytics)
  return saved
}

export async function chooseConsent(consent, choices) {
  const clean = {
    analytics: Boolean(choices.analytics) && consent.categories?.includes('analytics'),
    marketing: Boolean(choices.marketing) && consent.categories?.includes('marketing'),
  }
  try {
    localStorage.setItem(KEY, JSON.stringify({ choices: clean, policyVersion: consent.policyVersion, at: new Date().toISOString() }))
  } catch {
    // Asked again next visit.
  }
  signal('update', clean)
  setConsent(clean.analytics)
  try {
    await api.recordConsent({ anonymousId: visitorId(), choices: clean, policyVersion: consent.policyVersion })
  } catch {
    // The choice still applies in this browser; the proof is best effort.
  }
  return clean
}
