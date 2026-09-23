import * as Dialog from '@radix-ui/react-dialog'
import { Check, Inbox, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Traveller } from '../lib/types.ts'

export function IconButton({ label, children, className = '', ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button type="button" {...props} className={`icon-button ${className}`} aria-label={label} title={label}>{children}</button>
}

export function PhotoCredit() {
  return <span className="photo-credit">Photo:
    <a href="https://commons.wikimedia.org/wiki/File:Isla_Phi_Phi_Lay,_Tailandia,_2013-08-19,_DD_07.JPG" target="_blank" rel="noopener noreferrer">Diego Delso</a>
    <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noopener noreferrer" title="Resized and converted to WebP">CC BY-SA 3.0</a>
  </span>
}

export function Avatar({ traveller, small = false, done = false, mine = false }:
  { traveller?: Traveller | null; small?: boolean; done?: boolean; mine?: boolean }) {
  const name = traveller?.name.replace(/\s*\(Admin\)$/i, '').trim() || '?'
  const initials = name.startsWith('Traveller ')
    ? `T${name.split(' ').at(-1)}`
    : name.length <= 2 ? name.toUpperCase() : name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()
  return <span className={`avatar ${small ? 'avatar-small' : ''} ${done ? 'avatar-done' : ''} ${mine ? 'avatar-mine' : ''}`}
    style={{ '--avatar-colour': traveller?.colour ?? '#727975' } as CSSProperties}
    title={traveller?.name} aria-hidden="true">
    {initials}{done && <Check className="avatar-tick" size={11} strokeWidth={3} />}
  </span>
}

export function Sheet({ title, children, onClose, description, full = false, dismissible = true }:
  { title: string; children: ReactNode; onClose: () => void; description?: string; full?: boolean; dismissible?: boolean }) {
  return <Dialog.Root open onOpenChange={(open) => { if (!open && dismissible) onClose() }}>
    <Dialog.Portal>
      <Dialog.Overlay className="sheet-overlay" />
      <Dialog.Content className={`sheet ${full ? 'identity-sheet' : ''}`}
        onEscapeKeyDown={(event) => { if (!dismissible) event.preventDefault() }}
        onPointerDownOutside={(event) => { if (!dismissible) event.preventDefault() }}>
        <div className="sheet-heading">
          <Dialog.Title>{title}</Dialog.Title>
          {dismissible && <Dialog.Close asChild><button className="icon-button" aria-label="Close" title="Close"><X size={21} /></button></Dialog.Close>}
        </div>
        <Dialog.Description className="sr-only">{description ?? title}</Dialog.Description>
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}

export function Markdown({ children }: { children: string | null }) {
  if (!children) return null
  return <div className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{
    a: ({ href, children: label }) => <a href={href} target="_blank" rel="noopener noreferrer">{label}</a>,
  }}>{children}</ReactMarkdown></div>
}

export function EmptyState({ title, detail, icon: Icon = Inbox, children }:
  { title: string; detail?: string; icon?: LucideIcon; children?: ReactNode }) {
  return <div className="empty-state"><Icon size={28} strokeWidth={1.5} /><h3>{title}</h3>{detail && <p>{detail}</p>}{children}</div>
}

export function LoadingState() {
  return <div className="loading-state" role="status" aria-label="Loading shared trip">
    <div className="skeleton skeleton-cover" />
    <div className="page-body"><div className="skeleton skeleton-heading" /><div className="skeleton skeleton-filters" />
      {[0, 1, 2, 3].map((index) => <div className="skeleton skeleton-task" key={index} />)}
    </div>
    <span className="sr-only">Loading the shared trip...</span>
  </div>
}