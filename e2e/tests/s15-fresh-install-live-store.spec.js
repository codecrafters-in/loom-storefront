/**
 * S-15 — A merchant installs the module from the App Store on a fresh database,
 * follows the guide, and has a live store in under an hour.
 *
 * Checklist: S4 P2 R1 R2 A11. Gap report §6: ❌ — packaging (#28–#31), sign-up on
 * a new website (#13), payment default (#10), demo fallbacks (#5–#8), sitemap
 * (#21), stale contract check.
 *
 * Odoo-side: installing on a fresh database is not something a storefront
 * browser test can do. It belongs to the addon's CI install job.
 */
import { test } from '../support/fixtures.js'

test('S-15 merchant installs on a fresh database and has a live store within an hour', { tag: '@S-15' }, async () => {
  test.skip(
    true,
    'Odoo-side scenario: covered by the addon CI install job (loom_storefront/.github/workflows/tests.yml — ' +
      'install on a fresh database with and without demo data). Blocked today by #28-#31, #13, #10, #5-#8, #21.',
  )
})
