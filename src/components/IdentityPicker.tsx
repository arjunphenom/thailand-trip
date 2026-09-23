import { useState } from 'react'
import { Check, LoaderCircle, Pencil, Plus, Save, Users } from 'lucide-react'
import { useTrip } from '../lib/use-trip.tsx'
import { Avatar, PhotoCredit, Sheet } from './ui.tsx'

export function IdentityPicker({ onClose }: { onClose: () => void }) {
  const { data, me, chooseIdentity, store, save, pending, connection } = useTrip()
  const [adding, setAdding] = useState(false)
  const busy = pending.includes('travellers')
  return <Sheet title="Who's coming?" description="Choose your traveller for this device. No password needed."
    onClose={onClose} full dismissible={!!me}>
    <p className="identity-dates">THAILAND &middot; 31 OCT &ndash; 8 NOV 2026</p>
    <img className="identity-photo" src={`${import.meta.env.BASE_URL}thailand.webp`} alt="Limestone islands and turquoise water in Thailand" width="1200" height="734" />
    <PhotoCredit />
    <div className="identity-grid">{data.travellers.map((traveller) => <button className="identity-option" key={traveller.id}
      aria-pressed={me?.id === traveller.id} onClick={() => { chooseIdentity(traveller.id); onClose() }}>
      <Avatar traveller={traveller} /><span>{traveller.name}</span>{me?.id === traveller.id && <Check size={16} />}
    </button>)}</div>
    {adding ? <form className="identity-add" onSubmit={async (event) => {
      event.preventDefault()
      const fields = new FormData(event.currentTarget)
      const name = String(fields.get('name') ?? '').trim()
      if (!name) return
      const colours = ['#38675B', '#A65B47', '#64779D', '#92713B', '#886A86', '#4D8087']
      await save(async () => {
        const traveller = await store.addTraveller(name, colours[data.travellers.length % colours.length])
        chooseIdentity(traveller.id)
        onClose()
      }, 'Added to the group.')
    }}><label className="sr-only" htmlFor="new-traveller-name">Traveller name</label>
      <input id="new-traveller-name" name="name" required maxLength={60} placeholder="Their name" autoFocus />
      <button className="button button-primary" type="submit" disabled={busy}>{busy ? <LoaderCircle size={17} className="spin" /> : <Plus size={17} />}Add</button>
    </form> : <button className="button add-person" onClick={() => setAdding(true)}><Plus size={17} />Add someone</button>}
    {me && <details className="rename-traveller"><summary><Pencil size={14} />Rename my traveller</summary>
      <form className="identity-add" onSubmit={async (event) => {
        event.preventDefault()
        const fields = new FormData(event.currentTarget)
        const name = String(fields.get('name') ?? '').trim()
        if (name && await save(() => store.renameTraveller(me.id, name), 'Name updated.')) onClose()
      }}><input aria-label="Your name" name="name" key={me.id} defaultValue={me.name} required maxLength={60} />
        <button className="icon-button" type="submit" disabled={busy} aria-label="Save name" title="Save name"><Save size={19} /></button>
      </form>
    </details>}
    <p className="identity-footer"><Users size={14} />{data.travellers.length} friends. One trip.</p>
    {connection === 'preview' && <p className="preview-form-note">Read-only preview. Supabase is not connected.</p>}
  </Sheet>
}