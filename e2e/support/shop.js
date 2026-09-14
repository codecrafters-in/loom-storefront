/**
 * A shopper, in the browser.
 *
 * Selectors are roles, labels and visible text — what a person can see — so a
 * phase that restyles a component does not break the scenario, and one that
 * changes *what the shopper can do* does. Where a gap fix is expected to change
 * the widget (a generic variant picker may use radios or a select instead of
 * buttons), the helper accepts any of them.
 */
import { expect } from '@playwright/test'
import { US_ADDRESS } from './store-api.js'

export class Shop {
  /** `prefix`: a language address such as `/en`, put before every page this helper opens. */
  constructor(page, { prefix = '' } = {}) {
    this.prefix = prefix
    this.page = page
  }

  /* ── header and bag ───────────────────────────────────────────────────── */

  bagButton(count) {
    return count === undefined
      ? this.page.getByRole('button', { name: /^Your bag \(\d+\)$/ })
      : this.page.getByRole('button', { name: `Your bag (${count})`, exact: true })
  }

  async expectBagCount(count, options) {
    await expect(this.bagButton(count)).toBeVisible(options)
  }

  bagDrawer() {
    return this.page.getByRole('dialog', { name: 'Your bag' })
  }

  async closeBag() {
    await this.page.getByRole('button', { name: 'Close bag' }).click()
    await expect(this.bagDrawer()).not.toBeInViewport()
  }

  async checkoutFromBag() {
    await expect(this.bagDrawer()).toBeInViewport()
    await this.bagDrawer().getByRole('link', { name: 'Checkout' }).click()
    await expect(this.page.getByRole('heading', { name: 'Checkout', level: 1 })).toBeVisible()
  }

  async search(query) {
    const box = this.page.locator('#site-search')
    await box.fill(query)
    await box.press('Enter')
    await expect(this.page).toHaveURL(/\/search\?q=/)
  }

  /* ── product page ─────────────────────────────────────────────────────── */

  async openProduct(slug) {
    await this.page.goto(`${this.prefix}/product/${slug}`)
    await expect(this.page.getByRole('heading', { level: 1 })).toBeVisible()
  }

  /**
   * Pick `value` for the option called `option` ("Colour", "Size", "Storage"…):
   * a button or radio named after the value, or failing that a select labelled
   * with the option.
   */
  async choose(option, value) {
    const page = this.page
    const control = page
      .getByRole('radio', { name: value, exact: true })
      .or(page.getByRole('button', { name: value, exact: true }))
      .first()
    const found = await control.waitFor({ state: 'visible', timeout: 5_000 }).then(() => true, () => false)
    if (found) {
      await control.click()
      return
    }
    await page.getByLabel(new RegExp(`^${option}`, 'i')).selectOption({ label: value })
  }

  addToBagButton() {
    return this.page.getByRole('button', { name: /^add to (bag|cart)$/i }).first()
  }

  async addToBag() {
    const button = this.addToBagButton()
    await expect(button).toBeEnabled()
    await button.click()
    await expect(this.bagDrawer()).toBeInViewport()
  }

  /** The page content, without the header and the (closed but mounted) bag drawer. */
  main() {
    return this.page.locator('#main')
  }

  /** The amount beside `label` in the bag or checkout summary ("Subtotal", "Shipping", "Tax"…). */
  summaryValue(label) {
    return this.main()
      .locator('dl > div')
      .filter({ has: this.page.locator('dt', { hasText: new RegExp(`^${label}`) }) })
      .locator('dd')
      .first()
  }

  /* ── checkout ─────────────────────────────────────────────────────────── */

  async fillCheckout({ email, address = US_ADDRESS } = {}) {
    const page = this.page
    await expect(page.getByRole('heading', { name: 'Checkout', level: 1 })).toBeVisible()
    if (email !== undefined) await page.locator('#email').fill(email)
    await page.locator('#country').selectOption(address.country)
    await page.locator('#name').fill(address.name)
    await page.locator('#line1').fill(address.line1)
    if (address.line2) await page.locator('#line2').fill(address.line2)
    await page.locator('#city').fill(address.city)
    if (address.region) {
      // A dropdown once the country's states have loaded; a text box for a country without states.
      const hasStates = await page
        .waitForFunction(() => document.querySelector('#region')?.tagName === 'SELECT', null, { timeout: 5_000 })
        .then(() => true, () => false)
      if (hasStates) await page.locator('#region').selectOption(address.region)
      else await page.locator('#region').fill(address.region)
    }
    if (address.postalCode) await page.locator('#postalCode').fill(address.postalCode)
    if (address.phone) await page.locator('#phone').fill(address.phone)
  }

  paymentGroup() {
    return this.page.getByRole('group', { name: 'Payment' })
  }

  async continueToPayment() {
    await this.page.getByRole('button', { name: 'Continue to payment' }).click()
    await expect(this.paymentGroup().getByRole('radio').first()).toBeVisible({ timeout: 30_000 })
  }

  async choosePayment(name) {
    await this.paymentGroup().getByRole('radio', { name }).check()
  }

  payButton() {
    // A method paid later (cash on delivery, bank transfer) places the order instead of paying.
    return this.page.getByRole('button', { name: /^(Pay|Place order) · / })
  }

  async pay() {
    await expect(this.payButton()).toBeEnabled()
    await this.payButton().click()
  }

  async payByDemoCard(outcome = 'done') {
    await this.choosePayment(/^Demo/)
    await this.page.locator('#demo-card-number').fill('4242 4242 4242 4242')
    await this.page.locator('#demo-outcome').selectOption(outcome)
    await this.pay()
  }

  /** On the confirmation page: `{ number, orderId }`. */
  async expectOrderConfirmed() {
    const page = this.page
    await expect(page).toHaveURL(/\/order\/[^/?#]+$/, { timeout: 60_000 })
    const number = page.getByRole('heading', { level: 1 }).locator('xpath=following-sibling::p[1]//strong')
    await expect(number).toHaveText(/\S+/)
    return {
      number: (await number.textContent()).trim(),
      orderId: decodeURIComponent(new URL(page.url()).pathname.split('/').pop()),
    }
  }

  /* ── accounts ─────────────────────────────────────────────────────────── */

  async login(email, password, { via = 'url' } = {}) {
    const page = this.page
    if (via === 'header') await page.getByRole('link', { name: 'Sign in' }).click()
    else await page.goto(`${this.prefix}/login`)
    await expect(page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible()
    await page.locator('#email').fill(email)
    await page.locator('#password').fill(password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page).toHaveURL(/\/account/)
  }

  async register({ firstName = 'Robin', lastName = 'Tester', email, password }) {
    const page = this.page
    await page.goto(`${this.prefix}/login`)
    await page.getByRole('button', { name: 'Create one' }).click()
    await page.locator('#firstName').fill(firstName)
    await page.locator('#lastName').fill(lastName)
    await page.locator('#email').fill(email)
    await page.locator('#password').fill(password)
    await page.getByRole('button', { name: 'Create account' }).click()
  }
}
