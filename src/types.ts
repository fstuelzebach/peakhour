export interface Project {
  id: string
  name: string
  color: string
  createdAt: number
  archived: boolean
  /** optional weekly target in hours */
  weeklyGoalHours?: number
}

export type RatingKind = 'smiley' | 'slider'

export interface Session {
  id: string
  projectId: string
  /** epoch ms */
  start: number
  /** epoch ms */
  end: number
  /** total paused time within start..end; net duration = end - start - pausedMs */
  pausedMs?: number
  /** 0–100 */
  rating: number
  ratingKind: RatingKind
  comment?: string
  /** minutes east of UTC at session start, e.g. +120 for CEST */
  tzOffset: number
}

/** The running (or stopped-but-unrated) timer. Persisted so it survives app kills. */
export interface ActiveTimer {
  key: 'active'
  projectId: string
  start: number
  /** set while paused */
  pausedAt?: number
  /** accumulated pause time of completed pauses */
  pausedMs?: number
  /** set once Stop was pressed; the rating sheet is pending */
  end?: number
}
