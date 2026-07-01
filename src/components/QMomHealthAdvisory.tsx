import { Activity, ArrowUpRight, Baby, CheckCircle2, ChevronLeft, ChevronRight, Database, ShieldCheck, Shuffle, Stethoscope } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { HealthAdvisory } from '../data'
import { Mascot } from './Mascot'

const categoryIcon = {
  development: Baby,
  disease: Activity,
  safety: ShieldCheck,
  nutrition: Stethoscope,
} as const

type CdcAttempt = {
  diseaseName: string
  dataset?: string
  metadataUrl?: string
  usedUrl?: string
  records?: number
  ok: boolean
  error?: string
}

type CdcStatus = {
  freshAdvisories: number
  fallbackAdvisories: number
  failedDiseases: string[]
  attempts?: CdcAttempt[]
}

const ageLabel = {
  all: '全年齡',
  '0-2': '0–2 歲',
  '3-5': '3–5 歲',
  '6-12': '6–12 歲',
} as const

export function QMomHealthAdvisory({
  advisories,
  compact = false,
  mode = 'feature',
  selectedAge = 'all',
  cdcStatus = null,
  generatedAt = null,
}: {
  advisories: HealthAdvisory[]
  compact?: boolean
  mode?: 'feature' | 'inline'
  selectedAge?: keyof typeof ageLabel | string
  cdcStatus?: CdcStatus | null
  generatedAt?: string | null
}) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [touchStartX, setTouchStartX] = useState<number | null>(null)
  const orderedAdvisories = useMemo(() => advisories, [advisories])

  useEffect(() => {
    setActiveIndex(0)
  }, [selectedAge, orderedAdvisories.length])

  const primary = orderedAdvisories[activeIndex] ?? orderedAdvisories[0]
  if (!primary) return null
  const isInline = mode === 'inline'
  const Icon = categoryIcon[primary.category]
  const extraCount = Math.max(0, orderedAdvisories.length - 1)
  const currentAgeLabel = ageLabel[selectedAge as keyof typeof ageLabel] ?? '目前年齡'
  const cdcAttempts = cdcStatus?.attempts?.filter((attempt) => attempt.ok) ?? []
  const hasDiseaseCard = orderedAdvisories.some((advisory) => advisory.category === 'disease')
  const generatedDate = generatedAt
    ? new Intl.DateTimeFormat('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(generatedAt))
    : null

  const goPrevious = () => {
    setActiveIndex((current) => (current + orderedAdvisories.length - 1) % orderedAdvisories.length)
  }

  const goNext = () => {
    setActiveIndex((current) => (current + 1) % orderedAdvisories.length)
  }

  const randomize = () => {
    if (orderedAdvisories.length <= 1) return
    setActiveIndex((current) => {
      const next = Math.floor(Math.random() * (orderedAdvisories.length - 1))
      return next >= current ? next + 1 : next
    })
  }

  const handleTouchEnd = (clientX: number) => {
    if (touchStartX === null || orderedAdvisories.length <= 1) return
    const delta = clientX - touchStartX
    if (Math.abs(delta) > 42) {
      if (delta < 0) goNext()
      else goPrevious()
    }
    setTouchStartX(null)
  }

  return (
    <section
      className={`qmom-advisory ${compact ? 'qmom-advisory--compact' : ''} ${isInline ? 'qmom-advisory--inline' : ''}`}
      aria-label="Q媽安心提醒"
      onTouchStart={(event) => setTouchStartX(event.touches[0]?.clientX ?? null)}
      onTouchEnd={(event) => handleTouchEnd(event.changedTouches[0]?.clientX ?? 0)}
    >
      <div className="qmom-advisory__mascot" aria-hidden="true">
        <Mascot variant="qMom" loading="eager" />
      </div>
      <div className="qmom-advisory__content">
        <div className="qmom-advisory__topline">
          <span className={`qmom-advisory__badge severity-${primary.severity}`}>
            <Icon size={15} />
            Q媽安心提醒
          </span>
          <span className="qmom-advisory__age">依 {currentAgeLabel} 挑選</span>
        </div>
        <h3>{primary.title}</h3>
        <p>{primary.summary}</p>
        <strong>{primary.action}</strong>
        <div className="qmom-advisory__meta">
          <span>{primary.source.agency}</span>
          {primary.source.dataPeriod && <span>{primary.source.dataPeriod}</span>}
          {!isInline && extraCount > 0 && <span>可切換 {extraCount} 則提醒</span>}
        </div>
        {!isInline && orderedAdvisories.length > 1 && (
          <div className="qmom-advisory__controls" aria-label="切換 Q媽提醒">
            <button type="button" onClick={goPrevious} aria-label="上一則提醒">
              <ChevronLeft size={15} />
            </button>
            <div className="qmom-advisory__dots" aria-label={`第 ${activeIndex + 1} 則，共 ${orderedAdvisories.length} 則`}>
              {orderedAdvisories.map((advisory, index) => (
                <button
                  type="button"
                  key={advisory.id}
                  className={index === activeIndex ? 'active' : ''}
                  onClick={() => setActiveIndex(index)}
                  aria-label={`查看第 ${index + 1} 則提醒`}
                />
              ))}
            </div>
            <button type="button" onClick={goNext} aria-label="下一則提醒">
              <ChevronRight size={15} />
            </button>
            <button type="button" className="qmom-advisory__shuffle" onClick={randomize}>
              <Shuffle size={14} /> 換一則
            </button>
          </div>
        )}
        <div className="qmom-advisory__footer">
          <a href={primary.source.url} target="_blank" rel="noreferrer">
            查看政府來源 <ArrowUpRight size={13} />
          </a>
          {generatedDate && <span>更新 {generatedDate}</span>}
          {isInline && orderedAdvisories.length > 1 && (
            <button type="button" className="qmom-advisory__next" onClick={goNext}>
              下一則 <ChevronRight size={13} />
            </button>
          )}
        </div>
        {!isInline && cdcAttempts.length > 0 && (
          <div className="qmom-advisory__cdc" aria-label="疾管署資料檢查狀態">
            <div className="qmom-advisory__cdc-title">
              {hasDiseaseCard ? <Activity size={14} /> : <CheckCircle2 size={14} />}
              <span>{hasDiseaseCard ? '疾管署升高提醒' : '疾管署資料已檢查，目前未產生升高提醒'}</span>
            </div>
            <div className="qmom-advisory__cdc-list">
              {cdcAttempts.slice(0, 2).map((attempt) => (
                <a
                  href={attempt.metadataUrl || attempt.usedUrl}
                  target="_blank"
                  rel="noreferrer"
                  key={attempt.diseaseName}
                >
                  <Database size={12} />
                  {attempt.diseaseName}
                  {typeof attempt.records === 'number' && <small>{attempt.records.toLocaleString('zh-TW')} 筆</small>}
                </a>
              ))}
            </div>
          </div>
        )}
        {!compact && !isInline && <small>{primary.disclaimer}</small>}
      </div>
    </section>
  )
}
