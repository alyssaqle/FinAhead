/**
 * Inline SVG icons.
 *
 * Hand-drawn on a 24px grid rather than pulled from an icon package: FinAhead
 * needs eight glyphs, and a library would cost more bytes than the whole app.
 * Every icon is decorative — meaning is always carried by adjacent text — so
 * they are all `aria-hidden`.
 */

interface IconProps {
  size?: number
  className?: string
}

function Svg({
  size = 20,
  className,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  )
}

export const IconUpload = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12 16V4" />
    <path d="m7.5 8.5 4.5-4.5 4.5 4.5" />
    <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
  </Svg>
)

export const IconShield = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12 3.5 5 6.2V11c0 4.4 2.9 8.1 7 9.5 4.1-1.4 7-5.1 7-9.5V6.2z" />
    <path d="m9.2 11.8 2 2 3.6-3.6" />
  </Svg>
)

export const IconBrowser = (props: IconProps) => (
  <Svg {...props}>
    <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
    <path d="M3 9h18" />
    <path d="M6.5 6.7h.01M9 6.7h.01" />
  </Svg>
)

export const IconEvidence = (props: IconProps) => (
  <Svg {...props}>
    <path d="M8 4.5h9a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-13" />
    <path d="M8 3v3.5H5z" />
    <path d="M9 11h7M9 15h5" />
  </Svg>
)

export const IconCheck = (props: IconProps) => (
  <Svg {...props}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Svg>
)

export const IconArrowRight = (props: IconProps) => (
  <Svg {...props}>
    <path d="M4.5 12h15" />
    <path d="m13.5 6 6 6-6 6" />
  </Svg>
)

export const IconAlert = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5v5" />
    <path d="M12 16.2h.01" />
  </Svg>
)

export const IconInfo = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11.5v5" />
    <path d="M12 7.8h.01" />
  </Svg>
)

export const IconInstall = (props: IconProps) => (
  <Svg {...props}>
    <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
    <path d="M12 7v7" />
    <path d="m9.5 11.5 2.5 2.5 2.5-2.5" />
  </Svg>
)

export const IconChevron = (props: IconProps) => (
  <Svg {...props}>
    <path d="m6 9.5 6 6 6-6" />
  </Svg>
)

export const IconFile = (props: IconProps) => (
  <Svg {...props}>
    <path d="M13 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9.5z" />
    <path d="M13 3.5V9.5h6" />
  </Svg>
)
