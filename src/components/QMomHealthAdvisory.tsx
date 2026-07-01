import { Activity, ArrowUpRight, Baby, ShieldCheck, Stethoscope } from 'lucide-react'
import type { HealthAdvisory } from '../data'
import { Mascot } from './Mascot'

const categoryIcon = {
  development: Baby,
  disease: Activity,
  safety: ShieldCheck,
  nutrition: Stethoscope,
} as const

export function QMomHealthAdvisory({
  advisories,
  compact = false,
}: {
  advisories: HealthAdvisory[]
  compact?: boolean
}) {
  const primary = advisories[0]
  if (!primary) return null
  const Icon = categoryIcon[primary.category]
  const extraCount = Math.max(0, advisories.length - 1)

  return (
    <section className={`qmom-advisory ${compact ? 'qmom-advisory--compact' : ''}`} aria-label="Q媽安心提醒">
      <div className="qmom-advisory__mascot" aria-hidden="true">
        <Mascot variant="qMom" loading="eager" />
      </div>
      <div className="qmom-advisory__content">
        <span className={`qmom-advisory__badge severity-${primary.severity}`}>
          <Icon size={15} />
          Q媽安心提醒
        </span>
        <h3>{primary.title}</h3>
        <p>{primary.summary}</p>
        <strong>{primary.action}</strong>
        <div className="qmom-advisory__meta">
          <span>{primary.source.agency}</span>
          {primary.source.dataPeriod && <span>{primary.source.dataPeriod}</span>}
          {extraCount > 0 && <span>另有 {extraCount} 則提醒</span>}
        </div>
        <a href={primary.source.url} target="_blank" rel="noreferrer">
          查看政府來源 <ArrowUpRight size={13} />
        </a>
        {!compact && <small>{primary.disclaimer}</small>}
      </div>
    </section>
  )
}
