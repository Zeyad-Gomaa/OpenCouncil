import type { Metadata } from 'next'
import OperatorGate from './components/OperatorGate'
import Nav from './components/Nav'
import './globals.css'

export const metadata: Metadata = {
  title: 'OpenCouncil',
  description: 'A self-hosted council of models that research, debate, and agree.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <OperatorGate>
          <div className="shell">
            <Nav />
            <main className="main">{children}</main>
          </div>
        </OperatorGate>
      </body>
    </html>
  )
}
