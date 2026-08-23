'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const ITEMS = [
  { href: '/', label: 'Convene' },
  { href: '/sessions', label: 'Sessions' },
  { href: '/activity', label: 'Activity' },
  { href: '/settings', label: 'Settings' },
]

export default function Nav() {
  const pathname = usePathname()
  return (
    <nav className="sidenav">
      <Link href="/" className="brand">🏛 OpenCouncil</Link>
      {ITEMS.map((it) => (
        <Link key={it.href} href={it.href} className={`item ${pathname === it.href ? 'active' : ''}`}>
          {it.label}
        </Link>
      ))}
    </nav>
  )
}
