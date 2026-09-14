/**
 * Neutral defaults for a live store (api mode).
 *
 * The storefront's settings come from `GET /storefront`. These fill only the
 * keys a backend leaves out, so they say nothing about any particular shop: no
 * name, no promises, no demo navigation, no payment marks. The demo's own
 * content is `storefront.js`, and a live build never includes it.
 */
export const defaults = {
  version: 1,

  store: {
    name: '',
    tagline: '',
    description: '',
    logo: { wordmark: '', imageUrl: null, height: 22 },
    email: '',
    contact: { email: '', phone: '', whatsapp: '', address: [], hours: '', social: [], legalName: '', vat: '' },
    credit: false,
  },

  pricing: {
    currency: 'USD',
    locale: 'en-US',
    currencies: [],
    showTaxNote: false,
    taxNote: '',
  },

  commerce: {
    freeShippingOver: null,
    returnsWindowDays: 0,
    shippingMethods: [],
    countries: [],
    stock: { display: 'exact', lowThreshold: 5, hideSoldOut: false },
  },

  features: {
    wishlist: true,
    reviews: true,
    search: true,
    accounts: true,
    discountCodes: true,
    newsletter: true,
    recentlyViewed: true,
    docsLink: 'auto',
    blog: false,
    contactForm: true,
  },

  navigation: { primary: [], footer: [], announcement: null },

  home: [],

  recommendations: {
    strategy: 'automatic',
    limit: 4,
    title: 'You might also like',
    inCart: { enabled: true, title: 'Goes with this', limit: 3, strategy: 'same-category' },
  },

  checkout: {
    mode: 'payments',
    provider: null,
    publicKey: '',
    createUrl: '/carts/:cartId/checkout',
    verifyUrl: '/payments/verify',
    successUrl: '/order/:orderId',
    cancelUrl: '/cart',
    collectPhone: true,
    requireAccount: false,
    termsUrl: '/pages/terms',
    restockOnRefund: true,
  },

  seo: {
    siteUrl: '',
    indexable: true,
    disallow: ['/checkout', '/account', '/cart', '/orders/lookup', '/admin'],
    aiCrawlers: 'allow',
    crawlers: {},
    sitemapImages: true,
  },

  analytics: { enabled: false, respectDoNotTrack: true, debug: false },

  notifications: {
    enabled: false,
    from: '',
    replyTo: '',
    transport: 'smtp',
    smtp: { host: '', port: 465, secure: true, user: '' },
    endpoint: '',
    events: {},
  },

  trust: {
    payments: [],
    assurances: [],
    repairs: false,
    showCertifications: true,
    showFitFeedback: true,
    showSocialProof: true,
    socialProofThresholds: { bought: 25, saved: 20 },
  },

  deliveryPolicy: [],
  promises: [],

  theme: null,
  consent: { enabled: false, mode: 'opt-in', categories: [], policyVersion: '1', policyUrl: '' },
  access: { mode: 'open', message: '' },
  security: { captcha: null },
}

export default defaults
