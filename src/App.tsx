import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { Timer } from './screens/Timer'
import { History } from './screens/History'
import { Stats } from './screens/Stats'
import { Projects } from './screens/Projects'

const TABS = [
  {
    id: 'timer',
    label: 'Timer',
    icon: (
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="13" r="8" />
        <path d="M12 9v4l2.5 2M9.5 2.5h5" />
      </svg>
    ),
  },
  {
    id: 'history',
    label: 'Verlauf',
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M4 6h16M4 12h16M4 18h10" />
      </svg>
    ),
  },
  {
    id: 'stats',
    label: 'Insights',
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M5 20V12M12 20V5M19 20v-9" />
      </svg>
    ),
  },
  {
    id: 'projects',
    label: 'Projekte',
    icon: (
      <svg viewBox="0 0 24 24">
        <rect x="4" y="4" width="7" height="7" rx="2" />
        <rect x="13" y="4" width="7" height="7" rx="2" />
        <rect x="4" y="13" width="7" height="7" rx="2" />
        <rect x="13" y="13" width="7" height="7" rx="2" />
      </svg>
    ),
  },
] as const

type Tab = (typeof TABS)[number]['id']

export default function App() {
  const [tab, setTab] = useState<Tab>('timer')
  const running = useLiveQuery(() => db.timer.get('active'), [])

  return (
    <div className="app">
      <main>
        {tab === 'timer' && <Timer />}
        {tab === 'history' && <History />}
        {tab === 'stats' && <Stats />}
        {tab === 'projects' && <Projects />}
      </main>
      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            {t.icon}
            <span>{t.label}</span>
            {t.id === 'timer' && running && tab !== 'timer' && <span className="live-dot" />}
          </button>
        ))}
      </nav>
    </div>
  )
}
