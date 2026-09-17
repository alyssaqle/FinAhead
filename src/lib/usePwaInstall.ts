/**
 * Install support for the installable web app.
 *
 * The install action is offered only when the browser has actually given us an
 * install opportunity — Chromium fires `beforeinstallprompt` once the app meets
 * the installability criteria. Browsers that never fire it (Safari, Firefox)
 * simply never see the button, which is better than showing an action that
 * cannot work.
 */

import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export interface PwaInstall {
  /** True when the browser has offered an install opportunity. */
  canInstall: boolean
  /** True when running as an installed app, where detectable. */
  isInstalled: boolean
  install: () => Promise<void>
}

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari exposes this instead of the display-mode media query.
    (window.navigator as { standalone?: boolean }).standalone === true
  )
}

export function usePwaInstall(): PwaInstall {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(detectStandalone)

  useEffect(() => {
    function onBeforeInstallPrompt(event: Event) {
      // Keep the event so the prompt can be tied to a real user gesture later.
      event.preventDefault()
      setDeferred(event as BeforeInstallPromptEvent)
    }

    function onInstalled() {
      setDeferred(null)
      setIsInstalled(true)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  return {
    canInstall: deferred !== null && !isInstalled,
    isInstalled,
    async install() {
      if (!deferred) return
      await deferred.prompt()
      await deferred.userChoice
      setDeferred(null)
    },
  }
}
