interface LogoProps {
  size?: number
  title?: string
}

/**
 * The UNTIL mark: a U whose right arm carries a tick.
 *
 * Two strokes, one idea — the work continues until the check. The corner detail
 * of the earlier mark was removed so the glyph stays readable at 18 px.
 */
export function LogoMark({ size = 42, title = 'UNTIL' }: LogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" role="img" aria-label={title}>
      <path d="M13 9v14a11 11 0 0 0 22 0V9" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" />
      <path d="m19.5 26 5 5 10.5-12" stroke="var(--accent)" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function LogoLockup() {
  return (
    <span className="logo-lockup">
      <LogoMark />
      <span className="logo-word">UNTIL</span>
    </span>
  )
}
