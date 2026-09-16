/**
 * S-21 — Specifications: the category sets values and a default, the product starts with the default and adds more.
 *
 * A merchant adds a specification to a product category the way Odoo's category table saves it (label, type, values,
 * default), then creates a product of that type in the storefront admin: the specification is already filled with
 * the default, a value other products use is one click away, and the saved product holds both values in Odoo and
 * shows them on its page.
 */
import { test, expect } from '../support/fixtures.js'
import { settings } from '../support/env.js'

async function signInWithOdoo(page) {
  await page.goto('/admin/login')
  await page.getByRole('button', { name: 'Sign in with Odoo' }).click()
  await page.waitForURL((url) => url.port === new URL(settings.odooUrl).port)
  await page.locator('input[name="login"]').fill(settings.admin.login)
  await page.locator('input[name="password"]').fill(settings.admin.password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.getByRole('button', { name: 'Continue to the storefront admin' }).click()
  await expect(page).toHaveURL(/\/admin\/?$/)
}

// Letters only: a slug may not end in a number.
const word = () => Date.now().toString(36).replace(/[0-9]/g, (d) => 'abcdefghij'[d])

test('S-21 defaults come from the category, more values are added on the product', { tag: '@S-21' }, async ({ page, odoo }) => {
  test.setTimeout(180_000)
  const phone = await odoo.one('product.template', [['name', '=', 'E2E Nova Phone']], ['categ_id'])
  const categId = phone.categ_id[0]
  const suffix = word()
  const label = `Finish ${suffix}`
  const rowId = await odoo.call('loom.property.meta', 'create', [{
    categ_id: categId, property_label: label, property_type: 'tags',
    property_values: 'Matte, Gloss', property_default: 'Matte', highlight: true,
  }])
  const [row] = await odoo.call('loom.property.meta', 'read', [[rowId], ['key', 'property_name', 'property_values']])
  let productId = null
  try {
    expect(row.property_values).toBe('Matte, Gloss')

    await signInWithOdoo(page)
    await page.goto('/admin/products/new')
    await page.locator('#f-product-type').selectOption(String(categId))
    await page.locator('#f-title').fill(`E2E Spec Phone ${suffix}`)
    await page.locator('#f-price').first().fill('199')

    await page.getByRole('button', { name: 'Highlights & specs' }).or(page.getByRole('tab', { name: 'Highlights & specs' })).first().click()
    await page.getByRole('button', { name: 'Specifications', exact: true }).click()
    const value = page.locator(`input[list="spec-vals-${row.key}"]`)
    await expect(value, 'a new product starts with the category default').toHaveValue('Matte')
    await page.getByRole('button', { name: '+ Gloss' }).first().click()
    await expect(value).toHaveValue('Matte, Gloss')

    await page.getByRole('button', { name: 'Create product' }).click()
    await expect.poll(async () => {
      const found = await odoo.call('product.template', 'search', [[['name', '=', `E2E Spec Phone ${suffix}`]]])
      productId = found[0] || null
      return productId
    }, { timeout: 30_000 }).not.toBeNull()

    const [saved] = await odoo.call('product.template', 'read', [[productId], ['product_properties']])
    const prop = saved.product_properties.find((p) => p.name === row.property_name)
    const labels = Object.fromEntries(prop.tags.map((t) => [t[0], t[1]]))
    expect(prop.value.map((key) => labels[key])).toEqual(['Matte', 'Gloss'])
  } finally {
    if (productId) await odoo.call('product.template', 'unlink', [[productId]])
    // Deleting the row deletes the specification from the category.
    await odoo.call('loom.property.meta', 'unlink', [[rowId]])
  }
  const [after] = await odoo.call('product.category', 'read', [[categId], ['product_properties_definition']])
  expect(after.product_properties_definition.map((p) => p.name)).not.toContain(row.property_name)
})
