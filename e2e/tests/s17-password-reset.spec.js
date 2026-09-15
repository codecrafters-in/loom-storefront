/**
 * S-17 — A customer forgot their password. The reset email opens the storefront,
 * they choose a new password there and are signed in; the old one stops working.
 *
 * Checklist: #11. Gap report §4 P0 (no password reset): ✅ since Phase 9.
 */
import { test, expect } from '../support/fixtures.js'
import { uniqueEmail } from '../support/env.js'
import { smtpCatcher } from '../support/smtp.js'

const NEW_PASSWORD = 'e2e-new-pass-17'

test('S-17 password reset from the email, finished on the storefront', { tag: '@S-17' }, async ({ page, store, odoo }) => {
  const { email, password } = await store.register({ email: uniqueEmail('s17-reset') })
  const mail = smtpCatcher()
  await mail.listen()
  const stopMail = await odoo.useMailServer(mail.port)
  try {
    await page.goto('/forgot-password')
    await page.locator('#reset-email').fill(email)
    await page.getByRole('button', { name: 'Send the link' }).click()
    await expect(page.getByText(/a link to choose a new password is on its way/)).toBeVisible()

    // The link in the email goes to the storefront's own page, not Odoo's /web/reset_password.
    let href = null
    await expect
      .poll(() => {
        const message = mail.messages.find((m) => m.includes(email) && /reset-password\?token=/.test(m))
        href = message?.match(/https?:\/\/[^\s"'<>]*\/reset-password\?token=[^\s"'<>&]+/)?.[0] || null
        return Boolean(href)
      }, { timeout: 15_000 })
      .toBe(true)
    const link = new URL(href)
    expect(link.pathname).toBe('/reset-password')
    expect(link.port).not.toBe(new URL(process.env.LOOM_E2E_ODOO_URL || 'http://localhost:8074').port)

    await page.goto(link.pathname + link.search)
    await page.getByLabel('New password').fill(NEW_PASSWORD)
    await page.getByLabel('Repeat the password').fill(NEW_PASSWORD)
    await page.getByRole('button', { name: 'Save and sign in' }).click()
    await expect(page).toHaveURL(/\/account/)

    await expect(store.login(email, password)).rejects.toThrow()
    await store.login(email, NEW_PASSWORD)
  } finally {
    await stopMail()
    await mail.close()
  }
})
