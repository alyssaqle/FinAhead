import { Link } from '../lib/router'
import { BrandLockup } from './BrandMark'
import { IconInstall } from './icons'
import type { PwaInstall } from '../lib/usePwaInstall'

interface AppHeaderProps {
  pwa: PwaInstall
}

/**
 * The application header. Same brand lockup as the public page, plus the
 * compact tagline on wider screens, a way back to the public page, and an
 * install action that appears only when the browser has offered one.
 */
export function AppHeader({ pwa }: AppHeaderProps) {
  return (
    <header className="app-header">
      <div className="container app-header__inner">
        <Link to="/" className="brand-link" aria-label="FinAhead home">
          <BrandLockup tagline />
        </Link>

        <div className="app-header__actions">
          {pwa.canInstall ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => void pwa.install()}
            >
              <IconInstall size={16} />
              Install
            </button>
          ) : null}
          <Link to="/" className="app-header__link">
            About FinAhead
          </Link>
        </div>
      </div>
    </header>
  )
}
