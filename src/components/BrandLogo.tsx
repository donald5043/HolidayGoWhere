import { Mascot } from './Mascot'

type BrandLogoProps = {
  compact?: boolean
  className?: string
}

export function BrandLogo({ compact = false, className = '' }: BrandLogoProps) {
  return (
    <span className={`brand-lockup ${compact ? 'brand-lockup--compact' : ''} ${className}`.trim()}>
      <span className="brand-lockup__mark" aria-hidden="true">
        <Mascot variant="appIcon" className="brand-lockup__image" loading="eager" />
      </span>
      <span className="brand-lockup__copy">
        <span className="brand-lockup__name">
          <span className="brand-lockup__name-main">Holiday</span>
          <span className="brand-lockup__name-accent">GoWhere</span>
        </span>
        {!compact && <span className="brand-lockup__tagline">帶孩子，去更好的地方</span>}
      </span>
    </span>
  )
}
