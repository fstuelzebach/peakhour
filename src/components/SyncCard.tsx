import { useState } from 'react'
import { runSync, sendCode, signOut, supabase, useSyncState, verifyCode } from '../sync/supabase'
import { timeOfDay } from '../lib/format'

const EMAIL = 'peakhour:sync:email'

export function SyncCard() {
  const sync = useSyncState()
  const [email, setEmail] = useState(() => localStorage.getItem(EMAIL) ?? '')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!supabase) return null

  const act = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (sync.user) {
    const label =
      sync.status === 'syncing'
        ? 'Synchronisiere …'
        : sync.status === 'offline'
          ? `Offline · ${sync.pending} Änderungen warten`
          : sync.status === 'error'
            ? `Fehler: ${sync.error}`
            : sync.lastSync
              ? `Synchron · ${timeOfDay(sync.lastSync)}`
              : 'Bereit'
    return (
      <div className="card list">
        <div className="row static">
          <span className={`sync-dot ${sync.status}`} />
          <span className="row-main">
            <span className="row-title">{sync.user.email}</span>
            <span className="row-sub muted">{label}</span>
          </span>
        </div>
        <button className="row" onClick={runSync} disabled={sync.status === 'syncing'}>
          <span className="row-main">
            <span className="row-title">Jetzt synchronisieren</span>
          </span>
          <span className="chev">↻</span>
        </button>
        <button className="row" onClick={signOut}>
          <span className="row-main">
            <span className="row-title">Abmelden</span>
            <span className="row-sub muted">Daten bleiben auf diesem Gerät</span>
          </span>
        </button>
      </div>
    )
  }

  return (
    <div className="card sync-login">
      <p className="muted small">Melde dich auf allen Geräten mit derselben E-Mail an, um iPhone, Mac und Desktop abzugleichen.</p>
      {step === 'email' ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            act(async () => {
              await sendCode(email.trim())
              localStorage.setItem(EMAIL, email.trim())
              setStep('code')
            })
          }}
        >
          <input className="text-input" type="email" autoComplete="email" placeholder="E-Mail" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="btn primary" disabled={busy || !email.includes('@')}>
            Code senden
          </button>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            act(() => verifyCode(email.trim(), code.trim()))
          }}
        >
          <input
            className="text-input code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="Code aus der E-Mail"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          />
          <button className="btn primary" disabled={busy || code.length < 6}>
            Anmelden
          </button>
          <button type="button" className="link" onClick={() => setStep('email')}>
            Andere E-Mail / neuen Code
          </button>
        </form>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  )
}
