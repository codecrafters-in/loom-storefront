import { isMock } from './config.js'

/**
 * Whether the storefront should offer its documentation to visitors.
 *
 * Three places ask — the footer, the mobile menu and the demo pill — and they
 * have to agree, or a merchant who switches it off finds it still showing
 * somewhere.
 *
 * `'auto'` (the default) means: while the shop is running on the bundled
 * catalogue it is a demo, and a demo exists to be read. The moment it is
 * pointed at a real backend it is a shop with customers, and customers are not
 * offered an API reference. The back office links to /docs either way, which is
 * the case the setting is really for — that is where the person who needs the
 * contract actually is.
 */
export function docsLinkVisible(config, onDemoData = isMock) {
  const setting = config?.features?.docsLink
  if (setting === true) return true
  if (setting === false) return false
  return onDemoData
}
