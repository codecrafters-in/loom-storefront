/**
 * S-8 — A store in another country: its own currency (Kuwaiti dinar, three
 * decimals), its own language (Arabic), and its own address rules (no postcode).
 *
 * Runs against store `e2e-kw` (second website, dev server on port 5175).
 * Checklist: Q1 Q2 Q3 F5. Gap report §6: 🟡 — 3-decimal currencies, USD filter,
 * postcode required, English-only UI. Tax by fiscal position (F5) is not
 * asserted here: the throwaway database has no Kuwaiti fiscal position.
 */
import { test, expect } from '../support/fixtures.js'
import { settings, uniqueEmail } from '../support/env.js'
import { Shop } from '../support/shop.js'

const KUWAIT = {
  name: 'Fatima Al-Sabah',
  line1: 'Block 3, Street 12, House 5',
  city: 'Kuwait City',
  country: 'KW',
  phone: '+965 5555 0134',
}

test.use({ baseURL: settings.storefront2Url })

test.fail(
  'S-8 store in another country: dinar prices with three decimals, Arabic content, checkout without a postcode',
  {
    tag: '@S-8',
    annotation: [
      { type: 'gap', description: '#18 3-decimal currencies (KWD) display 10x too large' },
      { type: 'gap', description: '#19 price filter always shows USD' },
      { type: 'gap', description: '#20 postcode required in checkout for every country' },
      { type: 'gap', description: 'P1 §4: no UI translations / language switcher (A5, Q3)' },
      { type: 'new-bug', description: 'store API resolves the language against the host website, so store e2e-kw never serves its Arabic default (see report)' },
    ],
  },
  async ({ browser, page, shop, store2 }) => {
    const product = await store2.product('e2e-merino-crew')
    expect(product.price.currency).toBe('KWD')
    const dinars = (product.price.amount / 1000).toFixed(3) // e.g. 24.560

    // A shopper whose browser is in Arabic, on a store whose default language is Arabic.
    const arabic = await browser.newContext({ baseURL: settings.storefront2Url, locale: 'ar-KW' })
    try {
      const arabicShop = new Shop(await arabic.newPage())
      await arabicShop.openProduct('e2e-merino-crew')
      await expect.soft(arabicShop.page.getByRole('heading', { level: 1 })).toHaveText('كنزة ميرينو E2E')
      await expect.soft(arabicShop.page.locator('html')).toHaveAttribute('lang', /^ar/)
    } finally {
      await arabic.close()
    }

    // Prices in dinars, with fils.
    await shop.openProduct('e2e-merino-crew')
    await expect.soft(page.getByText(new RegExp(dinars.replace('.', '\\.'))).first()).toBeVisible()

    // The price filter in the store's currency.
    await page.goto('/shop')
    const slider = page.getByRole('slider', { name: 'Maximum price' }).first()
    await expect(slider).toBeAttached()
    const priceFilter = page.locator('div', { has: slider }).last()
    await expect.soft(priceFilter).toContainText('KWD')
    await expect.soft(priceFilter).not.toContainText('$')

    // Checkout with a Kuwaiti address, which has no postcode.
    await shop.openProduct('e2e-merino-crew')
    await shop.choose('Colour', 'Red')
    await shop.choose('Size', 'M')
    await shop.addToBag()
    await shop.checkoutFromBag()
    await shop.fillCheckout({ email: uniqueEmail('s8-kuwait'), address: KUWAIT })
    await shop.continueToPayment()
    await expect(shop.payButton()).toContainText(/KWD|د\.ك/)
  },
)
