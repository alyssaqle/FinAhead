/**
 * A minimal History API router.
 *
 * FinAhead needs exactly two locations — the public page at `/` and the app at
 * `/app` — plus real, shareable URLs and working browser back/forward. That is
 * a few dozen lines of `history.pushState` and a `popstate` listener, so no
 * routing dependency is added.
 *
 * Navigation is rendered as real anchors so links behave like links: keyboard
 * activation, middle-click, open-in-new-tab and the status bar all work, and
 * only plain left-clicks are intercepted.
 */

import {
  useCallback,
  useSyncExternalStore,
  type AnchorHTMLAttributes,
  type MouseEvent,
} from 'react'

const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  window.addEventListener('popstate', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('popstate', listener)
  }
}

function getSnapshot() {
  return `${window.location.pathname}${window.location.search}`
}

/** Push a new location and re-render. Same URL is ignored. */
export function navigate(to: string, options: { replace?: boolean } = {}) {
  if (to === getSnapshot()) return
  if (options.replace) window.history.replaceState(null, '', to)
  else window.history.pushState(null, '', to)
  emit()
}

export interface Route {
  /** Pathname with any trailing slash removed, e.g. `/app`. */
  path: string
  /** Parsed query string. */
  query: URLSearchParams
}

/** Subscribe to the current location. */
export function useRoute(): Route {
  const location = useSyncExternalStore(subscribe, getSnapshot, () => '/')
  const [pathname, search = ''] = location.split('?')
  return {
    path: pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname,
    query: new URLSearchParams(search),
  }
}

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }

/**
 * An anchor that navigates in-app. Modified clicks (new tab, download, external
 * target) fall through to the browser untouched.
 */
export function Link({ to, onClick, ...rest }: LinkProps) {
  const handleClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      onClick?.(event)
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return
      }
      event.preventDefault()
      navigate(to)
      window.scrollTo({ top: 0 })
    },
    [to, onClick],
  )

  return <a href={to} onClick={handleClick} {...rest} />
}
