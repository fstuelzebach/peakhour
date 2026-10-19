import Dexie, { type EntityTable } from 'dexie'
import type { ActiveTimer, Project, Session } from './types'

export const db = new Dexie('peakhour') as Dexie & {
  projects: EntityTable<Project, 'id'>
  sessions: EntityTable<Session, 'id'>
  timer: EntityTable<ActiveTimer, 'key'>
}

db.version(1).stores({
  projects: 'id, createdAt',
  sessions: 'id, projectId, start',
  timer: 'key',
})

export const uid = () => crypto.randomUUID()

// Validated categorical order (colorblind-safe adjacent pairs); assigned in order, never cycled into new hues
export const PROJECT_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948']

export async function startTimer(projectId: string) {
  await db.timer.put({ key: 'active', projectId, start: Date.now() })
}

export async function pauseTimer() {
  const t = await db.timer.get('active')
  if (t && !t.end && !t.pausedAt) await db.timer.put({ ...t, pausedAt: Date.now() })
}

export async function resumeTimer() {
  const t = await db.timer.get('active')
  if (!t || t.end || !t.pausedAt) return
  const { pausedAt, ...rest } = t
  await db.timer.put({ ...rest, pausedMs: (t.pausedMs ?? 0) + Date.now() - pausedAt })
}

/** Stopping while paused ends the session at the moment the pause began. */
export async function stopTimer() {
  const t = await db.timer.get('active')
  if (!t || t.end) return
  const { pausedAt, ...rest } = t
  await db.timer.put({ ...rest, end: pausedAt ?? Date.now() })
}

/** Net elapsed time of the active timer at `now`. */
export function timerElapsed(t: ActiveTimer, now: number) {
  return (t.end ?? t.pausedAt ?? now) - t.start - (t.pausedMs ?? 0)
}

export async function discardTimer() {
  await db.timer.delete('active')
}

export async function saveSession(s: Omit<Session, 'id' | 'tzOffset'>) {
  const tzOffset = -new Date(s.start).getTimezoneOffset()
  await db.transaction('rw', db.sessions, db.timer, async () => {
    await db.sessions.add({ ...s, id: uid(), tzOffset })
    await db.timer.delete('active')
  })
}

export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist()
    }
  } catch {
    /* not supported */
  }
}
