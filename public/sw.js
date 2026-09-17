/*
 * FinAhead service worker — application shell caching only.
 *
 * What it caches: the HTML shell, the hashed JS/CSS bundles, the manifest and
 * the icons. That is the whole list.
 *
 * What it must never cache: anything derived from a user's transactions. This
 * is structurally safe rather than merely intended — an imported CSV is read
 * through the File API and never becomes an HTTP request, so it cannot reach
 * this worker at all. The rules below additionally ignore every request that is
 * not a same-origin GET for a known shell asset.
 *
 * There is no background sync and no push handler, by design.
 */

const CACHE = 'finahead-shell-v2'
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      // A failed precache must not block activation; runtime caching recovers.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  // Drop every cache from an older build so a new deployment cannot be served
  // stale assets.
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  )
})

/** Only the built shell is cacheable. */
function isShellAsset(url) {
  return (
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.webmanifest'
  )
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Navigations: always try the network first so a new deployment is picked up
  // immediately, falling back to the cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put('/index.html', copy))
          return response
        })
        .catch(() =>
          caches
            .match('/index.html')
            .then((cached) => cached ?? Response.error()),
        ),
    )
    return
  }

  if (!isShellAsset(url)) return

  // Hashed assets: serve from cache, refresh in the background.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        })
        .catch(() => cached)
      return cached ?? network
    }),
  )
})
