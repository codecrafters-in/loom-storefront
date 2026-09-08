/**
 * The storefront configuration document.
 *
 * Everything a merchant would want to change without touching code lives here:
 * identity, currency, navigation, the home page, recommendations, checkout,
 * feature flags. In mock mode this file *is* the response; in api mode the same
 * shape comes from `GET /storefront` and this becomes the fallback when that
 * call fails, so a config outage degrades to a working store rather than a
 * blank one.
 *
 * This is the document a future admin panel edits. Keep it serialisable — no
 * functions, no component references, nothing that cannot survive a round trip
 * through JSON.
 *
 * Precedence at runtime, highest first:
 *   1. GET /storefront            (the merchant's live settings)
 *   2. VITE_* environment vars    (deploy-time overrides)
 *   3. this file                  (defaults)
 */
export const storefront = {
  version: 1,

  store: {
    name: 'LOOM',
    tagline: 'Considered clothing, made to be kept.',
    description:
      'A clothing storefront theme by CodeCrafters. Runs on bundled demo data, or on your own API.',
    // `mark` is drawn by the Logo component; `wordmark` is the text beside it.
    // Point `imageUrl` at a file to use artwork instead.
    logo: { wordmark: 'LOOM', mark: 'loom', imageUrl: null, height: 22 },
    email: 'help@loom.example',
  },

  /** Money, and the countries you will ship to. */
  pricing: {
    currency: 'USD',
    locale: 'en-US',
    /**
     * The currencies this store prices in. Display metadata only — the theme
     * never converts. Prices arrive from the API already in the currency it
     * was asked for, because a browser doing FX with a stale rate is wrong the
     * day the rate moves, and wrong on an invoice is a refund.
     */
    currencies: [
      { code: 'USD', label: 'US Dollar', symbol: '$' },
      { code: 'EUR', label: 'Euro', symbol: '€' },
      { code: 'GBP', label: 'Pound Sterling', symbol: '£' },
      { code: 'INR', label: 'Indian Rupee', symbol: '₹' },
      { code: 'AED', label: 'UAE Dirham', symbol: 'د.إ' },
    ],
    /** Display only. Prices still arrive priced by the API in its currency. */
    showTaxNote: true,
    taxNote: 'Tax calculated at checkout.',
  },

  commerce: {
    freeShippingOver: 15000, // minor units
    returnsWindowDays: 30,
    shippingMethods: [
      { id: 'standard', label: 'Standard', note: '2–4 working days', price: 1200 },
      { id: 'express', label: 'Express', note: 'Next working day', price: 2400 },
    ],
    countries: [
      ['US', 'United States'], ['GB', 'United Kingdom'], ['IN', 'India'], ['CA', 'Canada'],
      ['AU', 'Australia'], ['DE', 'Germany'], ['FR', 'France'], ['AE', 'United Arab Emirates'],
    ],
  },

  /** Turn a whole surface off. Routes stay reachable but nothing links to them. */
  features: {
    wishlist: true,
    reviews: true,
    search: true,
    accounts: true,
    discountCodes: true,
    newsletter: true,
  },

  /**
   * Navigation.
   *
   * `primary: []` means "derive the menu from the category tree", which is what
   * most stores want — one place to edit. Provide entries to override, and use
   * `categorySlug` to pull a category's children in as a submenu without
   * restating them.
   */
  navigation: {
    primary: [
      { label: 'New', to: '/shop?sort=newest' },
      { label: 'Shirts', categorySlug: 'shirts' },
      { label: 'Knitwear', categorySlug: 'knitwear' },
      { label: 'Outerwear', categorySlug: 'outerwear' },
      { label: 'Trousers', categorySlug: 'trousers' },
      { label: 'Accessories', categorySlug: 'accessories' },
    ],
    footer: [
      {
        title: 'Shop',
        links: [
          { label: 'All products', to: '/shop' },
          { label: 'New season', to: '/collections/new-season' },
          { label: 'The linen edit', to: '/collections/the-linen-edit' },
          { label: 'Built to last', to: '/collections/built-to-last' },
          { label: 'Saved items', to: '/wishlist' },
        ],
      },
      {
        title: 'Account',
        links: [
          { label: 'Your account', to: '/account' },
          { label: 'Orders', to: '/account/orders' },
          { label: 'Addresses', to: '/account/addresses' },
          { label: 'Your bag', to: '/cart' },
        ],
      },
      {
        title: 'Help',
        links: [
          { label: 'Size guide', to: '/pages/size-guide' },
          { label: 'Shipping & returns', to: '/pages/shipping' },
          { label: 'Fabric & care', to: '/pages/care' },
          { label: 'Contact', to: '/pages/contact' },
        ],
      },
    ],
    /** The thin strip above the header. `null` removes it. */
    announcement: {
      messages: ['Free shipping over $150', 'Demo store — no real orders are placed'],
    },
  },

  /**
   * The home page, as an ordered list of typed sections.
   *
   * Add, remove or reorder freely. `src/components/home/sections.jsx` maps each
   * `type` to a component and skips anything it does not recognise, so a newer
   * admin panel emitting a section this build has never seen degrades to a gap
   * rather than a crash.
   */
  home: [
    {
      type: 'hero',
      eyebrow: 'Autumn 2026',
      title: 'Made to be kept.',
      body: 'Twenty-four pieces. Real fabric weights, honest construction, and nothing designed to be replaced next season.',
      image: { url: '/images/editorial/hero.jpg', alt: 'Autumn layers in neutral tones' },
      focal: '50% 35%',
      actions: [
        { label: 'Shop everything', to: '/shop', variant: 'accent' },
        { label: 'New season', to: '/collections/new-season', variant: 'outline' },
      ],
    },
    {
      type: 'category-strip',
      title: 'Shop by category',
      ctaLabel: 'All products',
      ctaTo: '/shop',
      source: { parent: null, limit: 6 },
    },
    {
      type: 'product-rail',
      eyebrow: 'Just landed',
      title: 'New this season',
      ctaLabel: 'See all',
      ctaTo: '/shop?sort=newest',
      source: { sort: 'newest', limit: 4 },
    },
    {
      type: 'editorial',
      eyebrow: 'How we make things',
      title: 'A garment is mostly decisions you cannot see.',
      body: [
        'Fabric weight, seam construction, whether the collar is fused or unlined, whether the knit panels are cut from a sheet or knitted to shape. None of it photographs well and all of it decides whether a piece is still worth wearing in three years.',
        'So every product page here lists the things a maker would actually care about — gsm, mill, construction, and what will happen to it in the wash.',
      ],
      image: { url: '/images/editorial/craft.jpg', alt: 'A tailor at work' },
      action: { label: 'See what that looks like', to: '/collections/built-to-last' },
    },
    { type: 'collection-grid', title: 'Collections', source: { limit: 3 } },
    {
      type: 'product-rail',
      title: 'People keep buying these',
      ctaLabel: 'All products',
      ctaTo: '/shop',
      source: { sort: 'featured', limit: 8 },
    },
    { type: 'promises' },
  ],

  /**
   * "You might also like".
   *
   * strategy:
   *   automatic     — scored on shared category and tags, computed by the API
   *   same-category — the cheapest useful fallback
   *   best-sellers  — ignores the current product entirely
   *   manual        — uses each product's `relatedSlugs`
   *   api           — GET /products/:slug/related, merchant decides how
   *   off           — hides the section
   */
  recommendations: {
    strategy: 'automatic',
    limit: 4,
    title: 'You might also like',
    /** Also shown in the cart drawer when the bag is not empty. */
    inCart: { enabled: true, title: 'Goes with this', limit: 3, strategy: 'same-category' },
  },

  /**
   * Checkout.
   *
   * mode:
   *   demo     — the bundled flow. Places a fake order. Never take money here.
   *   redirect — POST the cart to `createUrl`; expect { url } back and send the
   *              browser there. This is the Stripe Checkout Session / Razorpay
   *              payment-link shape and the safest default for a real store,
   *              because no card data ever reaches this app.
   *   api      — POST to `createUrl` and expect an Order back. For merchants
   *              who take payment elsewhere (invoice, COD, wholesale terms).
   */
  checkout: {
    mode: 'demo',
    createUrl: '/carts/:cartId/checkout',
    successUrl: '/order/:orderId',
    cancelUrl: '/cart',
    collectPhone: true,
    requireAccount: false,
    termsUrl: '/pages/shipping',
  },

  /**
   * Trust signals. Placement beats presence — these render beside the buy
   * button, not in the footer, because that is where the doubt arrives.
   */
  trust: {
    payments: ['Visa', 'Mastercard', 'Amex', 'PayPal', 'Apple Pay', 'UPI'],
    repairs: true,
    showCertifications: true,
    showFitFeedback: true,
    showSocialProof: true,
    /** Below these counts nothing is shown, rather than advertising low demand. */
    socialProofThresholds: { bought: 25, saved: 20 },
  },

  promises: [
    { icon: 'truck', title: 'Free shipping over $150', body: 'Two to four working days, tracked.' },
    { icon: 'refresh', title: '30-day returns', body: 'Unworn, tags on, return label included.' },
    { icon: 'shield', title: 'Repairs, not replacements', body: 'We will mend anything we made, for as long as we exist.' },
  ],
}

export default storefront
