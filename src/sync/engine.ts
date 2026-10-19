import Dexie, { type Table, type Transaction } from 'dexie'
import { db } from '../db'
import { REMOTE_TABLE, fromRow, toRow, tombstone, type RemoteRow, type TableName } from './mapping'

/** What the engine needs from a backend. Supabase implements it; tests use an in-memory fake. */
export interface Remote {
  /** rows of `table` changed at or after `since` (server time, ISO), oldest first */
  pull(table: string, since: string | null): Promise<RemoteRow[]>
  upsert(table: string, rows: RemoteRow[]): Promise<void>
}

export const TABLES: TableName[] = ['projects', 'sessions', 'timer']

const tableOf = (name: TableName) => db[name] as unknown as Table<{ updatedAt?: number }, string>

// ---------- small persistent key/value store (localStorage, memory fallback for tests) ----------

const mem = new Map<string, string>()
const kv = {
  get(k: string) {
    try {
      return localStorage.getItem(k)
    } catch {
      return mem.get(k) ?? null
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v)
    } catch {
      mem.set(k, v)
    }
  },
  del(k: string) {
    try {
      localStorage.removeItem(k)
    } catch {
      mem.delete(k)
    }
  },
}

// ---------- dirty tracking ----------

const DIRTY = 'peakhour:sync:dirty'
type Dirty = Record<string, number> // "table|id" → time marked

const readDirty = (): Dirty => JSON.parse(kv.get(DIRTY) ?? '{}')
const writeDirty = (d: Dirty) => kv.set(DIRTY, JSON.stringify(d))
const dkey = (t: TableName, id: string) => `${t}|${id}`

const listeners = new Set<() => void>()
export const onLocalChange = (fn: () => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

let seq = 0
function markDirty(t: TableName, id: string) {
  const d = readDirty()
  // strictly increasing so a re-mark during a push is never mistaken for the pushed one
  d[dkey(t, id)] = Math.max(Date.now(), ++seq)
  writeDirty(d)
  queueMicrotask(() => listeners.forEach((fn) => fn()))
}

export const pendingCount = () => Object.keys(readDirty()).length

// ---------- hooks: every local write is stamped and queued, unless it came from the server ----------

const remoteTx = new WeakSet<object>()
const isRemote = (tx?: Transaction) => (tx && remoteTx.has(tx)) || (!!Dexie.currentTransaction && remoteTx.has(Dexie.currentTransaction))

let hooked = false
export function installSyncHooks() {
  if (hooked) return
  hooked = true
  for (const name of TABLES) {
    const t = tableOf(name)
    t.hook('creating', function (pk, obj, tx) {
      if (isRemote(tx)) return
      obj.updatedAt = Date.now()
      markDirty(name, String(pk ?? (obj as { id?: string; key?: string }).id ?? (obj as { key?: string }).key))
    })
    t.hook('updating', function (_mods, pk, _obj, tx) {
      if (isRemote(tx)) return
      markDirty(name, String(pk))
      return { updatedAt: Date.now() }
    })
    t.hook('deleting', function (pk, _obj, tx) {
      if (isRemote(tx)) return
      markDirty(name, String(pk))
    })
  }
}

/** Queue every local record, e.g. on first sign-in, so existing data gets uploaded. */
export async function markAllDirty() {
  const d = readDirty()
  for (const name of TABLES) {
    for (const k of await tableOf(name).toCollection().primaryKeys()) d[dkey(name, String(k))] = Date.now()
  }
  writeDirty(d)
}

// ---------- sync ----------

const cursorKey = (t: TableName) => `peakhour:sync:cursor:${t}`

async function pull(remote: Remote) {
  let applied = 0
  for (const name of TABLES) {
    const rows = await remote.pull(REMOTE_TABLE[name], kv.get(cursorKey(name)))
    if (!rows.length) continue
    const table = tableOf(name)
    await db.transaction('rw', table, async (tx) => {
      remoteTx.add(tx)
      const dirty = readDirty()
      for (const r of rows) {
        const local = await table.get(r.id)
        const k = dkey(name, r.id)
        // a newer unpushed local edit wins; it gets pushed right after
        if (dirty[k] && (local?.updatedAt ?? dirty[k]) > Number(r.client_updated_at)) continue
        if (r.deleted) {
          if (local) await table.delete(r.id)
        } else {
          await table.put(fromRow(name, r) as { updatedAt?: number })
        }
        delete dirty[k]
        applied++
      }
      writeDirty(dirty)
    })
    const last = rows[rows.length - 1].updated_at
    if (last) kv.set(cursorKey(name), last)
  }
  return applied
}

async function push(remote: Remote) {
  const snapshot = readDirty()
  const keys = Object.keys(snapshot)
  if (!keys.length) return 0
  for (const name of TABLES) {
    const ids = keys.filter((k) => k.startsWith(`${name}|`)).map((k) => k.slice(name.length + 1))
    if (!ids.length) continue
    const locals = await tableOf(name).bulkGet(ids)
    const rows = ids.map((id, i) => {
      const o = locals[i]
      return o ? toRow(name, o as never) : tombstone(id, snapshot[dkey(name, id)])
    })
    await remote.upsert(REMOTE_TABLE[name], rows)
  }
  // only clear what we pushed and what wasn't touched again meanwhile
  const now = readDirty()
  for (const k of keys) if (now[k] === snapshot[k]) delete now[k]
  writeDirty(now)
  return keys.length
}

let running: Promise<{ pulled: number; pushed: number }> | null = null

/** Pull remote changes, then push local ones. Concurrent calls share one run. */
export function syncNow(remote: Remote) {
  running ??= (async () => {
    try {
      const pulled = await pull(remote)
      const pushed = await push(remote)
      return { pulled, pushed }
    } finally {
      running = null
    }
  })()
  return running
}

/** Forget sync state (on sign-out). Local data stays. */
export function resetSyncState() {
  for (const name of TABLES) kv.del(cursorKey(name))
  kv.del(DIRTY)
}

export const syncedUser = {
  get: () => kv.get('peakhour:sync:user'),
  set: (id: string) => kv.set('peakhour:sync:user', id),
  clear: () => kv.del('peakhour:sync:user'),
}
