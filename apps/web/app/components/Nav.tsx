'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { apiGet } from '../lib/api'
import type { SessionDTO } from '@opencouncil/shared'

const HomeIcon = () => (
  <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M3 9l5-5 5 5v5h-10v-5z" />
    <path d="M6 14v-4h4v4" />
  </svg>
)

const ClockIcon = () => (
  <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="8" cy="8" r="6" />
    <path d="M8 5v3l2 2" />
  </svg>
)

const ChartIcon = () => (
  <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M3 13v-4M7 13v-8M11 13v-6" />
  </svg>
)

const GearIcon = () => (
  <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="8" cy="8" r="2" />
    <path d="M8 2v2M8 12v2M14 8h-2M4 8H2M12.24 3.76l-1.41 1.41M5.17 10.83l-1.41 1.41M12.24 12.24l-1.41-1.41M5.17 5.17L3.76 3.76" />
  </svg>
)

const navItems = [
  { href: '/', label: 'Home', icon: HomeIcon },
  { href: '/sessions', label: 'History', icon: ClockIcon },
  { href: '/activity', label: 'Usage', icon: ChartIcon },
  { href: '/settings', label: 'Settings', icon: GearIcon },
]

export default function Nav() {
  const pathname = usePathname()
  const [recent, setRecent] = useState<SessionDTO[]>([])

  useEffect(() => {
    apiGet<SessionDTO[]>('/sessions?limit=8')
      .then(setRecent)
      .catch(() => {})
  }, [pathname])

  return (
    <nav className="sidenav">
      <Link href="/" className="brand">
        <div className="brand-mark">OC</div>
        <span>OpenCouncil</span>
      </Link>

      <Link href="/" className="sidebar-new">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M8 3v10M3 8h10" />
        </svg>
        New session
      </Link>

      <div className="nav-section">Menu</div>

      {navItems.map((item) => {
        const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
        const Icon = item.icon
        return (
          <Link key={item.href} href={item.href} className={`item ${isActive ? 'active' : ''}`}>
            <Icon />
            {item.label}
          </Link>
        )
      })}

      {recent.length > 0 && (
        <>
          <div className="nav-section">Recent</div>
          <div className="nav-recent">
            {recent.map((s) => (
              <Link
                key={s.id}
                href={`/sessions/view/?id=${s.id}`}
                className={`item recent ${pathname.includes(s.id) ? 'active' : ''}`}
                title={s.topic}
              >
                <span className="recent-topic">{s.topic}</span>
              </Link>
            ))}
          </div>
        </>
      )}

      <div className="nav-footer">Self-hosted · your keys</div>
    </nav>
  )
}
