import { Link } from '../lib/router'
import { BrandLockup } from './BrandMark'

/**
 * The public page header: brand, two anchors, one primary action. Deliberately
 * simple enough that it needs no mobile drawer — the anchors collapse away and
 * the action stays.
 */
export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <Link to="/" className="brand-link" aria-label="FinAhead home">
          <BrandLockup />
        </Link>

        <nav className="site-nav" aria-label="Page sections">
          <a href="#how-it-works">How it works</a>
          <a href="#privacy">Privacy</a>
        </nav>

        <Link to="/app?start=demo" className="btn btn-primary btn-sm site-header__cta">
          Try the demo
        </Link>
      </div>
    </header>
  )
}
