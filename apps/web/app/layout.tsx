import type { Metadata } from 'next'
import Nav from './components/Nav'
import './globals.css'

export const metadata: Metadata = {
  title: 'OpenCouncil | Deliberation workspace',
  description: 'Structured, private deliberation across your configured models.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <Nav />
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  )
}
