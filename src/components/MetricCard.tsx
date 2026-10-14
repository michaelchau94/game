import { useId } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { MetricPoint } from '../types'

type MetricKey = 'throughput' | 'errorRate' | 'p95' | 'cpu'

type MetricCardProps = {
  label: string
  value: number
  suffix: string
  data: MetricPoint[]
  metric: MetricKey
  icon: LucideIcon
  tone: 'blue' | 'rose' | 'violet' | 'amber'
  precision?: number
}

export default function MetricCard({ label, value, suffix, data, metric, icon: Icon, tone, precision = 0 }: MetricCardProps) {
  const id = useId().replaceAll(':', '')
  const values = data.map((point) => point[metric])
  const minimum = Math.min(...values, 0)
  const maximum = Math.max(...values, 1)
  const range = maximum - minimum || 1
  const points = values.map((item, index) => {
    const x = values.length <= 1 ? 0 : (index / (values.length - 1)) * 100
    const y = 28 - ((item - minimum) / range) * 23
    return `${x},${y}`
  })
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point}`).join(' ')
  const area = values.length ? `${path} L 100,32 L 0,32 Z` : ''

  return (
    <article className={`metric-card metric-card--${tone}`}>
      <div className="metric-heading">
        <span>{label}</span>
        <span className="metric-icon"><Icon size={14} /></span>
      </div>
      <div className="metric-value">{value.toFixed(precision)}<small>{suffix}</small></div>
      <div className="metric-chart" aria-label={`${label} trend`}>
        <svg viewBox="0 0 100 32" preserveAspectRatio="none" role="img">
          <defs><linearGradient id={`gradient-${id}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" className="chart-gradient-start" /><stop offset="100%" className="chart-gradient-end" /></linearGradient></defs>
          {[8, 18, 28].map((line) => <line key={line} x1="0" x2="100" y1={line} y2={line} className="chart-gridline" />)}
          {area ? <path d={area} fill={`url(#gradient-${id})`} className="chart-area" /> : null}
          {path ? <path d={path} className="chart-line" /> : null}
        </svg>
      </div>
      <div className="metric-footnote"><span className="metric-live-dot" /> LIVE · 30 SEC WINDOW</div>
    </article>
  )
}
