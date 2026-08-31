'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiGet, apiSend } from '../lib/api'

export default function OperatorGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<{ enabled: boolean; authenticated: boolean } | null>(null)
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const check = useCallback(() => {
    setError('')
    apiGet<{ enabled: boolean; authenticated: boolean }>('/auth/status', { timeoutMs: 8000 })
      .then(setStatus)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [])
  useEffect(() => {
    check()
    const expired = () => {
      setStatus({ enabled: true, authenticated: false })
      setToken('')
    }
    window.addEventListener('opencouncil:unauthorized', expired)
    return () => window.removeEventListener('opencouncil:unauthorized', expired)
  }, [check])
  async function signIn(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await apiSend('/auth/login', 'POST', { token })
      setToken('')
      check()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  if (!status || !status.authenticated)
    return (
      <main className="main" style={{ maxWidth: 480, margin: '60px auto' }}>
        <h1>OpenCouncil</h1>
        {status ? (
          <form onSubmit={signIn}>
            <h2>Operator sign-in</h2>
            <p>Enter the token configured by this server’s operator. It is not saved in browser storage.</p>
            <label htmlFor="operator-token">Operator token</label>
            <input
              id="operator-token"
              className="input"
              type="password"
              autoComplete="current-password"
              required
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        ) : !error ? (
          <p>Connecting to the server…</p>
        ) : (
          <div role="alert">
            <h2>Couldn’t reach the server</h2>
            <p>{error}</p>
            <p>
              Keep <code>npm start</code> (or <code>opencouncil</code>) running, then open the exact UI URL printed in
              that terminal.
            </p>
            <button className="btn" onClick={check}>
              Retry
            </button>
          </div>
        )}
        {status && error && <p role="alert">{error}</p>}
      </main>
    )
  return (
    <>
      {status.enabled && (
        <button
          className="btn"
          style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 100 }}
          onClick={async () => {
            try {
              await apiSend('/auth/logout', 'POST')
              setStatus({ enabled: true, authenticated: false })
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e))
            }
          }}
        >
          Sign out
        </button>
      )}
      {error && <p role="alert">{error}</p>}
      {children}
    </>
  )
}
