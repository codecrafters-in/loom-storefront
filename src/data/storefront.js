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
    /** The rail of what this visitor was just looking at. Local to their
     *  browser — nothing is stored server-side and nobody is profiled. */
    recentlyViewed: true,
    /**
     * A link to `/docs` in the footer's bottom bar.
     *
     * `'auto'` — shown while the shop is running on demo data, hidden the
     * moment it is pointed at a real API. A demo exists to be read; a shop
     * selling shirts should not offer its customers an API reference.
     * `true` / `false` override that either way. The pages themselves stay
     * public regardless, and the back office always links to them.
     */
    docsLink: 'auto',
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
          // Guest checkout is the default, so most orders have no account
          // behind them. Without this the only way back to one is the browser
          // that placed it.
          { label: 'Find an order', to: '/orders/lookup' },
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
  /**
   * Checkout, in four modes. Which one runs is configuration, not code.
   *
   *   demo      Places a fake order through the bundled adapter. Previews only.
   *   redirect  POSTs the cart to `createUrl`, expects { url }, sends the
   *             browser to the provider's hosted page. No card field ever
   *             renders in this app, which keeps the whole frontend out of
   *             PCI DSS scope. The right default for a real store.
   *   razorpay  Opens Razorpay's own modal over the page. The order is still
   *             created server-side — the browser only ever sees `publicKey`.
   *   api       POSTs and expects an Order back. For merchants settling
   *             elsewhere: invoice, cash on delivery, wholesale terms.
   *
   * `publicKey` is safe here and only here. Razorpay's `key_id` and Stripe's
   * publishable key are designed to be readable by anyone; their secret
   * counterparts are not, and there is no version of this file that can hold
   * one — see `POST /admin/credentials`.
   */
  checkout: {
    mode: 'demo',
    provider: null,
    publicKey: '',
    createUrl: '/carts/:cartId/checkout',
    verifyUrl: '/payments/verify',
    successUrl: '/order/:orderId',
    cancelUrl: '/cart',
    collectPhone: true,
    requireAccount: false,
    termsUrl: '/pages/shipping',
    /** Put the stock back when an order is refunded or cancelled. */
    restockOnRefund: true,
  },

  /**
   * Search engines and crawlers.
   *
   * These are policy, not engineering. Whether an AI crawler may read your
   * catalogue is a decision about your business — some stores want the traffic
   * an assistant sends, some do not want their photography and copy in a
   * training set, and a theme has no business deciding either way. So the
   * defaults are the neutral ones and every line is editable in Settings.
   *
   * `siteUrl` is the only one that must be set. Absolute URLs are required in a
   * sitemap, in a canonical tag and in an Open Graph image — a relative one is
   * ignored by every scraper that reads it.
   */
  seo: {
    siteUrl: '',
    /** Off takes the whole shop out of every index. For a staging deployment. */
    indexable: true,
    /** Paths no crawler should walk. Per-visitor pages, not secrets. */
    disallow: ['/checkout', '/account', '/cart', '/orders/lookup', '/admin'],
    /**
     * `allow` — the default, and what a shop selling things usually wants.
     * `block` — no AI crawler, stated per bot so it is checkable.
     * `custom` — decide one at a time in `crawlers` below.
     */
    aiCrawlers: 'allow',
    crawlers: {
      GPTBot: true,
      'ChatGPT-User': true,
      ClaudeBot: true,
      'anthropic-ai': true,
      PerplexityBot: true,
      'Google-Extended': true,
      CCBot: false,
      Bytespider: false,
    },
    /** Put every product photograph in the sitemap, for Google Images. */
    sitemapImages: true,
  },

  /**
   * Analytics.
   *
   * Off by default, and no vendor script ships with the theme. Events are
   * pushed to `window.dataLayer` in GA4's ecommerce vocabulary, which a tag
   * manager reads natively and anything else can be pointed at — a store
   * already has its own tooling, and a theme that bundles a competing one is
   * something to rip out rather than something to configure.
   */
  analytics: {
    enabled: false,
    /** Honour the Do Not Track header. One line, and it is what it is for. */
    respectDoNotTrack: true,
    /** Log every event to the console without sending it. For wiring things up. */
    debug: false,
  },

  /**
   * Transactional email.
   *
   * A store that takes money and sends nothing is broken, so this is not an
   * optional extra. It cannot run in the browser either — SMTP needs a socket
   * and an app password needs somewhere to hide — so the storefront's whole job
   * is to say *when* to send and the server's is to send it.
   *
   * `smtp.password` is deliberately absent. Gmail app passwords go to
   * `POST /admin/credentials` and never come back out.
   */
  notifications: {
    enabled: true,
    from: 'orders@loom.example',
    replyTo: '',
    /** smtp — the server sends it. endpoint — POST the payload somewhere else. */
    transport: 'smtp',
    smtp: { host: 'smtp.gmail.com', port: 465, secure: true, user: '' },
    endpoint: '',
    events: {
      orderPlaced: true,
      paymentCaptured: true,
      shipped: true,
      refunded: true,
      cancelled: true,
    },
  },

  /**
   * Trust signals. Placement beats presence — these render beside the buy
   * button, not in the footer, because that is where the doubt arrives.
   */
  trust: {
    payments: ['Visa', 'Mastercard', 'Amex', 'PayPal', 'Apple Pay', 'UPI'],

    /**
     * The services block under the buy button, when a product has none of its
     * own. One policy, written once — three products promising three different
     * return windows is how a support inbox fills up.
     *
     * `note` is the disclosure behind the (i). Keep the label short enough to
     * scan and put the caveats in the note, not in brackets after the label.
     */
    assurances: [
      {
        icon: 'refresh',
        label: '30-day returns, no reason needed',
        note: 'Unworn, tags attached. A prepaid label is in every parcel — drop it at any collection point and the refund goes back to your original payment method within five working days of it reaching us.',
      },
      {
        icon: 'ruler',
        label: 'Free size exchange, once per order',
        note: 'If the fit is wrong we send the replacement before the first piece is back with us, so you are not waiting twice. Available while the size you want is in stock.',
      },
      {
        icon: 'shield',
        label: 'Two-year seam and hardware guarantee',
        note: 'A seam that fails, a zip that stops running, a button band that pulls — we repair it or replace the piece. Fair wear and accidental damage are repaired at cost, not refused.',
      },
      {
        icon: 'package',
        label: 'Pay on delivery available',
        note: 'Offered at checkout on orders under $400 shipping within the country. Card, UPI and wallet payments are taken on our own checkout; we never see or store the card number.',
      },
    ],
    repairs: true,
    showCertifications: true,
    showFitFeedback: true,
    showSocialProof: true,
    /** Below these counts nothing is shown, rather than advertising low demand. */
    socialProofThresholds: { bought: 25, saved: 20 },
  },

  /**
   * The "Delivery & returns" panel on a product page.
   *
   * It was three hardcoded paragraphs in a component, which meant a store could
   * change its returns window in settings and still promise something else in
   * prose four lines further down. Anything a shopper can read is configuration.
   *
   * The braces are filled from the commerce settings on render, so the numbers
   * cannot drift from the ones the cart and the checkout actually use. An
   * unknown token is left alone rather than blanked — a visible {typo} is
   * findable, a silent gap is not.
   *
   *   {shipping}    standard shipping, formatted
   *   {freeOver}    the free-shipping threshold, formatted
   *   {returnsDays} the returns window in days
   */
  deliveryPolicy: [
    'Standard shipping is {shipping}, free over {freeOver}. Orders placed before 2pm ship the same working day.',
    'Returns are free within {returnsDays} days, unworn and with tags attached. A prepaid label is in every parcel.',
    'We repair anything we made. Send it back and we will quote before doing the work.',
  ],

  promises: [
    { icon: 'truck', title: 'Free shipping over $150', body: 'Two to four working days, tracked.' },
    { icon: 'refresh', title: '30-day returns', body: 'Unworn, tags on, return label included.' },
    { icon: 'shield', title: 'Repairs, not replacements', body: 'We will mend anything we made, for as long as we exist.' },
  ],
}

export default storefront
