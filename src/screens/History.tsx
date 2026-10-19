import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, uid } from '../db'
import type { Session } from '../types'
import { clock, dateLabel, hours, smileyFor, timeOfDay } from '../lib/format'
import { SessionSheet, type SessionDraft } from '../components/SessionSheet'
import { duration } from '../lib/stats'

type Editing = { mode: 'edit'; session: Session } | { mode: 'new'; draft: SessionDraft } | null

export function History() {
  const sessions = useLiveQuery(() => db.sessions.orderBy('start').reverse().toArray(), [])
  const projects = useLiveQuery(() => db.projects.toArray(), [])
  const [editing, setEditing] = useState<Editing>(null)

  const byId = useMemo(() => new Map(projects?.map((p) => [p.id, p])), [projects])
  const groups = useMemo(() => {
    const map = new Map<string, Session[]>()
    for (const s of sessions ?? []) {
      const k = new Date(s.start).toDateString()
      map.set(k, [...(map.get(k) ?? []), s])
    }
    return [...map.values()]
  }, [sessions])

  const draft = useMemo<SessionDraft | null>(() => {
    if (!editing) return null
    if (editing.mode === 'new') return editing.draft
    return editing.session
  }, [editing])

  const addNew = () => {
    const end = Date.now()
    const firstActive = projects?.find((p) => !p.archived)
    if (!firstActive) return
    setEditing({ mode: 'new', draft: { projectId: firstActive.id, start: end - 3_600_000, end } })
  }

  return (
    <div className="screen">
      <header className="screen-head">
        <h1>Verlauf</h1>
        <button className="btn small" onClick={addNew} disabled={!projects?.some((p) => !p.archived)}>
          + Nachtragen
        </button>
      </header>

      {sessions?.length === 0 && <p className="empty muted">Noch keine Sessions. Drück auf Start!</p>}

      {groups.map((list) => {
        const total = list.reduce((a, s) => a + duration(s), 0)
        return (
          <section key={list[0].start} className="day">
            <div className="day-head">
              <span>{dateLabel(list[0].start)}</span>
              <span className="muted">{hours(total)}</span>
            </div>
            <div className="card list">
              {list.map((s) => {
                const p = byId.get(s.projectId)
                return (
                  <button key={s.id} className="row" onClick={() => setEditing({ mode: 'edit', session: s })}>
                    <span className="dot" style={{ background: p?.color }} />
                    <span className="row-main">
                      <span className="row-title">{p?.name ?? 'Gelöschtes Projekt'}</span>
                      <span className="row-sub muted">
                        {timeOfDay(s.start)}–{timeOfDay(s.end)}
                        {s.pausedMs && s.pausedMs >= 60_000 ? ` · ${hours(s.pausedMs)} Pause` : ''}
                        {s.comment ? ` · ${s.comment}` : ''}
                      </span>
                    </span>
                    <span className="row-end">
                      <span className="row-dur">{clock(duration(s))}</span>
                      <span className="row-emoji" title={String(s.rating)}>
                        {smileyFor(s.rating).emoji}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}

      {draft && editing && (
        <SessionSheet
          key={editing.mode === 'edit' ? editing.session.id : 'new'}
          open
          mode={editing.mode}
          draft={draft}
          onCancel={() => setEditing(null)}
          onDelete={
            editing.mode === 'edit'
              ? async () => {
                  await db.sessions.delete(editing.session.id)
                  setEditing(null)
                }
              : undefined
          }
          onSave={async (s) => {
            const tzOffset = -new Date(s.start).getTimezoneOffset()
            if (editing.mode === 'edit') await db.sessions.put({ ...editing.session, ...s, tzOffset })
            else await db.sessions.add({ ...s, id: uid(), tzOffset })
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}
