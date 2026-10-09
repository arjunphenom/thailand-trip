import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { LockKeyhole, LogIn, RefreshCw } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { joinTrip, tripClient } from '../lib/client.ts'
import { LoadingState } from './ui.tsx'

export function AccessGate({ children }: { children: (userId: string | null) => ReactNode }) {
  const [state, setState] = useState<'checking' | 'locked' | 'ready'>(tripClient ? 'checking' : 'ready')
  const [userId, setUserId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [invitation, setInvitation] = useState(() => new URLSearchParams(location.hash.split('?')[1] ?? '').get('invite') ?? '')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (!tripClient) return
    let cancelled = false
    const check = async () => {
      if (navigator.onLine === false) {
        let remembered: string | null = null
        try { remembered = localStorage.getItem('thailand26:member') } catch {}
        if (remembered) { setUserId(remembered); setState('ready'); return }
      }
      const { data: { session }, error: sessionError } = await tripClient!.auth.getSession()
      if (cancelled) return
      if (sessionError) throw new Error('Could not restore your device session.')
      if (session) {
        if (navigator.onLine === false) {
          let knownMember = false
          try { knownMember = localStorage.getItem('thailand26:member') === session.user.id } catch { knownMember = false }
          if (knownMember) { setUserId(session.user.id); setState('ready'); return }
        }
        const membership = await tripClient!.from('trip_memberships').select('user_id').eq('user_id', session.user.id).maybeSingle()
        if (cancelled) return
        if (membership.error) throw new Error('Could not verify access. Check your connection and retry.')
        if (membership.data) {
          try { localStorage.setItem('thailand26:member', session.user.id) } catch {}
          setUserId(session.user.id)
          setState('ready')
          return
        }
      }
      setState('locked')
    }
    void check().catch((failure: Error) => {
      if (!cancelled) { setError(failure.message); setState('locked') }
    })
    const { data: listener } = tripClient.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setUserId(null)
        setState('locked')
        try { localStorage.removeItem('thailand26:member') } catch {}
      }
    })
    return () => { cancelled = true; listener.subscription.unsubscribe() }
  }, [])

  if (state === 'checking') return <div className="app-shell"><LoadingState /></div>
  if (state === 'ready') return children(userId)
  return <div className="app-shell"><main className="access-page">
    <img className="access-photo" src={`${import.meta.env.BASE_URL}thailand.webp`} alt="Phi Phi Islands, Thailand" width="1200" height="734" />
    <div className="page-body">
      <span className="access-label"><LockKeyhole size={16} />Private trip</span>
      <h1>Thailand Nov 2026</h1>
      <form className="task-form" onSubmit={async (event) => {
        event.preventDefault()
        if (busy) return
        setBusy(true)
        setError(null)
        try {
          const member = await joinTrip(invitation)
          setUserId(member)
          setState('ready')
          setInvitation('')
          navigate('/', { replace: true })
        } catch (failure) { setError((failure as Error).message) }
        finally { setBusy(false) }
      }}>
        <label>Invitation link<input aria-label="Invitation link" type="password" autoComplete="off" required value={invitation} onChange={(event) => setInvitation(event.target.value)} /></label>
        {error && <p className="access-error" role="alert">{error}</p>}
        <button className="button button-primary" type="submit" disabled={busy}><LogIn size={18} />{busy ? 'Joining...' : 'Join trip'}</button>
      </form>
      {error && <button className="button button-secondary access-retry" onClick={() => location.reload()}><RefreshCw size={17} />Retry connection</button>}
    </div>
  </main></div>
}