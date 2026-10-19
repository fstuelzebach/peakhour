export const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
export const WEEKDAYS_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']

/** Monday = 0 … Sunday = 6 */
export const weekday = (d: Date) => (d.getDay() + 6) % 7

export function clock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`
}

export function hours(ms: number) {
  const h = ms / 3_600_000
  if (h < 1) return `${Math.round(h * 60)} min`
  return `${h.toLocaleString('de-DE', { maximumFractionDigits: 1 })} h`
}

export function timeOfDay(ms: number) {
  return new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

export function dateLabel(ms: number) {
  return new Date(ms).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })
}

/** value for <input type="datetime-local"> */
export function toLocalInput(ms: number) {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000)
  return d.toISOString().slice(0, 16)
}

export function fromLocalInput(v: string) {
  return new Date(v).getTime()
}

/** ISO 8601 with the local offset, e.g. 2026-10-19T07:30:00+02:00 */
export function isoLocal(ms: number, tzOffset: number) {
  const d = new Date(ms + tzOffset * 60_000)
  const sign = tzOffset >= 0 ? '+' : '-'
  const abs = Math.abs(tzOffset)
  const off = `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`
  return d.toISOString().slice(0, 19) + off
}

export const SMILEYS = [
  { value: 0, emoji: '😩', label: 'Zäh' },
  { value: 25, emoji: '😕', label: 'Mäßig' },
  { value: 50, emoji: '😐', label: 'Okay' },
  { value: 75, emoji: '🙂', label: 'Gut' },
  { value: 100, emoji: '🤩', label: 'Flow' },
]

export const smileyFor = (rating: number) => SMILEYS[Math.round(rating / 25)]
