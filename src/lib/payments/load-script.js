/**
 * Load a third-party script once.
 *
 * One tag per src, so a second checkout does not load a payment SDK twice, and
 * a script that is still loading is joined rather than requested again.
 */
export function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error(`Cannot load ${src} outside a browser`))
      return
    }
    const existing = document.querySelector(`script[src="${src}"]`)
    if (existing) {
      if (existing.dataset.loaded === 'true') {
        resolve()
        return
      }
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error(`Could not load ${src}`)))
      return
    }
    const tag = document.createElement('script')
    tag.src = src
    tag.async = true
    tag.addEventListener('load', () => {
      tag.dataset.loaded = 'true'
      resolve()
    })
    tag.addEventListener('error', () => reject(new Error(`Could not load ${src}`)))
    document.head.appendChild(tag)
  })
}
