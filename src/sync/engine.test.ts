import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, startTimer, stopTimer } from '../db'
import { installSyncHooks, markAllDirty, pendingCount, resetSyncState, syncNow, type Remote } from './engine'
import type { RemoteRow } from './mapping'

/** In-memory stand-in for Supabase: upsert by id, server clock for the cursor. */
class FakeRemote implements Remote {
  tables = new Map<string, Map<string, RemoteRow>>()
  clock = 0
  private t(name: string) {
    if (!this.tables.has(name)) this.tables.set(name, new Map())
    return this.tables.get(name)!
  }
  async pull(table: string, since: string | null) {
    return [...this.t(table).values()]
      .filter((r) => since === null || r.updated_at! > since)
      .sort((a, b) => a.updated_at!.localeCompare(b.updated_at!))
  }
  async upsert(table: string, rows: RemoteRow[]) {
    for (const r of rows) this.write(table, r)
  }
  /** what another device would do */
  write(table: string, r: RemoteRow) {
    const t = this.t(table)
    t.set(r.id, { ...t.get(r.id), ...r, updated_at: String(++this.clock).padStart(10, '0') })
  }
  rows(table: string) {
    return [...this.t(table).values()]
  }
}

installSyncHooks()

const project = (id: string, name: string) => ({ id, name, color: '#2a78d6', createdAt: 1, archived: false })

describe('sync engine', () => {
  let remote: FakeRemote

  beforeEach(async () => {
    await Promise.all([db.projects.clear(), db.sessions.clear(), db.timer.clear()])
    resetSyncState()
    remote = new FakeRemote()
  })

  it('pushes local creates, updates and deletes', async () => {
    await db.projects.add(project('p1', 'CFA'))
    await db.projects.add(project('p2', 'Tmp'))
    expect(pendingCount()).toBe(2)
    await syncNow(remote)
    expect(pendingCount()).toBe(0)
    expect(remote.rows('projects').map((r) => r.name)).toEqual(['CFA', 'Tmp'])

    await db.projects.update('p1', { weeklyGoalHours: 15 })
    await db.projects.delete('p2')
    await syncNow(remote)
    const byId = Object.fromEntries(remote.rows('projects').map((r) => [r.id, r]))
    expect(byId.p1.weekly_goal_hours).toBe(15)
    expect(byId.p2.deleted).toBe(true)
  })

  it('pulls changes from other devices without re-queuing them', async () => {
    remote.write('projects', { id: 'p9', name: 'Spanisch', color: '#000', archived: false, client_updated_at: 5, deleted: false })
    remote.write('sessions', {
      id: 's1',
      project_id: 'p9',
      start_at: '2026-10-19T07:00:00.000Z',
      end_at: '2026-10-19T08:00:00.000Z',
      paused_ms: 600000,
      rating: 80,
      rating_kind: 'smiley',
      tz_offset: 120,
      client_updated_at: 5,
      deleted: false,
    })
    const r = await syncNow(remote)
    expect(r.pulled).toBe(2)
    expect(pendingCount()).toBe(0)
    const s = await db.sessions.get('s1')
    expect(s?.pausedMs).toBe(600000)
    expect(s!.end - s!.start).toBe(3_600_000)

    remote.write('sessions', { id: 's1', client_updated_at: 9, deleted: true })
    await syncNow(remote)
    expect(await db.sessions.get('s1')).toBeUndefined()
  })

  it('last write wins on conflicts', async () => {
    await db.projects.add(project('p1', 'CFA'))
    await syncNow(remote)

    // remote edit older than a pending local edit → local wins
    await db.projects.update('p1', { name: 'CFA Level I' })
    remote.write('projects', { ...remote.rows('projects')[0], name: 'Old name', client_updated_at: 1 })
    await syncNow(remote)
    expect((await db.projects.get('p1'))?.name).toBe('CFA Level I')
    expect(remote.rows('projects')[0].name).toBe('CFA Level I')

    // newer remote edit → remote wins
    remote.write('projects', { ...remote.rows('projects')[0], name: 'From iPhone', client_updated_at: Date.now() + 10_000 })
    await syncNow(remote)
    expect((await db.projects.get('p1'))?.name).toBe('From iPhone')
  })

  it('syncs the running timer so another device can stop it', async () => {
    await db.projects.add(project('p1', 'CFA'))
    await startTimer('p1')
    await syncNow(remote)
    const row = remote.rows('timers')[0]
    expect(row.id).toBe('active')
    expect(row.end_at).toBeNull()

    // other device stops it
    remote.write('timers', { ...row, end_at: new Date().toISOString(), client_updated_at: Date.now() + 1000 })
    await syncNow(remote)
    expect((await db.timer.get('active'))?.end).toBeTypeOf('number')

    // stopping locally again is a no-op; discarding deletes remotely
    await stopTimer()
    await db.timer.delete('active')
    await syncNow(remote)
    expect(remote.rows('timers')[0].deleted).toBe(true)
  })

  it('uploads pre-existing local data on first sign-in', async () => {
    await db.projects.add(project('p1', 'CFA'))
    resetSyncState() // pretend the data existed before sync
    expect(pendingCount()).toBe(0)
    await markAllDirty()
    await syncNow(remote)
    expect(remote.rows('projects')).toHaveLength(1)
  })
})
