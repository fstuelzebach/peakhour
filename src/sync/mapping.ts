import type { ActiveTimer, Project, Session } from '../types'

export type TableName = 'projects' | 'sessions' | 'timer'

/** Server-side table name per local table */
export const REMOTE_TABLE: Record<TableName, string> = {
  projects: 'projects',
  sessions: 'sessions',
  timer: 'timers',
}

export interface RemoteRow {
  id: string
  client_updated_at: number
  deleted: boolean
  updated_at?: string
  [col: string]: unknown
}

const iso = (ms?: number) => (ms == null ? null : new Date(ms).toISOString())
const ms = (v: unknown) => (v == null ? undefined : Date.parse(v as string))
const num = (v: unknown) => (v == null ? undefined : Number(v))

type Local = Project | Session | ActiveTimer

export function toRow(table: TableName, o: Local): RemoteRow {
  const base = { client_updated_at: o.updatedAt ?? 0, deleted: false }
  switch (table) {
    case 'projects': {
      const p = o as Project
      return {
        ...base,
        id: p.id,
        name: p.name,
        color: p.color,
        archived: p.archived,
        weekly_goal_hours: p.weeklyGoalHours ?? null,
        created_at: iso(p.createdAt),
      }
    }
    case 'sessions': {
      const s = o as Session
      return {
        ...base,
        id: s.id,
        project_id: s.projectId,
        start_at: iso(s.start),
        end_at: iso(s.end),
        paused_ms: s.pausedMs ?? 0,
        rating: s.rating,
        rating_kind: s.ratingKind,
        comment: s.comment ?? null,
        tz_offset: s.tzOffset,
      }
    }
    case 'timer': {
      const t = o as ActiveTimer
      return {
        ...base,
        id: t.key,
        project_id: t.projectId,
        start_at: iso(t.start),
        paused_at: iso(t.pausedAt),
        paused_ms: t.pausedMs ?? 0,
        end_at: iso(t.end),
      }
    }
  }
}

export function fromRow(table: TableName, r: RemoteRow): Local {
  const updatedAt = Number(r.client_updated_at)
  switch (table) {
    case 'projects':
      return {
        id: r.id,
        name: r.name as string,
        color: r.color as string,
        archived: !!r.archived,
        weeklyGoalHours: num(r.weekly_goal_hours),
        createdAt: ms(r.created_at) ?? updatedAt,
        updatedAt,
      } satisfies Project
    case 'sessions':
      return {
        id: r.id,
        projectId: r.project_id as string,
        start: ms(r.start_at)!,
        end: ms(r.end_at)!,
        pausedMs: num(r.paused_ms) || undefined,
        rating: Number(r.rating),
        ratingKind: r.rating_kind as Session['ratingKind'],
        comment: (r.comment as string | null) ?? undefined,
        tzOffset: Number(r.tz_offset),
        updatedAt,
      } satisfies Session
    case 'timer':
      return {
        key: 'active',
        projectId: r.project_id as string,
        start: ms(r.start_at)!,
        pausedAt: ms(r.paused_at),
        pausedMs: num(r.paused_ms) || undefined,
        end: ms(r.end_at),
        updatedAt,
      } satisfies ActiveTimer
  }
}

export const tombstone = (id: string, at: number): RemoteRow => ({ id, client_updated_at: at, deleted: true })
