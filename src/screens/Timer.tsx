import { useMemo, useState, type CSSProperties } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { PROJECT_COLORS, db, discardTimer, pauseTimer, resumeTimer, saveSession, startTimer, stopTimer, timerElapsed, uid } from '../db'
import { duration, weekStart } from '../lib/stats'
import { GoalProgress } from '../components/GoalProgress'
import { clock, hours, timeOfDay } from '../lib/format'
import { useNow } from '../lib/useNow'
import { SessionSheet } from '../components/SessionSheet'

const LAST_PROJECT = 'peakhour:lastProject'

export function Timer() {
  const projects = useLiveQuery(() => db.projects.orderBy('createdAt').filter((p) => !p.archived).toArray(), [])
  const timer = useLiveQuery(() => db.timer.get('active'), [])
  // this week's sessions (covers "today" as well)
  const week = useLiveQuery(() => db.sessions.where('start').aboveOrEqual(weekStart(Date.now())).toArray(), [])

  const [selected, setSelected] = useState<string | null>(() => localStorage.getItem(LAST_PROJECT))
  const running = !!timer && !timer.end
  const paused = running && !!timer.pausedAt
  const now = useNow(1000, running && !paused)
  const elapsed = running ? timerElapsed(timer, now) : 0

  const validSelected = projects?.some((p) => p.id === selected) ? selected : projects?.[0]?.id
  const activeId = timer?.projectId ?? validSelected
  const project = projects?.find((p) => p.id === activeId)
  const color = project?.color ?? PROJECT_COLORS[0]

  const draft = useMemo(
    () => (timer?.end ? { projectId: timer.projectId, start: timer.start, end: timer.end, pausedMs: timer.pausedMs } : null),
    [timer],
  )

  if (projects === undefined) return null
  if (projects.length === 0) return <FirstProject />

  const start = async () => {
    if (!project) return
    localStorage.setItem(LAST_PROJECT, project.id)
    navigator.vibrate?.(10)
    await startTimer(project.id)
  }
  const stop = async () => {
    navigator.vibrate?.(20)
    await stopTimer()
  }
  const togglePause = () => (paused ? resumeTimer() : pauseTimer())

  const startOfToday = new Date().setHours(0, 0, 0, 0)
  const todayMs = (week ?? []).filter((s) => s.start >= startOfToday).reduce((a, s) => a + duration(s), 0)
  const weekMs = (week ?? []).filter((s) => s.projectId === project?.id).reduce((a, s) => a + duration(s), 0)

  return (
    <div className="screen timer-screen" style={{ '--accent': color } as CSSProperties}>
      <div className="chips">
        {projects.map((p) => (
          <button
            key={p.id}
            className={`chip ${p.id === activeId ? 'on' : ''}`}
            style={{ '--c': p.color } as CSSProperties}
            disabled={!!timer}
            onClick={() => setSelected(p.id)}
          >
            <span className="dot" style={{ background: p.color }} />
            {p.name}
          </button>
        ))}
      </div>

      <div className={`timer-center ${paused ? 'paused' : ''}`}>
        <div className="timer-clock">{clock(elapsed)}</div>
        <div className="timer-sub muted">
          {paused
            ? `Pausiert · ${project?.name}`
            : running
              ? `${project?.name} · seit ${timeOfDay(timer!.start)}`
              : `Heute: ${hours(todayMs)}`}
        </div>

        {running ? (
          <div className="run-controls">
            <button className="round-button secondary" onClick={togglePause} aria-label={paused ? 'Weiter' : 'Pause'}>
              <span className="big-icon">{paused ? <span className="play-triangle small" /> : <span className="pause-bars" />}</span>
              <span className="round-label">{paused ? 'Weiter' : 'Pause'}</span>
            </button>
            <button className={`round-button ${paused ? '' : 'running'}`} onClick={stop} aria-label="Stop">
              <span className="big-icon">
                <span className="stop-square small" />
              </span>
              <span className="round-label">Stop</span>
            </button>
          </div>
        ) : (
          <button className="big-button" onClick={start} aria-label="Start">
            <span className="big-icon">
              <span className="play-triangle" />
            </span>
            <span className="big-label">Start</span>
          </button>
        )}
      </div>

      {project?.weeklyGoalHours ? (
        <GoalProgress goalHours={project.weeklyGoalHours} doneMs={weekMs + (timer?.end ? 0 : elapsed)} color={color} />
      ) : null}

      {draft && (
        <SessionSheet
          key={draft.start}
          open
          mode="rate"
          draft={draft}
          onSave={(s) => saveSession(s)}
          onDelete={() => discardTimer()}
        />
      )}
    </div>
  )
}

function FirstProject() {
  const [name, setName] = useState('')
  const create = async (n: string) => {
    if (!n.trim()) return
    await db.projects.add({ id: uid(), name: n.trim(), color: PROJECT_COLORS[0], createdAt: Date.now(), archived: false })
  }
  return (
    <div className="screen onboarding">
      <div className="brand-mark">◐</div>
      <h1>Willkommen bei Peakhour</h1>
      <p className="muted">Tracke deine Fokuszeit, bewerte jede Session und finde heraus, wann du am besten arbeitest.</p>
      <form
        className="onboarding-form"
        onSubmit={(e) => {
          e.preventDefault()
          create(name)
        }}
      >
        <input autoFocus placeholder="Erstes Projekt, z. B. CFA Level I" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn primary" disabled={!name.trim()}>
          Los geht’s
        </button>
      </form>
    </div>
  )
}
