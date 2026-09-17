/**
 * The FinAhead mark: the cash runway itself.
 *
 * A balance path that falls through upcoming obligations, a filled marker at
 * the projected low, then a rise into an arrow at payday. It is the product's
 * one idea drawn in four strokes, which keeps it legible at favicon size and
 * makes the header, the chart and the icon read as the same thing.
 *
 * Inline SVG so it inherits colour and needs no image asset.
 */

interface BrandMarkProps {
  size?: number
  /** Draw the mark inside its brand-blue rounded tile (used for app icons). */
  tile?: boolean
  className?: string
}

export function BrandMark({ size = 28, tile = false, className }: BrandMarkProps) {
  const stroke = tile ? '#ffffff' : 'currentColor'

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {tile ? <rect width="32" height="32" rx="8.5" fill="var(--blue, #315efb)" /> : null}
      <g
        stroke={stroke}
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* balance falling through obligations, then recovering at payday */}
        <path d="M5 9.5 13 21.5 26.5 7.5" />
        {/* arrowhead at payday */}
        <path d="M19.8 9.2 26.5 7.5 24.9 14.2" />
      </g>
      {/* projected low marker */}
      <circle cx="13" cy="21.5" r="3.4" fill={stroke} />
    </svg>
  )
}

interface BrandLockupProps {
  /** Show the tagline beside the wordmark (application header, wide screens). */
  tagline?: boolean
  size?: number
}

/** Mark plus wordmark, used in both headers and the footer. */
export function BrandLockup({ tagline = false, size = 28 }: BrandLockupProps) {
  return (
    <span className="brand">
      <span className="brand__mark">
        <BrandMark size={size} />
      </span>
      <span className="brand__text">
        <span className="brand__word">FinAhead</span>
        {tagline ? (
          <span className="brand__tagline">See your balance before payday.</span>
        ) : null}
      </span>
    </span>
  )
}
