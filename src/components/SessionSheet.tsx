import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { RatingKind } from '../types'
import { clock, fromLocalInput, toLocalInput } from '../lib/format'
import { Sheet } from './Sheet'
import { RatingInput } from './RatingInput'

export interface SessionDraft {
  projectId: string
  start: number
  end: number
  pausedMs?: number
  rating?: number
  ratingKind?: RatingKind
  comment?: string
}

interface Props {
  open: boolean
  mode: 'rate' | 'edit' | 'new'
  draft: SessionDraft
  onSave: (s: Required<Omit<SessionDraft, 'comment' | 'pausedMs'>> & { comment?: string; pausedMs?: number }) => void
  onCancel?: () => void
  /** "Verwerfen" in rate mode, "Löschen" in edit mode */
  onDelete?: () => void
}

const TITLES = { rate: 'Wie lief’s?', edit: 'Session bearbeiten', new: 'Session nachtragen' }

export function SessionSheet({ open, mode, draft, onSave, onCancel, onDelete }: Props) {
  const projects = useLiveQuery(() => db.projects.orderBy('createdAt').toArray(), [])
  const [projectId, setProjectId] = useState(draft.projectId)
  const [start, setStart] = useState(draft.start)
  const [end, setEnd] = useState(draft.end)
  const [rating, setRating] = useState<number | null>(draft.rating ?? null)
  const [kind, setKind] = useState<RatingKind>(draft.ratingKind ?? 'smiley')
  const [comment, setComment] = useState(draft.comment ?? '')
  const [editTimes, setEditTimes] = useState(mode !== 'rate')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [pauseMin, setPauseMin] = useState(Math.round((draft.pausedMs ?? 0) / 60_000))

  const project = projects?.find((p) => p.id === projectId)
  // keep the exact paused ms unless the user edited the minutes
  const pausedMs = pauseMin === Math.round((draft.pausedMs ?? 0) / 60_000) ? (draft.pausedMs ?? 0) : pauseMin * 60_000
  const net = end - start - pausedMs
  const valid = rating !== null && net > 0 && !!projectId

  return (
    <Sheet open={open} onClose={mode === 'rate' ? undefined : onCancel}>
      <div className="sheet-head">
        <span className="dot" style={{ background: project?.color }} />
        <span className="muted">{project?.name}</span>
        <span className="sheet-duration">
          {clock(net)}
          {pausedMs >= 60_000 && <span className="muted"> + {Math.round(pausedMs / 60_000)} min Pause</span>}
        </span>
      </div>
      <h2>{TITLES[mode]}</h2>

      <RatingInput
        value={rating}
        onChange={(v, k) => {
          setRating(v)
          setKind(k)
        }}
      />

      <textarea
        className="comment"
        placeholder="Kommentar (optional): Ort, Stimmung, Ablenkungen …"
        value={comment}
        rows={2}
        onChange={(e) => setComment(e.target.value)}
      />

      {editTimes ? (
        <div className="fields">
          {mode !== 'rate' && (
            <label>
              Projekt
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                {projects?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Start
            <input type="datetime-local" value={toLocalInput(start)} onChange={(e) => e.target.value && setStart(fromLocalInput(e.target.value))} />
          </label>
          <label>
            Ende
            <input type="datetime-local" value={toLocalInput(end)} onChange={(e) => e.target.value && setEnd(fromLocalInput(e.target.value))} />
          </label>
          <label>
            Pause (min)
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={pauseMin}
              onChange={(e) => setPauseMin(Math.max(0, Number(e.target.value) || 0))}
            />
          </label>
          {net <= 0 && <p className="error">Ende muss nach Start plus Pause liegen.</p>}
        </div>
      ) : (
        <button type="button" className="link" onClick={() => setEditTimes(true)}>
          Zeiten korrigieren
        </button>
      )}

      <div className="sheet-actions">
        {onDelete &&
          (confirmDelete ? (
            <button type="button" className="btn danger" onClick={onDelete}>
              Wirklich {mode === 'rate' ? 'verwerfen' : 'löschen'}?
            </button>
          ) : (
            <button type="button" className="btn ghost" onClick={() => setConfirmDelete(true)}>
              {mode === 'rate' ? 'Verwerfen' : 'Löschen'}
            </button>
          ))}
        {onCancel && mode !== 'rate' && (
          <button type="button" className="btn ghost" onClick={onCancel}>
            Abbrechen
          </button>
        )}
        <button
          type="button"
          className="btn primary"
          disabled={!valid}
          style={{ background: project?.color }}
          onClick={() => valid && onSave({ projectId, start, end, pausedMs: pausedMs || undefined, rating: rating!, ratingKind: kind, comment: comment.trim() || undefined })}
        >
          Speichern
        </button>
      </div>
    </Sheet>
  )
}
