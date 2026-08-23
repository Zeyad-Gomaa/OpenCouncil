'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const ITEMS = [
  { href: '/', label: 'Workspace', icon: '▦' },
  { href: '/sessions', label: 'Sessions', icon: '◷' },
  { href: '/activity', label: 'Usage & activity', icon: '▥' },
  { href: '/settings', label: 'Configuration', icon: '⚙' },
]

export default function Nav() {
  const pathname = usePathname()
  return (
    <nav className="sidenav">
      <Link href="/" className="brand"><span className="brand-mark">OC</span> OpenCouncil</Link>
      <div className="nav-label">Workspace</div>
      {ITEMS.map((it) => (
        <Link key={it.href} href={it.href} className={`item ${pathname === it.href || (it.href !== '/' && pathname.startsWith(it.href)) ? 'active' : ''}`}>
          <span className="nav-icon">{it.icon}</span>{it.label}
        </Link>
      ))}
      <div className="nav-footer">Private deliberation workspace<br />Self-hosted · BYOK</div>
    </nav>
  )
}
