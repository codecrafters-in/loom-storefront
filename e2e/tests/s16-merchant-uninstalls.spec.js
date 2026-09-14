/**
 * S-16 — The merchant uninstalls the module: Odoo's own shop works again.
 *
 * Checklist: S4 S13. Gap report §6: ✅ — preset property definitions may remain.
 *
 * Odoo-side: uninstalling a module is not something a storefront browser test
 * can do. It belongs to the addon's CI install job.
 */
import { test } from '../support/fixtures.js'

test('S-16 merchant uninstalls the module and Odoo /shop works again', { tag: '@S-16' }, async () => {
  test.skip(
    true,
    'Odoo-side scenario: covered by the addon CI install job (loom_storefront/.github/workflows/tests.yml). ' +
      'Uninstall + /shop redirect removal was verified manually in the audit (02-gap-report.md §1).',
  )
})
