import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { PROJECT_COLORS, db, uid } from '../db'
import type { Project } from '../types'
import { hours } from '../lib/format'
import { exportAs, importJson } from '../lib/export'
import { totalsByProject } from '../lib/stats'
import { Sheet } from '../components/Sheet'

export function Projects() {
  const projects = useLiveQuery(() => db.projects.orderBy('createdAt').toArray(), [])
  const totals = useLiveQuery(async () => totalsByProject(await db.sessions.toArray()), [])
  const [editing, setEditing] = useState<Project | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const newProject = () => {
    const used = new Set(projects?.filter((p) => !p.archived).map((p) => p.color))
    const color = PROJECT_COLORS.find((c) => !used.has(c)) ?? PROJECT_COLORS[(projects?.length ?? 0) % PROJECT_COLORS.length]
    setEditing({ id: '', name: '', color, createdAt: Date.now(), archived: false })
  }

  const active = projects?.filter((p) => !p.archived) ?? []
  const archived = projects?.filter((p) => p.archived) ?? []

  const flash = (m: string) => {
    setMsg(m)
    setTimeout(() => setMsg(null), 3000)
  }

  return (
    <div className="screen">
      <header className="screen-head">
        <h1>Projekte</h1>
        <button className="btn small" onClick={newProject}>
          + Neu
        </button>
      </header>

      <div className="card list">
        {active.map((p) => (
          <ProjectRow key={p.id} p={p} ms={totals?.get(p.id) ?? 0} onClick={() => setEditing(p)} />
        ))}
        {active.length === 0 && <p className="muted small pad">Keine aktiven Projekte.</p>}
      </div>

      {archived.length > 0 && (
        <>
          <h4 className="section-label">Archiviert</h4>
          <div className="card list faded">
            {archived.map((p) => (
              <ProjectRow key={p.id} p={p} ms={totals?.get(p.id) ?? 0} onClick={() => setEditing(p)} />
            ))}
          </div>
        </>
      )}

      <h4 className="section-label">Daten</h4>
      <div className="card list">
        <button className="row" onClick={() => exportAs('json')}>
          <span className="row-main">
            <span className="row-title">Export als JSON</span>
            <span className="row-sub muted">Ideal für AI und Python-Analyse</span>
          </span>
          <span className="chev">↗</span>
        </button>
        <button className="row" onClick={() => exportAs('csv')}>
          <span className="row-main">
            <span className="row-title">Export als CSV</span>
            <span className="row-sub muted">Für Excel, Numbers und Sheets</span>
          </span>
          <span className="chev">↗</span>
        </button>
        <button className="row" onClick={() => fileRef.current?.click()}>
          <span className="row-main">
            <span className="row-title">JSON importieren</span>
            <span className="row-sub muted">Backup wiederherstellen und zusammenführen</span>
          </span>
          <span className="chev">↙</span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            try {
              const r = await importJson(await f.text())
              flash(`Importiert: ${r.projects} Projekte, ${r.sessions} Sessions`)
            } catch (err) {
              flash(`Import fehlgeschlagen: ${(err as Error).message}`)
            }
          }}
        />
      </div>
      {msg && <p className="toast">{msg}</p>}
      <p className="muted small footnote">
        Deine Daten bleiben nur auf diesem Gerät. Exportiere regelmäßig als Backup.
      </p>

      <ProjectSheet project={editing} onClose={() => setEditing(null)} />
    </div>
  )
}

function ProjectRow({ p, ms, onClick }: { p: Project; ms: number; onClick: () => void }) {
  return (
    <button className="row" onClick={onClick}>
      <span className="dot big" style={{ background: p.color }} />
      <span className="row-main">
        <span className="row-title">{p.name}</span>
        {p.weeklyGoalHours ? <span className="row-sub muted">Ziel: {p.weeklyGoalHours} h / Woche</span> : null}
      </span>
      <span className="row-dur muted">{hours(ms)} gesamt</span>
      <span className="chev">›</span>
    </button>
  )
}

function ProjectSheet({ project, onClose }: { project: Project | null; onClose: () => void }) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(PROJECT_COLORS[0])
  const [goal, setGoal] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [lastId, setLastId] = useState<Project | null>(null)

  // reset form state whenever a different project is opened
  if (project !== lastId) {
    setLastId(project)
    if (project) {
      setName(project.name)
      setColor(project.color)
      setGoal(project.weeklyGoalHours ? String(project.weeklyGoalHours) : '')
      setConfirm(false)
    }
  }

  if (!project) return null
  const isNew = !project.id

  const save = async () => {
    if (!name.trim()) return
    const g = parseFloat(goal.replace(',', '.'))
    const weeklyGoalHours = g > 0 ? Math.round(g * 2) / 2 : undefined
    if (isNew) await db.projects.add({ ...project, id: uid(), name: name.trim(), color, weeklyGoalHours })
    else await db.projects.update(project.id, { name: name.trim(), color, weeklyGoalHours })
    onClose()
  }

  return (
    <Sheet open onClose={onClose}>
      <h2>{isNew ? 'Neues Projekt' : 'Projekt bearbeiten'}</h2>
      <input className="text-input" autoFocus={isNew} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="swatches">
        {PROJECT_COLORS.map((c) => (
          <button key={c} className={`swatch ${c === color ? 'on' : ''}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={c} />
        ))}
      </div>
      <label className="goal-field">
        <span>
          Wochenziel
          <span className="muted small"> optional</span>
        </span>
        <span className="goal-stepper">
          <button type="button" onClick={() => setGoal(String(Math.max(0, (parseFloat(goal.replace(',', '.')) || 0) - 1)))}>
            −
          </button>
          <input
            inputMode="decimal"
            placeholder="–"
            value={goal}
            onChange={(e) => setGoal(e.target.value.replace(/[^\d.,]/g, ''))}
          />
          <span className="muted">h</span>
          <button type="button" onClick={() => setGoal(String((parseFloat(goal.replace(',', '.')) || 0) + 1))}>
            +
          </button>
        </span>
      </label>
      <div className="sheet-actions">
        {!isNew && (
          <button
            className="btn ghost"
            onClick={async () => {
              await db.projects.update(project.id, { archived: !project.archived })
              onClose()
            }}
          >
            {project.archived ? 'Reaktivieren' : 'Archivieren'}
          </button>
        )}
        {!isNew &&
          project.archived &&
          (confirm ? (
            <button
              className="btn danger"
              onClick={async () => {
                await db.transaction('rw', db.projects, db.sessions, async () => {
                  await db.sessions.where('projectId').equals(project.id).delete()
                  await db.projects.delete(project.id)
                })
                onClose()
              }}
            >
              Inkl. Sessions löschen?
            </button>
          ) : (
            <button className="btn ghost" onClick={() => setConfirm(true)}>
              Löschen
            </button>
          ))}
        <button className="btn primary" style={{ background: color }} disabled={!name.trim()} onClick={save}>
          Speichern
        </button>
      </div>
    </Sheet>
  )
}
