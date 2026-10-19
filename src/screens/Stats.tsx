import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { WEEKDAYS, WEEKDAYS_LONG, hours, smileyFor } from '../lib/format'
import { DAYPARTS, insights, totalsByProject, weekGrid, type Cell } from '../lib/stats'

const PERIODS = [
  { id: '7', label: '7 T', days: 7 },
  { id: '30', label: '30 T', days: 30 },
  { id: '90', label: '90 T', days: 90 },
  { id: 'all', label: 'Alles', days: Infinity },
]

export function Stats() {
  const allSessions = useLiveQuery(() => db.sessions.toArray(), [])
  const projects = useLiveQuery(() => db.projects.orderBy('createdAt').toArray(), [])
  const [period, setPeriod] = useState('30')
  const [projectId, setProjectId] = useState('all')

  const sessions = useMemo(() => {
    const days = PERIODS.find((p) => p.id === period)!.days
    const since = Number.isFinite(days) ? Date.now() - days * 86_400_000 : 0
    return (allSessions ?? []).filter((s) => s.start >= since && (projectId === 'all' || s.projectId === projectId))
  }, [allSessions, period, projectId])

  const ins = useMemo(() => insights(sessions), [sessions])
  const grid = useMemo(() => weekGrid(sessions), [sessions])
  const totals = useMemo(() => totalsByProject(sessions), [sessions])
  const total = [...totals.values()].reduce((a, b) => a + b, 0)

  if (!allSessions || !projects) return null

  return (
    <div className="screen">
      <header className="screen-head">
        <h1>Insights</h1>
      </header>

      <div className="filters">
        <div className="segmented">
          {PERIODS.map((p) => (
            <button key={p.id} className={period === p.id ? 'on' : ''} onClick={() => setPeriod(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
        <select className="select-pill" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="all">Alle Projekte</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {sessions.length === 0 ? (
        <p className="empty muted">Keine Sessions in diesem Zeitraum. Nach ein paar Tagen Tracking siehst du hier deine Muster.</p>
      ) : (
        <>
          <div className="tiles">
            <Tile label="Gesamt" value={hours(total)} sub={`${sessions.length} Sessions`} />
            <Tile label="Diese Woche" value={hours(ins.thisWeek)} />
            <Tile label="Streak" value={`${ins.streak} ${ins.streak === 1 ? 'Tag' : 'Tage'}`} />
            <Tile
              label="Ø Bewertung"
              value={ins.avgRating === null ? '–' : `${Math.round(ins.avgRating)}`}
              sub={ins.avgRating === null ? undefined : smileyFor(ins.avgRating).emoji}
            />
          </div>

          <section className="card">
            <h3>Deine Peak-Zeiten</h3>
            {ins.bestWindows.length === 0 ? (
              <p className="muted small">Noch zu wenig Daten. Ab etwa 2 Sessions pro Zeitfenster wird es aussagekräftig.</p>
            ) : (
              <ol className="peaks">
                {ins.bestWindows.map((w, i) => (
                  <li key={`${w.weekday}${w.daypart.id}`}>
                    <span className="peak-rank">{i + 1}</span>
                    <span className="row-main">
                      <span className="row-title">
                        {WEEKDAYS_LONG[w.weekday]} · {w.daypart.label}
                      </span>
                      <span className="row-sub muted">
                        {w.daypart.range} · {w.count} {w.count === 1 ? 'Session' : 'Sessions'} · {hours(w.ms)}
                      </span>
                    </span>
                    <span className="peak-score">
                      {smileyFor(w.rating).emoji} {Math.round(w.rating)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
            {ins.worstWindow && (
              <p className="muted small hint">
                Am zähesten: {WEEKDAYS_LONG[ins.worstWindow.weekday]} · {ins.worstWindow.daypart.label} (Ø{' '}
                {Math.round(ins.worstWindow.rating)})
              </p>
            )}
            {ins.neverWeekdays.length > 0 && (
              <p className="muted small hint">
                Nie aktiv: {ins.neverWeekdays.map((d) => WEEKDAYS_LONG[d]).join(', ')}
              </p>
            )}
          </section>

          <Heatmap grid={grid} />

          {projectId === 'all' && totals.size > 0 && (
            <section className="card">
              <h3>Stunden pro Projekt</h3>
              <Bars
                rows={projects
                  .filter((p) => totals.has(p.id))
                  .sort((a, b) => totals.get(b.id)! - totals.get(a.id)!)
                  .map((p) => ({ key: p.id, label: p.name, ms: totals.get(p.id)!, color: p.color }))}
              />
            </section>
          )}

          <section className="card">
            <h3>Wochentage</h3>
            <Bars
              rows={ins.weekdayTotals.map((d) => ({
                key: String(d.weekday),
                label: WEEKDAYS[d.weekday],
                ms: d.ms,
                rating: d.rating,
              }))}
            />
          </section>

          <section className="card">
            <h3>Tageszeit</h3>
            <Bars
              rows={DAYPARTS.map((p) => {
                const r = ins.byDaypart.find((x) => x.daypart.id === p.id)
                return { key: p.id, label: p.label, sub: p.range, ms: r?.ms ?? 0, rating: r?.rating ?? null }
              })}
            />
          </section>

          {ins.byLength.length > 1 && (
            <section className="card">
              <h3>Ideale Session-Länge</h3>
              <ul className="ranklist">
                {ins.byLength.map((l) => (
                  <li key={l.key}>
                    <span>{l.label}</span>
                    <span className="muted small">{l.count}×</span>
                    <span className="peak-score">
                      {smileyFor(l.rating).emoji} {Math.round(l.rating)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="tile">
      <span className="tile-label">{label}</span>
      <span className="tile-value">{value}</span>
      {sub && <span className="tile-sub muted">{sub}</span>}
    </div>
  )
}

interface BarRow {
  key: string
  label: string
  sub?: string
  ms: number
  color?: string
  rating?: number | null
}

function Bars({ rows }: { rows: BarRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.ms))
  return (
    <div className="bars">
      {rows.map((r) => (
        <div key={r.key} className="bar-row">
          <span className="bar-label">
            {r.label}
            {r.sub && <span className="bar-sub muted">{r.sub}</span>}
          </span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${(r.ms / max) * 100}%`, background: r.color }} />
          </span>
          <span className="bar-value">
            {r.ms ? hours(r.ms) : '–'}
            {r.rating != null && <span className="bar-rating">{smileyFor(r.rating).emoji}</span>}
          </span>
        </div>
      ))}
    </div>
  )
}

// Sequential (time): one hue light→dark. Diverging (quality): orange ↔ neutral gray ↔ blue.
const BLUE = [42, 120, 214]
const ORANGE = [235, 104, 52]
const GRAY = [160, 160, 155]
const mix = (a: number[], b: number[], t: number) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`

function cellColor(c: Cell, mode: 'time' | 'quality', maxMs: number) {
  if (!c.ms) return undefined
  if (mode === 'time') {
    const t = 0.18 + 0.82 * Math.sqrt(c.ms / maxMs)
    return `rgba(${BLUE.join(',')},${t})`
  }
  const r = c.rating! / 100
  return r < 0.5 ? mix(ORANGE, GRAY, r * 2) : mix(GRAY, BLUE, (r - 0.5) * 2)
}

function Heatmap({ grid }: { grid: Cell[][] }) {
  const [mode, setMode] = useState<'time' | 'quality'>('quality')
  const [sel, setSel] = useState<{ d: number; h: number } | null>(null)
  const maxMs = Math.max(1, ...grid.flat().map((c) => c.ms))
  // only show hours that were ever used, padded to a sensible day window
  const used = grid.flatMap((row) => row.map((c, h) => (c.ms ? h : -1))).filter((h) => h >= 0)
  const from = Math.min(6, ...used)
  const to = Math.max(22, ...used)
  const hoursRange = Array.from({ length: to - from + 1 }, (_, i) => from + i)
  const selCell = sel && grid[sel.d][sel.h]

  return (
    <section className="card">
      <div className="card-head">
        <h3>Wochenrhythmus</h3>
        <div className="segmented tiny">
          <button className={mode === 'quality' ? 'on' : ''} onClick={() => setMode('quality')}>
            Qualität
          </button>
          <button className={mode === 'time' ? 'on' : ''} onClick={() => setMode('time')}>
            Zeit
          </button>
        </div>
      </div>
      <div className="heatmap" style={{ gridTemplateColumns: `1.6em repeat(${hoursRange.length}, 1fr)` }}>
        <span />
        {hoursRange.map((h) => (
          <span key={h} className="hm-hour">
            {h % 3 === 0 ? h : ''}
          </span>
        ))}
        {grid.map((row, d) => (
          <div key={d} className="hm-row">
            <span className="hm-day">{WEEKDAYS[d]}</span>
            {hoursRange.map((h) => (
              <button
                key={h}
                className={`hm-cell ${sel?.d === d && sel.h === h ? 'sel' : ''}`}
                style={{ background: cellColor(row[h], mode, maxMs) }}
                onClick={() => setSel(sel?.d === d && sel.h === h ? null : { d, h })}
                onMouseEnter={() => setSel({ d, h })}
                aria-label={`${WEEKDAYS_LONG[d]} ${h} Uhr`}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="hm-foot small">
        {selCell && sel ? (
          <span>
            <strong>
              {WEEKDAYS_LONG[sel.d]}, {sel.h}–{sel.h + 1} Uhr
            </strong>
            {selCell.ms ? ` · ${hours(selCell.ms)} · Ø ${Math.round(selCell.rating!)} ${smileyFor(selCell.rating!).emoji}` : ' · nichts getrackt'}
          </span>
        ) : mode === 'quality' ? (
          <span className="legend">
            <span className="legend-ramp quality" /> zäh → Flow
          </span>
        ) : (
          <span className="legend">
            <span className="legend-ramp time" /> wenig → viel Zeit
          </span>
        )}
      </div>
    </section>
  )
}
