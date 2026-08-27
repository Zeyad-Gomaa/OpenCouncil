import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Nav from './components/Nav'
import './globals.css'

const inter = Inter({ subsets: ['latin'], display: 'swap' })

export const metadata: Metadata = {
  title: 'OpenCouncil',
  description: 'A self-hosted council of models that research, debate, and agree.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.className}>
      <body>
        <div className="shell">
          <Nav />
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  )
}
