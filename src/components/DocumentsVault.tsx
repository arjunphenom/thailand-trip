import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { FileText, Image as ImageIcon, Lock, ShieldCheck, Trash2, Upload } from 'lucide-react'
import { appRequest, tripClient } from '../lib/client.ts'
import { useTrip } from '../lib/use-trip.tsx'
import { IconButton, Sheet } from './ui.tsx'

interface Doc { id: string; name: string; mime: string; size_bytes: number; created_at: string; url: string | null }

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function DocumentsVault({ onClose }: { onClose: () => void }) {
  const { me } = useTrip()
  const [phase, setPhase] = useState<'loading' | 'set' | 'enter' | 'open'>('loading')
  const [pin, setPin] = useState('')
  const [docs, setDocs] = useState<Doc[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [locked, setLocked] = useState(false)
  const [forgot, setForgot] = useState(false)

  useEffect(() => {
    if (!me) return
    let active = true
    appRequest<{ hasPin: boolean; locked: boolean }>('doc-status', { traveller: me.id })
      .then((status) => { if (!active) return; setLocked(status.locked); setPhase(status.hasPin ? 'enter' : 'set') })
      .catch((failure) => { if (active) setError((failure as Error).message) })
    return () => { active = false }
  }, [me])

  const loadDocs = async (usePin: string) => {
    if (!me) return
    const result = await appRequest<{ documents: Doc[] }>('doc-list', { traveller: me.id, pin: usePin })
    setDocs(result.documents)
  }

  const setupPin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!me) return
    const form = new FormData(event.currentTarget)
    const first = String(form.get('pin') ?? ''); const second = String(form.get('pin2') ?? '')
    if (!/^\d{4,8}$/.test(first)) { setError('PIN must be 4 to 8 digits.'); return }
    if (first !== second) { setError('The two PINs do not match.'); return }
    setBusy(true); setError(null)
    try { await appRequest('doc-setpin', { traveller: me.id, pin: first }); setPin(first); await loadDocs(first); setPhase('open') }
    catch (failure) { setError((failure as Error).message) } finally { setBusy(false) }
  }

  const enterPin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const entered = String(new FormData(event.currentTarget).get('pin') ?? '')
    setBusy(true); setError(null)
    try { await loadDocs(entered); setPin(entered); setPhase('open') }
    catch (failure) { setError((failure as Error).message) } finally { setBusy(false) }
  }

  const upload = async (file: File) => {
    if (!me || !tripClient) return
    setBusy(true); setError(null)
    try {
      const init = await appRequest<{ path: string; token: string }>('doc-upload', { traveller: me.id, pin, name: file.name, mime: file.type, size: file.size })
      const uploaded = await tripClient.storage.from('trip-docs').uploadToSignedUrl(init.path, init.token, file)
      if (uploaded.error) throw new Error('The upload did not finish. Please try again.')
      await loadDocs(pin)
    } catch (failure) { setError((failure as Error).message) } finally { setBusy(false) }
  }

  const remove = async (id: string) => {
    if (!me) return
    setBusy(true); setError(null)
    try { await appRequest('doc-delete', { traveller: me.id, pin, id }); await loadDocs(pin) }
    catch (failure) { setError((failure as Error).message) } finally { setBusy(false) }
  }

  const adminReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!me) return
    const code = String(new FormData(event.currentTarget).get('admin') ?? '')
    setBusy(true); setError(null)
    try {
      await appRequest('doc-admin-reset', { traveller: me.id, admin: code })
      setForgot(false); setLocked(false); setPhase('set')
    } catch (failure) { setError((failure as Error).message) } finally { setBusy(false) }
  }

  return <Sheet title="My documents" description="Your private travel documents, locked by a PIN" onClose={onClose}>
    {!me ? <p className="empty-inline">Pick your traveller first (tap your avatar), then open your documents.</p>
      : phase === 'loading' ? <p className="app-status" role="status">Loading…</p>
      : phase === 'set' ? <form className="task-form" onSubmit={setupPin}>
        <p className="doc-intro"><ShieldCheck size={16} />Set a PIN to lock your documents. Only you can open them, on any device. Forget it later? Your trip admin can reset it — your files stay safe.</p>
        <label>Create a PIN (4–8 digits)<input name="pin" type="password" inputMode="numeric" autoComplete="new-password" pattern="\d{4,8}" maxLength={8} required autoFocus /></label>
        <label>Confirm PIN<input name="pin2" type="password" inputMode="numeric" autoComplete="new-password" pattern="\d{4,8}" maxLength={8} required /></label>
        <button className="button button-primary full-width" type="submit" disabled={busy}><Lock size={16} />Set PIN &amp; open</button>
      </form>
      : phase === 'enter' ? <>
        <form className="task-form" onSubmit={enterPin}>
          <p className="doc-intro"><Lock size={16} />Enter your documents PIN to unlock your files.</p>
          <label>PIN<input name="pin" type="password" inputMode="numeric" autoComplete="off" pattern="\d{4,8}" maxLength={8} required autoFocus disabled={locked} /></label>
          {locked && <p className="access-error">Too many wrong PINs. Try again in a few minutes.</p>}
          <button className="button button-primary full-width" type="submit" disabled={busy || locked}><Lock size={16} />Unlock</button>
        </form>
        <button type="button" className="link-button doc-forgot" onClick={() => setForgot((value) => !value)}>Forgot your PIN?</button>
        {forgot && <form className="task-form doc-admin-form" onSubmit={adminReset}>
          <p className="doc-intro"><ShieldCheck size={16} />Your trip admin can reset this PIN. Enter the admin code — your uploaded files stay safe, you'll just set a new PIN.</p>
          <label>Admin code<input name="admin" type="password" autoComplete="off" required /></label>
          <button className="button button-secondary full-width" type="submit" disabled={busy}>Reset this PIN</button>
        </form>}
      </>
      : <>
        <label className={`button button-primary full-width doc-upload-btn ${busy ? 'is-busy' : ''}`}>
          <Upload size={16} />{busy ? 'Working…' : 'Upload document (PDF or photo)'}
          <input type="file" accept="application/pdf,image/*" hidden disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = '' }} />
        </label>
        {docs.length === 0 ? <p className="empty-inline">No documents yet. Upload your passport, visa or tickets — they stay private to you.</p>
          : <ul className="doc-list">{docs.map((doc) => <li className="doc-row" key={doc.id}>
            <span className="doc-ico">{doc.mime === 'application/pdf' ? <FileText size={18} /> : <ImageIcon size={18} />}</span>
            <button type="button" className="doc-open" disabled={!doc.url} onClick={() => doc.url && window.open(doc.url, '_blank', 'noopener,noreferrer')}>
              <span className="doc-name">{doc.name}</span><span className="doc-meta">{humanSize(doc.size_bytes)} · tap to view</span>
            </button>
            <IconButton label={`Delete ${doc.name}`} className="doc-del" disabled={busy} onClick={() => void remove(doc.id)}><Trash2 size={15} /></IconButton>
          </li>)}</ul>}
        <p className="doc-footnote"><ShieldCheck size={13} />Private to you and locked by your PIN. Stored securely; nobody else in the group can open them.</p>
      </>}
    {error && <p className="access-error" role="alert">{error}</p>}
  </Sheet>
}
