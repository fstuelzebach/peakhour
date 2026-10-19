import { hours, weekday } from '../lib/format'

interface Props {
  goalHours: number
  doneMs: number
  color: string
  compact?: boolean
}

export function GoalProgress({ goalHours, doneMs, color, compact }: Props) {
  const goalMs = goalHours * 3_600_000
  const pct = Math.min(1, doneMs / goalMs)
  const leftMs = Math.max(0, goalMs - doneMs)
  const daysLeft = 7 - weekday(new Date()) // incl. today
  const track = (
    <div className="goal-track">
      <span className="goal-fill" style={{ width: `${pct * 100}%`, background: color }} />
    </div>
  )
  if (compact) return track
  return (
    <div className="goal">
      <div className="goal-head">
        <span className="goal-label">Wochenziel</span>
        <span className="goal-value">
          <strong>{hours(doneMs)}</strong>
          <span className="muted"> / {goalHours} h</span>
        </span>
      </div>
      {track}
      <div className="goal-sub muted">
        {leftMs === 0 ? 'Ziel erreicht 🎉' : `Noch ${hours(leftMs)} · ca. ${hours(leftMs / daysLeft)} pro Tag bis Sonntag`}
      </div>
    </div>
  )
}
