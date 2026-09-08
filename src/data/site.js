import { config } from '../lib/config.js'

export const site = {
  name: config.store.name,
  tagline: 'Considered clothing, made to be kept.',
  nav: [
    { label: 'New', to: '/shop?sort=newest' },
    { label: 'Shirts', to: '/shop/shirts' },
    { label: 'Knitwear', to: '/shop/knitwear' },
    { label: 'Outerwear', to: '/shop/outerwear' },
    { label: 'Trousers', to: '/shop/trousers' },
    { label: 'Accessories', to: '/shop/accessories' },
  ],
  promises: [
    { icon: 'truck', title: 'Free shipping over $150', body: 'Two to four working days, tracked.' },
    { icon: 'refresh', title: '30-day returns', body: 'Unworn, tags on, return label included.' },
    { icon: 'shield', title: 'Repairs, not replacements', body: 'We will mend anything we made, for as long as we exist.' },
  ],
  footer: {
    shop: [
      { label: 'All products', to: '/shop' },
      { label: 'New season', to: '/collections/new-season' },
      { label: 'The linen edit', to: '/collections/the-linen-edit' },
      { label: 'Built to last', to: '/collections/built-to-last' },
      { label: 'Saved items', to: '/wishlist' },
    ],
    account: [
      { label: 'Your account', to: '/account' },
      { label: 'Orders', to: '/account/orders' },
      { label: 'Addresses', to: '/account/addresses' },
      { label: 'Your bag', to: '/cart' },
    ],
    about: [
      { label: 'Size guide', to: '/pages/size-guide' },
      { label: 'Shipping & returns', to: '/pages/shipping' },
      { label: 'Fabric & care', to: '/pages/care' },
      { label: 'Contact', to: '/pages/contact' },
    ],
  },
  repoUrl: config.repoUrl,
}

export default site
