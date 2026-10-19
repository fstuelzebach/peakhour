import type { Session } from '../types'
import { weekday } from './format'

const HOUR = 3_600_000
const DAY = 24 * HOUR

export const duration = (s: Session) => s.end - s.start

export function totalsByProject(sessions: Session[]) {
  const map = new Map<string, number>()
  for (const s of sessions) map.set(s.projectId, (map.get(s.projectId) ?? 0) + duration(s))
  return map
}

/** Splits a session at local hour boundaries: [{weekday, hour, ms}] */
export function hourSlices(s: Session) {
  const out: { weekday: number; hour: number; ms: number }[] = []
  let t = s.start
  while (t < s.end) {
    const d = new Date(t)
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1).getTime()
    const until = Math.min(next, s.end)
    out.push({ weekday: weekday(d), hour: d.getHours(), ms: until - t })
    t = until
  }
  return out
}

export interface Cell {
  ms: number
  /** duration-weighted average rating, null if no time logged */
  rating: number | null
}

/** 7 × 24 grid (Mon..Sun × 0..23) of tracked time and weighted rating */
export function weekGrid(sessions: Session[]): Cell[][] {
  const ms = Array.from({ length: 7 }, () => Array(24).fill(0) as number[])
  const rw = Array.from({ length: 7 }, () => Array(24).fill(0) as number[])
  for (const s of sessions) {
    for (const sl of hourSlices(s)) {
      ms[sl.weekday][sl.hour] += sl.ms
      rw[sl.weekday][sl.hour] += sl.ms * s.rating
    }
  }
  return ms.map((row, d) => row.map((m, h) => ({ ms: m, rating: m ? rw[d][h] / m : null })))
}

interface Bucket {
  ms: number
  count: number
  ratingSum: number
}

const avg = (b: Bucket) => (b.ms ? b.ratingSum / b.ms : 0)

function bucketize<K>(sessions: Session[], key: (s: Session) => K) {
  const map = new Map<K, Bucket>()
  for (const s of sessions) {
    const k = key(s)
    const b = map.get(k) ?? { ms: 0, count: 0, ratingSum: 0 }
    b.ms += duration(s)
    b.count += 1
    b.ratingSum += duration(s) * s.rating
    map.set(k, b)
  }
  return map
}

export const DAYPARTS = [
  { id: 'early', label: 'Früh', range: '5–9 Uhr', from: 5, to: 9 },
  { id: 'morning', label: 'Vormittag', range: '9–12 Uhr', from: 9, to: 12 },
  { id: 'afternoon', label: 'Nachmittag', range: '12–17 Uhr', from: 12, to: 17 },
  { id: 'evening', label: 'Abend', range: '17–21 Uhr', from: 17, to: 21 },
  { id: 'late', label: 'Spät', range: '21–24 Uhr', from: 21, to: 24 },
  { id: 'night', label: 'Nacht', range: '0–5 Uhr', from: 0, to: 5 },
] as const

export const daypartOf = (ms: number) => {
  const h = new Date(ms).getHours()
  return DAYPARTS.find((p) => h >= p.from && h < p.to)!
}

export const LENGTHS = [
  { label: '< 30 min', max: 30 },
  { label: '30–60 min', max: 60 },
  { label: '1–1,5 h', max: 90 },
  { label: '1,5–2 h', max: 120 },
  { label: '> 2 h', max: Infinity },
]

const lengthOf = (s: Session) => LENGTHS.findIndex((l) => duration(s) / 60_000 < l.max)

export interface Ranked<T> {
  key: T
  ms: number
  count: number
  rating: number
}

function ranked<K>(map: Map<K, Bucket>, minCount: number): Ranked<K>[] {
  return [...map.entries()]
    .filter(([, b]) => b.count >= minCount)
    .map(([key, b]) => ({ key, ms: b.ms, count: b.count, rating: avg(b) }))
    .sort((a, b) => b.rating - a.rating || b.ms - a.ms)
}

/** Consecutive days (ending today or yesterday) with at least one session */
export function streak(sessions: Session[], now = Date.now()) {
  const days = new Set(sessions.map((s) => new Date(s.start).toDateString()))
  let n = 0
  const d = new Date(now)
  if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1)
  while (days.has(d.toDateString())) {
    n++
    d.setDate(d.getDate() - 1)
  }
  return n
}

export function insights(sessions: Session[], now = Date.now()) {
  const minCount = sessions.length >= 12 ? 2 : 1
  const byWindow = ranked(
    bucketize(sessions, (s) => `${weekday(new Date(s.start))}|${daypartOf(s.start).id}`),
    minCount,
  ).map((r) => {
    const [d, p] = r.key.split('|')
    return { ...r, weekday: Number(d), daypart: DAYPARTS.find((x) => x.id === p)! }
  })
  const byDaypart = ranked(bucketize(sessions, (s) => daypartOf(s.start).id), 1).map((r) => ({
    ...r,
    daypart: DAYPARTS.find((x) => x.id === r.key)!,
  }))
  const byWeekday = bucketize(sessions, (s) => weekday(new Date(s.start)))
  const byLength = ranked(bucketize(sessions, lengthOf), minCount).map((r) => ({ ...r, label: LENGTHS[r.key].label }))

  const first = sessions.reduce((m, s) => Math.min(m, s.start), Infinity)
  const spanDays = Number.isFinite(first) ? (now - first) / DAY : 0
  // "never" only means something once every weekday had a chance at least twice
  const neverWeekdays = spanDays >= 14 ? [0, 1, 2, 3, 4, 5, 6].filter((d) => !byWeekday.has(d)) : []

  const weekStart = new Date(now)
  weekStart.setHours(0, 0, 0, 0)
  weekStart.setDate(weekStart.getDate() - weekday(weekStart))
  const thisWeek = sessions.filter((s) => s.start >= weekStart.getTime()).reduce((a, s) => a + duration(s), 0)

  const weekdayTotals = [0, 1, 2, 3, 4, 5, 6].map((d) => {
    const b = byWeekday.get(d)
    return { weekday: d, ms: b?.ms ?? 0, rating: b ? avg(b) : null }
  })

  return {
    bestWindows: byWindow.slice(0, 3),
    worstWindow: byWindow.length > 3 ? byWindow[byWindow.length - 1] : undefined,
    byDaypart,
    byLength,
    weekdayTotals,
    neverWeekdays,
    streak: streak(sessions, now),
    thisWeek,
    avgRating: sessions.length
      ? sessions.reduce((a, s) => a + s.rating * duration(s), 0) / sessions.reduce((a, s) => a + duration(s), 0)
      : null,
  }
}
