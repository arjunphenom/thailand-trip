import { useEffect, useState } from 'react'
import { FileText, Image as ImageIcon, Trash2, Upload, Users } from 'lucide-react'
import { appRequest, tripClient } from '../lib/client.ts'
import { useTrip } from '../lib/use-trip.tsx'
import { IconButton, Sheet } from './ui.tsx'

interface SharedDoc { id: string; name: string; mime: string; size_bytes: number; created_at: string; uploaded_by: string | null; url: string | null }

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function SharedDocuments({ onClose }: { onClose: () => void }) {
  const { me } = useTrip()
  const [docs, setDocs] = useState<SharedDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    const result = await appRequest<{ documents: SharedDoc[] }>('shared-list')
    setDocs(result.documents)
  }

  useEffect(() => {
    let active = true
    appRequest<{ documents: SharedDoc[] }>('shared-list')
      .then((result) => { if (!active) return; setDocs(result.documents); setLoading(false) })
      .catch((failure) => { if (!active) return; setError((failure as Error).message); setLoading(false) })
    return () => { active = false }
  }, [])

  const upload = async (file: File) => {
    if (!me || !tripClient) return
    setBusy(true); setError(null)
    try {
      const init = await appRequest<{ path: string; token: string }>('shared-upload', { traveller: me.id, name: file.name, mime: file.type, size: file.size })
      const uploaded = await tripClient.storage.from('trip-docs').uploadToSignedUrl(init.path, init.token, file)
      if (uploaded.error) throw new Error('The upload did not finish. Please try again.')
      await load()
    } catch (failure) { setError((failure as Error).message) } finally { setBusy(false) }
  }

  const remove = async (id: string) => {
    setBusy(true); setError(null)
    try { await appRequest('shared-delete', { id }); await load() }
    catch (failure) { setError((failure as Error).message) } finally { setBusy(false) }
  }

  return <Sheet title="Shared documents" description="Hotel bookings, tickets and anything the whole group needs" onClose={onClose}>
    <p className="doc-intro"><Users size={16} />Visible to everyone on the trip. Upload hotel confirmations, e-tickets and vouchers so nobody has to dig through the chat.</p>
    {me ? <label className={`button button-primary full-width doc-upload-btn ${busy ? 'is-busy' : ''}`}>
      <Upload size={16} />{busy ? 'Working…' : 'Upload document (PDF or photo)'}
      <input type="file" accept="application/pdf,image/*" hidden disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = '' }} />
    </label> : <p className="empty-inline">Pick your traveller first (tap your avatar) to upload — you can still view everything below.</p>}
    {loading ? <p className="app-status" role="status">Loading…</p>
      : docs.length === 0 ? <p className="empty-inline">No shared documents yet. Upload the first hotel booking or ticket.</p>
      : <ul className="doc-list">{docs.map((doc) => <li className="doc-row" key={doc.id}>
        <span className="doc-ico">{doc.mime === 'application/pdf' ? <FileText size={18} /> : <ImageIcon size={18} />}</span>
        <button type="button" className="doc-open" disabled={!doc.url} onClick={() => doc.url && window.open(doc.url, '_blank', 'noopener,noreferrer')}>
          <span className="doc-name">{doc.name}</span><span className="doc-meta">{humanSize(doc.size_bytes)}{doc.uploaded_by ? ` · ${doc.uploaded_by}` : ''} · tap to view</span>
        </button>
        <IconButton label={`Delete ${doc.name}`} className="doc-del" disabled={busy} onClick={() => void remove(doc.id)}><Trash2 size={15} /></IconButton>
      </li>)}</ul>}
    <p className="doc-footnote"><Users size={13} />Shared with everyone on the trip. Anyone can add or remove these.</p>
    {error && <p className="access-error" role="alert">{error}</p>}
  </Sheet>
}
