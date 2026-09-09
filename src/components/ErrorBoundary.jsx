import { Component } from 'react'
import { Button } from './ui/index.jsx'
import { track } from '../lib/analytics.js'
import { describeError, shouldReset } from '../lib/errors.js'

/**
 * What a shopper sees when a render throws.
 *
 * Without one, React unmounts the whole tree and leaves a white page. On a
 * product page that is a lost sale with no trace of why — the shopper assumes
 * the shop is broken, and it is, and nobody finds out.
 *
 * A class component because there is still no hook for this; `componentDidCatch`
 * is the only way to see the error at all.
 *
 * Two deliberate choices:
 *
 *  - **The header and footer survive.** This sits inside the layout, so a
 *    failure in one route leaves the navigation, the bag and the search intact.
 *    Somebody who hits it can keep shopping, which is the whole difference
 *    between an incident and a bounce.
 *  - **The message says what to do, not what went wrong.** A stack trace helps
 *    nobody standing in a queue; it goes to the console and to analytics, where
 *    it can be acted on.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Loud in the console always — a swallowed error is a bug nobody can find.
    console.error('[loom] render failed:', error, info?.componentStack)
    track('app_error', {
      message: describeError(error),
      route: typeof window !== 'undefined' ? window.location.pathname : '',
    })
  }

  componentDidUpdate(previous) {
    // Navigating away should clear it. Without this the boundary stays broken
    // for the rest of the session and every subsequent page looks broken too.
    if (shouldReset(this.state.error, previous.resetKey, this.props.resetKey)) {
      this.setState({ error: null })
    }
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="wrap flex min-h-[50vh] flex-col items-center justify-center py-20 text-center">
        <p className="eyebrow">Something went wrong</p>
        <h1 className="mt-4 text-display-md">This page did not load</h1>
        <p className="mt-4 max-w-md text-[15px] leading-relaxed text-muted">
          Not your fault, and nothing in your bag has been lost. Reloading usually fixes it.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button onClick={() => window.location.reload()}>Reload the page</Button>
          <Button to="/" variant="quiet">
            Back to the shop
          </Button>
        </div>
      </div>
    )
  }
}
