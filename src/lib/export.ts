import { db, uid } from '../db'
import type { Project, Session } from '../types'
import { WEEKDAYS_LONG, isoLocal, weekday } from './format'

export const EXPORT_VERSION = 1

export async function buildExport() {
  const [projects, sessions] = await Promise.all([db.projects.toArray(), db.sessions.orderBy('start').toArray()])
  const names = new Map(projects.map((p) => [p.id, p.name]))
  return {
    app: 'peakhour',
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      archived: p.archived,
      createdAt: new Date(p.createdAt).toISOString(),
    })),
    sessions: sessions.map((s) => ({
      id: s.id,
      projectId: s.projectId,
      project: names.get(s.projectId) ?? null,
      start: isoLocal(s.start, s.tzOffset),
      end: isoLocal(s.end, s.tzOffset),
      durationMin: Math.round((s.end - s.start) / 600) / 100,
      weekday: WEEKDAYS_LONG[weekday(new Date(s.start))],
      rating: s.rating,
      ratingKind: s.ratingKind,
      comment: s.comment ?? '',
    })),
  }
}

type Export = Awaited<ReturnType<typeof buildExport>>

const csvCell = (v: unknown) => {
  const s = String(v ?? '')
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(data: Export) {
  const cols = ['start', 'end', 'durationMin', 'weekday', 'project', 'rating', 'ratingKind', 'comment', 'id', 'projectId'] as const
  const rows = data.sessions.map((s) => cols.map((c) => csvCell(s[c])).join(','))
  return [cols.join(','), ...rows].join('\n')
}

/** Opens the iOS share sheet (Mail, AirDrop, Files, …) or falls back to a download. */
export async function shareFile(name: string, content: string, type: string) {
  const file = new File([content], name, { type })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name })
      return
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function exportAs(format: 'json' | 'csv') {
  const data = await buildExport()
  const stamp = new Date().toISOString().slice(0, 10)
  if (format === 'json') {
    await shareFile(`peakhour-export-${stamp}.json`, JSON.stringify(data, null, 2), 'application/json')
  } else {
    await shareFile(`peakhour-export-${stamp}.csv`, toCsv(data), 'text/csv')
  }
}

/** Merges a JSON export back in (by id; existing records are overwritten). */
export async function importJson(text: string) {
  const data = JSON.parse(text) as Export
  if (data.app !== 'peakhour') throw new Error('Keine Peakhour-Exportdatei')
  const projects: Project[] = data.projects.map((p) => ({
    id: p.id ?? uid(),
    name: p.name,
    color: p.color,
    archived: !!p.archived,
    createdAt: Date.parse(p.createdAt),
  }))
  const sessions: Session[] = data.sessions.map((s) => {
    const m = /([+-])(\d\d):(\d\d)$/.exec(s.start)
    const tzOffset = m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0
    return {
      id: s.id ?? uid(),
      projectId: s.projectId,
      start: Date.parse(s.start),
      end: Date.parse(s.end),
      rating: s.rating,
      ratingKind: s.ratingKind,
      comment: s.comment || undefined,
      tzOffset,
    }
  })
  await db.transaction('rw', db.projects, db.sessions, async () => {
    await db.projects.bulkPut(projects)
    await db.sessions.bulkPut(sessions)
  })
  return { projects: projects.length, sessions: sessions.length }
}
