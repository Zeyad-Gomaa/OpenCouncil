'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const HomeIcon = () => (
  <svg
    className="nav-icon"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 9l5-5 5 5v5h-10v-5z" />
    <path d="M6 14v-4h4v4" />
  </svg>
)

const ClockIcon = () => (
  <svg
    className="nav-icon"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="8" cy="8" r="6" />
    <path d="M8 5v3l2 2" />
  </svg>
)

const ChartIcon = () => (
  <svg
    className="nav-icon"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 13v-4M7 13v-8M11 13v-6" />
  </svg>
)

const GearIcon = () => (
  <svg
    className="nav-icon"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="8" cy="8" r="2" />
    <path d="M8 2v2M8 12v2M14 8h-2M4 8H2M12.24 3.76l-1.41 1.41M5.17 10.83l-1.41 1.41M12.24 12.24l-1.41-1.41M5.17 5.17L3.76 3.76" />
  </svg>
)

const navItems = [
  { href: '/', label: 'Workspace', icon: HomeIcon },
  { href: '/sessions', label: 'Sessions', icon: ClockIcon },
  { href: '/activity', label: 'Usage & activity', icon: ChartIcon },
  { href: '/settings', label: 'Configuration', icon: GearIcon },
]

export default function Nav() {
  const pathname = usePathname()

  return (
    <nav className="sidenav">
      <div className="brand">
        <div className="brand-mark">OC</div>
        <span>OpenCouncil</span>
      </div>

      <div className="nav-section">NAVIGATION</div>

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

      <div className="nav-footer">Self-hosted · BYOK · Private</div>
    </nav>
  )
}
