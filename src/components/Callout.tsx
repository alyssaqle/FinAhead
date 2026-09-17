import type { ReactNode } from 'react'
import { IconAlert, IconInfo } from './icons'

interface CalloutProps {
  tone: 'info' | 'warning' | 'note'
  title?: string
  children: ReactNode
}

/** A bordered notice. Warning tone is reserved for genuine financial risk. */
export function Callout({ tone, title, children }: CalloutProps) {
  const Icon = tone === 'warning' ? IconAlert : IconInfo

  return (
    <div
      className={`callout callout-${tone}`}
      role={tone === 'warning' ? 'alert' : undefined}
    >
      <span className="callout__icon" aria-hidden="true">
        <Icon size={18} />
      </span>
      <div>
        {title ? <p className="callout__title">{title}</p> : null}
        <div>{children}</div>
      </div>
    </div>
  )
}
