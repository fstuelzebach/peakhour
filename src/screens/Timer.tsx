import { useMemo, useState, type CSSProperties } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { PROJECT_COLORS, db, discardTimer, saveSession, startTimer, stopTimer, uid } from '../db'
import { clock, hours, timeOfDay } from '../lib/format'
import { useNow } from '../lib/useNow'
import { SessionSheet } from '../components/SessionSheet'

const LAST_PROJECT = 'peakhour:lastProject'

export function Timer() {
  const projects = useLiveQuery(() => db.projects.orderBy('createdAt').filter((p) => !p.archived).toArray(), [])
  const timer = useLiveQuery(() => db.timer.get('active'), [])
  const todayMs = useLiveQuery(async () => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    const list = await db.sessions.where('start').aboveOrEqual(d.getTime()).toArray()
    return list.reduce((a, s) => a + s.end - s.start, 0)
  }, [])

  const [selected, setSelected] = useState<string | null>(() => localStorage.getItem(LAST_PROJECT))
  const running = !!timer && !timer.end
  const now = useNow(1000, running)

  const validSelected = projects?.some((p) => p.id === selected) ? selected : projects?.[0]?.id
  const activeId = timer?.projectId ?? validSelected
  const project = projects?.find((p) => p.id === activeId)
  const color = project?.color ?? PROJECT_COLORS[0]

  const draft = useMemo(
    () => (timer?.end ? { projectId: timer.projectId, start: timer.start, end: timer.end } : null),
    [timer],
  )

  if (projects === undefined) return null
  if (projects.length === 0) return <FirstProject />

  const toggle = async () => {
    if (running) {
      navigator.vibrate?.(20)
      await stopTimer()
    } else if (project) {
      localStorage.setItem(LAST_PROJECT, project.id)
      navigator.vibrate?.(10)
      await startTimer(project.id)
    }
  }

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

      <div className="timer-center">
        <div className="timer-clock">{clock(running ? now - timer!.start : 0)}</div>
        <div className="timer-sub muted">
          {running ? `${project?.name} · seit ${timeOfDay(timer!.start)}` : `Heute: ${hours(todayMs ?? 0)}`}
        </div>

        <button className={`big-button ${running ? 'running' : ''}`} onClick={toggle} aria-label={running ? 'Stop' : 'Start'}>
          <span className="big-icon">{running ? <span className="stop-square" /> : <span className="play-triangle" />}</span>
          <span className="big-label">{running ? 'Stop' : 'Start'}</span>
        </button>
      </div>

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
