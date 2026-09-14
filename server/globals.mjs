/**
 * The few browser globals the storefront touches while it renders, for Node and worker runtimes.
 *
 * The theme reads `localStorage` (a signed-in customer, a chosen currency), listens for `storage` events and asks
 * `window.location` for its origin. None of that exists on a server, and none of it is worth a DOM library: during a
 * render there is no visitor, so empty storage and a location are all it needs. Shared by the build-time prerenderer
 * and the request-time render handler.
 */
function memoryStorage() {
  const map = new Map()
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    clear: () => map.clear(),
    key: (index) => [...map.keys()][index] ?? null,
    get length() {
      return map.size
    },
  }
}

// Newer Node versions define `localStorage` as a getter that warns; a plain property replaces it quietly.
const define = (name, value) => Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })

export function installBrowserGlobals(origin = 'http://localhost') {
  if (!globalThis.__LOOM_SERVER_GLOBALS__) {
    define('__LOOM_SERVER_GLOBALS__', true)
    define('localStorage', memoryStorage())
    define('sessionStorage', memoryStorage())
    define('window', {
      localStorage: globalThis.localStorage,
      sessionStorage: globalThis.sessionStorage,
      location: {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => true,
      matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    })
    define('document', { addEventListener() {}, removeEventListener() {}, body: { style: {} } })
  }
  setLocation(`${String(origin).replace(/\/+$/, '')}/`)
}

/** Point `window.location` at the address being rendered, so canonical and Open Graph URLs are absolute and right. */
export function setLocation(href) {
  const url = new URL(href)
  Object.assign(globalThis.window.location, {
    href: url.href,
    origin: url.origin,
    protocol: url.protocol,
    host: url.host,
    hostname: url.hostname,
    pathname: url.pathname,
    search: url.search,
    hash: '',
  })
}

/** Nothing one render stored may reach the next visitor's. */
export function clearStorage() {
  globalThis.localStorage?.clear()
  globalThis.sessionStorage?.clear()
}
