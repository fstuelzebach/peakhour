import { createClient, type Session as AuthSession, type SupabaseClient } from '@supabase/supabase-js'
import { useEffect, useSyncExternalStore } from 'react'
import { installSyncHooks, markAllDirty, onLocalChange, pendingCount, resetSyncState, syncNow, syncedUser, type Remote } from './engine'
import type { RemoteRow } from './mapping'

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** null when the build has no Supabase config: the app then runs local-only */
export const supabase: SupabaseClient | null = URL && KEY ? createClient(URL, KEY) : null

const PAGE = 1000

const remote: Remote = {
  async pull(table, since) {
    const out: RemoteRow[] = []
    for (let from = 0; ; from += PAGE) {
      let q = supabase!.from(table).select('*').order('updated_at').range(from, from + PAGE - 1)
      if (since) q = q.gt('updated_at', since)
      const { data, error } = await q
      if (error) throw error
      out.push(...(data as RemoteRow[]))
      if (data.length < PAGE) return out
    }
  },
  async upsert(table, rows) {
    for (let i = 0; i < rows.length; i += PAGE) {
      const { error } = await supabase!.from(table).upsert(rows.slice(i, i + PAGE), { onConflict: 'user_id,id' })
      if (error) throw error
    }
  },
}

// ---------- status store ----------

export interface SyncState {
  user: AuthSession['user'] | null
  status: 'off' | 'idle' | 'syncing' | 'error' | 'offline'
  lastSync: number | null
  error: string | null
  pending: number
}

let state: SyncState = { user: null, status: 'off', lastSync: null, error: null, pending: 0 }
const subs = new Set<() => void>()
const set = (patch: Partial<SyncState>) => {
  state = { ...state, ...patch }
  subs.forEach((fn) => fn())
}
export const useSyncState = () =>
  useSyncExternalStore(
    (fn) => {
      subs.add(fn)
      return () => subs.delete(fn)
    },
    () => state,
  )

export async function runSync() {
  if (!supabase || !state.user) return
  if (!navigator.onLine) return set({ status: 'offline', pending: pendingCount() })
  set({ status: 'syncing' })
  try {
    await syncNow(remote)
    set({ status: 'idle', lastSync: Date.now(), error: null, pending: pendingCount() })
  } catch (e) {
    set({ status: 'error', error: (e as Error).message, pending: pendingCount() })
  }
}

async function onSignedIn(user: AuthSession['user']) {
  if (syncedUser.get() !== user.id) {
    // first sign-in on this device: upload what's already here
    resetSyncState()
    await markAllDirty()
    syncedUser.set(user.id)
  }
  set({ user, status: 'idle' })
  runSync()
}

// ---------- auth (email one-time code: works inside the home-screen app, unlike magic links) ----------

export async function sendCode(email: string) {
  const { error } = await supabase!.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
  if (error) throw error
}

export async function verifyCode(email: string, token: string) {
  const { error } = await supabase!.auth.verifyOtp({ email, token, type: 'email' })
  if (error) throw error
}

export async function signOut() {
  await supabase?.auth.signOut()
  resetSyncState()
  syncedUser.clear()
  set({ user: null, status: 'off', lastSync: null, pending: 0 })
}

// ---------- background loop ----------

const INTERVAL = 30_000

/** Mount once (in App). Syncs on start, focus, reconnect, local edits and every 30 s while visible. */
export function useSyncDaemon() {
  useEffect(() => {
    if (!supabase) return
    installSyncHooks()
    supabase.auth.getSession().then(({ data }) => data.session && onSignedIn(data.session.user))
    const { data: authSub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session && session.user.id !== state.user?.id) onSignedIn(session.user)
      if (event === 'SIGNED_OUT') set({ user: null, status: 'off' })
    })

    let debounce: ReturnType<typeof setTimeout> | undefined
    const offLocal = onLocalChange(() => {
      set({ pending: pendingCount() })
      clearTimeout(debounce)
      debounce = setTimeout(runSync, 1500)
    })
    const onVisible = () => document.visibilityState === 'visible' && runSync()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', runSync)
    const tick = setInterval(() => document.visibilityState === 'visible' && runSync(), INTERVAL)

    return () => {
      authSub.subscription.unsubscribe()
      offLocal()
      clearTimeout(debounce)
      clearInterval(tick)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', runSync)
    }
  }, [])
}
