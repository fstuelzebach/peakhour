import { describe, expect, it } from 'vitest'
import type { Session } from '../types'
import { duration, hourSlices, insights, streak, totalsByProject, weekGrid, weekStart, weeklyHistory } from './stats'
import { timerElapsed } from '../db'

const at = (y: number, mo: number, d: number, h: number, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime()

let n = 0
const sess = (start: number, minutes: number, rating: number, projectId = 'cfa'): Session => ({
  id: String(n++),
  projectId,
  start,
  end: start + minutes * 60_000,
  rating,
  ratingKind: 'slider',
  tzOffset: 120,
})

describe('hourSlices', () => {
  it('splits a session across hour boundaries', () => {
    // Monday 2026-10-19 09:30 → 11:15
    const s = sess(at(2026, 10, 19, 9, 30), 105, 80)
    const slices = hourSlices(s)
    expect(slices.map((x) => [x.weekday, x.hour, x.ms / 60_000])).toEqual([
      [0, 9, 30],
      [0, 10, 60],
      [0, 11, 15],
    ])
  })

  it('crosses midnight into the next weekday', () => {
    const s = sess(at(2026, 10, 25, 23, 30), 60, 50) // Sunday 23:30
    expect(hourSlices(s).map((x) => [x.weekday, x.hour])).toEqual([
      [6, 23],
      [0, 0],
    ])
  })
})

describe('aggregation', () => {
  const data = [
    sess(at(2026, 10, 19, 8), 60, 90), // Mon morning
    sess(at(2026, 10, 19, 20), 30, 30), // Mon evening
    sess(at(2026, 10, 20, 8), 120, 70, 'other'), // Tue morning
  ]

  it('totals per project', () => {
    const t = totalsByProject(data)
    expect(t.get('cfa')! / 60_000).toBe(90)
    expect(t.get('other')! / 60_000).toBe(120)
  })

  it('weights ratings by duration in the grid', () => {
    const g = weekGrid([sess(at(2026, 10, 19, 8), 60, 100), sess(at(2026, 10, 19, 8, 30), 30, 0)])
    expect(g[0][8].ms / 60_000).toBe(90)
    expect(g[0][8].rating).toBeCloseTo(66.67, 1)
  })

  it('ranks windows by rating', () => {
    const ins = insights(data, at(2026, 10, 21, 12))
    expect(ins.bestWindows[0].weekday).toBe(0)
    expect(ins.bestWindows[0].daypart.id).toBe('early')
    expect(ins.neverWeekdays).toEqual([]) // span < 14 days → no claims
  })

  it('reports never-used weekdays once there is enough history', () => {
    const long = [sess(at(2026, 10, 1, 9), 60, 50), ...data]
    expect(insights(long, at(2026, 10, 21, 12)).neverWeekdays).toContain(6)
  })

  it('counts the streak up to today or yesterday', () => {
    expect(streak(data, at(2026, 10, 21, 12))).toBe(2)
    expect(streak(data, at(2026, 10, 23, 12))).toBe(0)
  })
})

describe('pauses', () => {
  it('excludes paused time from duration and spreads it over hour slices', () => {
    const s = { ...sess(at(2026, 10, 19, 9), 120, 80), pausedMs: 30 * 60_000 }
    expect(duration(s) / 60_000).toBe(90)
    const slices = hourSlices(s)
    expect(slices.reduce((a, x) => a + x.ms, 0) / 60_000).toBe(90)
    expect(totalsByProject([s]).get('cfa')! / 60_000).toBe(90)
  })

  it('computes live elapsed time for running, paused and stopped timers', () => {
    const start = at(2026, 10, 19, 9)
    const min = 60_000
    expect(timerElapsed({ key: 'active', projectId: 'p', start }, start + 10 * min)).toBe(10 * min)
    expect(timerElapsed({ key: 'active', projectId: 'p', start, pausedAt: start + 10 * min }, start + 25 * min)).toBe(10 * min)
    expect(timerElapsed({ key: 'active', projectId: 'p', start, pausedMs: 5 * min }, start + 25 * min)).toBe(20 * min)
    expect(timerElapsed({ key: 'active', projectId: 'p', start, pausedMs: 5 * min, end: start + 30 * min }, start + 99 * min)).toBe(25 * min)
  })
})

describe('weekly goals', () => {
  it('starts weeks on Monday', () => {
    expect(weekStart(at(2026, 10, 25, 22))).toBe(at(2026, 10, 19, 0)) // Sunday → Monday before
    expect(weekStart(at(2026, 10, 19, 0, 1), 1)).toBe(at(2026, 10, 12, 0))
  })

  it('builds per-week history for one project', () => {
    const data = [
      sess(at(2026, 10, 13, 8), 60, 50), // last week
      sess(at(2026, 10, 20, 8), 90, 50), // this week
      sess(at(2026, 10, 20, 12), 30, 50, 'other'),
    ]
    const h = weeklyHistory(data, 'cfa', at(2026, 10, 21, 12), 3)
    expect(h.map((w) => w.ms / 60_000)).toEqual([0, 60, 90])
  })
})
