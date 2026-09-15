/**
 * S-20 — A merchant adds the newer home sections in Odoo and shoppers see them on the storefront, on a computer and
 * on a phone: image banner, image tiles, features, testimonials, logo bar, questions, newsletter sign-up, featured
 * product and a countdown. An offer that has ended is not shown, and no section makes the phone page scroll sideways.
 */
import { test, expect } from '../support/fixtures.js'
import { settings } from '../support/env.js'

// A 1×1 PNG: these sections only need a photo to exist.
const PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='

const odooDate = (date) => date.toISOString().replace('T', ' ').slice(0, 19)
const item = (values) => [0, 0, values]

test('S-20 the newer home sections show on the storefront', { tag: '@S-20' }, async ({ page, odoo }) => {
  test.setTimeout(180_000)
  const run = Date.now().toString(36)
  const title = (name) => `${name} ${run}`
  const store = await odoo.one('loom.store', [['code', '=', 'e2e']], ['id'])
  const product = await odoo.one('product.template', [['loom_slug', '=', 'e2e-ceramic-mug']], ['id', 'loom_slug'])
  expect(product, 'the seeded mug is on sale').toBeTruthy()

  const values = [
    { section_type: 'image-banner', title: title('Banner'), body: 'Made in small batches.', image: PIXEL, align: 'start' },
    { section_type: 'image-tiles', title: title('Tiles'), item_ids: [
      item({ title: 'Kitchen', label: 'Shop kitchen', url: '/shop', image: PIXEL }),
      item({ title: 'Office', url: '/shop', image: PIXEL }),
    ] },
    { section_type: 'features', title: title('Features'), item_ids: [
      item({ title: 'Free repairs', icon: 'shield', body: 'For life.' }),
      item({ title: 'Named mills', icon: 'sparkle', body: 'Every fabric.' }),
      item({ title: 'Easy returns', icon: 'refresh', body: 'Within 30 days.' }),
    ] },
    { section_type: 'testimonials', title: title('Quotes'), items_source: 'manual', item_ids: [
      item({ body: 'Still looks new after three years.', author: 'Dana R.', detail: 'Chicago', rating: 5 }),
      item({ body: 'Sized exactly as the note said.', author: 'Priya S.', rating: 4 }),
      item({ body: 'Repaired for free, no questions.', author: 'Marta G.', rating: 5 }),
    ] },
    { section_type: 'logo-bar', title: title('Logos'), items_source: 'manual', item_ids: [
      item({ title: 'Kojima Works' }),
      item({ title: 'Teviot Mill', url: '/shop' }),
    ] },
    { section_type: 'faq', title: title('Questions'), items_source: 'manual', item_ids: [
      item({ title: 'When will my order arrive?', body: 'Within five working days.' }),
      item({ title: 'Can I return it?', body: 'Yes, within 30 days of delivery.' }),
    ] },
    { section_type: 'newsletter', title: title('Letters'), body: 'Once a month.' },
    { section_type: 'featured-product', title: title('Featured'), product_id: product.id, cta_label: 'Get the mug' },
    { section_type: 'countdown', title: title('Sale'), body: 'Ends soon.', ends_at: odooDate(new Date(Date.now() + 2 * 86_400_000)) },
    { section_type: 'countdown', title: title('Ended'), ends_at: odooDate(new Date(Date.now() - 3_600_000)) },
  ].map((section, index) => ({ store_id: store.id, sequence: 900 + index, ...section }))
  const ids = await odoo.call('loom.store.section', 'create', [values])

  try {
    // What the storefront is given: the ended offer is already gone.
    const response = await page.request.get(`${settings.api}/storefront`, { headers: { Origin: settings.storefrontUrl } })
    const titles = (await response.json()).home.map((section) => section.title)
    expect(titles).toContain(title('Sale'))
    expect(titles, 'an offer that ended is left out').not.toContain(title('Ended'))

    const errors = []
    page.on('pageerror', (error) => errors.push(String(error)))
    const section = (type, name) => page.locator(`[data-home-section="${type}"]`, { hasText: title(name) })

    await page.goto('/')
    await expect(section('image-banner', 'Banner')).toContainText('Made in small batches.')
    await expect(section('image-banner', 'Banner').locator('img')).toHaveCount(1)
    await expect(section('image-tiles', 'Tiles').getByRole('link')).toHaveCount(2)
    await expect(section('image-tiles', 'Tiles').getByRole('link', { name: /Kitchen/ })).toHaveAttribute('href', '/shop')
    for (const text of ['Free repairs', 'Named mills', 'Easy returns']) await expect(section('features', 'Features')).toContainText(text)
    await expect(section('testimonials', 'Quotes')).toContainText('Still looks new after three years.')
    await expect(section('testimonials', 'Quotes')).toContainText('Dana R.')
    await expect(section('logo-bar', 'Logos')).toContainText('Kojima Works')
    await expect(section('logo-bar', 'Logos').getByRole('link')).toHaveCount(1)

    const faq = section('faq', 'Questions')
    await expect(faq.locator('details')).toHaveCount(2)
    await faq.getByText('Can I return it?').click()
    await expect(faq.getByText('Yes, within 30 days of delivery.')).toBeVisible()

    const newsletter = section('newsletter', 'Letters')
    await expect(newsletter.locator('input[type="email"]')).toBeVisible()
    await expect(newsletter.getByRole('button', { name: 'Join' })).toBeVisible()

    await expect(section('featured-product', 'Featured').getByRole('link', { name: 'Get the mug' })).toHaveAttribute('href', `/product/${product.loom_slug}`)

    const timer = section('countdown', 'Sale').getByRole('timer')
    await expect(timer).toContainText(/days/i)
    const before = await timer.textContent()
    await expect.poll(() => timer.textContent(), { message: 'the countdown ticks', timeout: 5_000 }).not.toBe(before)
    await expect(page.getByText(title('Ended'))).toHaveCount(0)

    // A phone: every section still there, and none makes the page scroll sideways.
    await page.setViewportSize({ width: 390, height: 844 })
    await page.reload()
    await expect(section('countdown', 'Sale').getByRole('timer')).toBeVisible()
    for (const [type, name] of [['image-tiles', 'Tiles'], ['testimonials', 'Quotes'], ['logo-bar', 'Logos'], ['faq', 'Questions']]) {
      await section(type, name).scrollIntoViewIfNeeded()
      await expect(section(type, name)).toBeVisible()
    }
    const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }))
    expect(width.scroll, 'the phone page does not scroll sideways').toBeLessThanOrEqual(width.client)

    expect(errors, 'no JavaScript error on the storefront').toEqual([])
  } finally {
    await odoo.call('loom.store.section', 'unlink', [ids])
  }
})
