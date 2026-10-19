import type { CSSProperties } from 'react'
import type { RatingKind } from '../types'
import { SMILEYS, smileyFor } from '../lib/format'

interface Props {
  value: number | null
  onChange: (value: number, kind: RatingKind) => void
}

export function RatingInput({ value, onChange }: Props) {
  const active = value === null ? null : smileyFor(value)
  return (
    <div className="rating">
      <div className="smileys">
        {SMILEYS.map((s) => (
          <button
            key={s.value}
            type="button"
            className={`smiley ${active?.value === s.value ? 'on' : ''}`}
            onClick={() => onChange(s.value, 'smiley')}
            aria-label={s.label}
          >
            <span className="emoji">{s.emoji}</span>
            <span className="smiley-label">{s.label}</span>
          </button>
        ))}
      </div>
      <input
        className="slider"
        type="range"
        min={0}
        max={100}
        step={1}
        value={value ?? 50}
        style={{ '--fill': `${value ?? 50}%` } as CSSProperties}
        onChange={(e) => onChange(Number(e.target.value), 'slider')}
        aria-label="Bewertung feinjustieren"
      />
      <div className="slider-scale">
        <span>zäh</span>
        <span>{value === null ? '–' : value}</span>
        <span>Flow</span>
      </div>
    </div>
  )
}
