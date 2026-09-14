/**
 * S-14 — A shopper fills a bag as a guest, then signs in to an account that
 * already had something in its bag. The bag now holds both.
 *
 * Checklist: E2. Gap report §6: ✅ — and since Phase 5 the header shows the
 * merged bag straight after signing in, without a reload.
 */
import { test, expect } from '../support/fixtures.js'
import { uniqueEmail } from '../support/env.js'

/** The account already has a Merino Crew in its bag; the guest adds an Oxford Shirt and signs in. */
async function guestBagThenSignIn({ page, shop, store }) {
  const { email, password, token } = await store.register({ email: uniqueEmail('s14-merge') })
  const accountCart = await store.emptyCustomerBag(token)
  const merino = await store.variant('e2e-merino-crew', { Color: 'Red', Size: 'L' })
  await store.ok('POST', `/carts/${accountCart}/lines`, { body: { variant_id: merino.id, quantity: 1 }, token })

  await page.goto('/')
  await shop.openProduct('e2e-oxford-shirt')
  await shop.choose('Colour', 'Blue')
  await shop.choose('Size', 'M')
  await shop.addToBag()
  await shop.closeBag()
  await shop.expectBagCount(1)

  await shop.login(email, password, { via: 'header' })
  return token
}

test('S-14 guest bag merges into the account bag on sign-in', { tag: '@S-14' }, async ({ page, shop, store }) => {
  const token = await guestBagThenSignIn({ page, shop, store })

  await page.reload()
  await shop.expectBagCount(2)
  await shop.bagButton().click()
  await expect(shop.bagDrawer()).toContainText('E2E Oxford Shirt')
  await expect(shop.bagDrawer()).toContainText('E2E Merino Crew')

  const serverCart = await store.ok('POST', '/carts', { body: {}, token })
  expect(serverCart.lines.map((l) => l.title).sort()).toEqual(['E2E Merino Crew', 'E2E Oxford Shirt'])
})

test(
  'S-14 the header bag shows the merged bag straight after sign-in, without a reload',
  { tag: '@S-14' },
  async ({ page, shop, store }) => {
    await guestBagThenSignIn({ page, shop, store })
    await shop.expectBagCount(2, { timeout: 10_000 })
  },
)
