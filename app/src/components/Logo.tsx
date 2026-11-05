interface LogoProps {
  size?: number
  title?: string
}

export function LogoMark({ size = 42, title = 'UNTIL' }: LogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" role="img" aria-label={title}>
      <path d="M9 5v18.5C9 34.7 14.8 41 24 41s15-6.3 15-17.5V5" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      <path d="M32 5h7v7" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m16.5 23.5 5 5 10.5-11" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
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
