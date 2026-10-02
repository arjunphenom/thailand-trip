import { useLayoutEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { HashRouter, Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { CircleHelp, ListTodo, Map, MapPinned, Palmtree, RefreshCw, TriangleAlert, Wallet, Wifi, WifiOff } from 'lucide-react'
import { Toaster } from 'sonner'
import { IdentityPicker } from './components/IdentityPicker.tsx'
import { Avatar, EmptyState, IconButton, LoadingState, Sheet } from './components/ui.tsx'
import { countdown, filterTasks, progress } from './lib/trip.ts'
import { TripProvider, useTrip } from './lib/use-trip.tsx'
import { ChecklistPage, ItineraryPage, MapPage, MoneyPage } from './pages.tsx'

function TripLayout() {
  const { data, me, loading, connection, lastSynced, error, today, refreshing, store, save } = useTrip()
  const { pathname } = useLocation()
  useLayoutEffect(() => { window.scrollTo(0, 0) }, [pathname])
  const [identityOpen, setIdentityOpen] = useState(false)
  const [connectionOpen, setConnectionOpen] = useState(false)
  const counts = progress(data)
  const urgent = filterTasks(data, 'urgent', null, today).length
  const connectionLabels = { preview: 'Preview', connected: 'Live', connecting: 'Connecting', reconnecting: 'Reconnecting', offline: 'Offline' }
  const tabs = [
    { to: '/', label: 'Checklist', icon: ListTodo }, { to: '/itinerary', label: 'Itinerary', icon: Map },
    { to: '/money', label: 'Money', icon: Wallet }, { to: '/map', label: 'Map', icon: MapPinned },
  ]
  return <div className="app-shell">
    <a href="#main-content" className="skip-link" onClick={(event) => {
      event.preventDefault()
      document.getElementById('main-content')?.focus()
    }}>Skip to trip</a>
    <header className="app-header">
      <div className="header-main">
        <div className="trip-brand">
          <span className="brand-mark"><Palmtree size={25} strokeWidth={1.6} /></span>
          <div><Link to="/" className="brand-name">Thailand <span>Nov 2026</span></Link>
            <button className="connection-control" onClick={() => setConnectionOpen(true)} aria-label={`Sync status: ${connectionLabels[connection]}`} title="Connection and last sync">
              <span className={`connection-dot connection-${connection}`} /><span>{countdown(today)}</span>
            </button>
          </div>
        </div>
        <div className="header-right">
          <div className="progress-block" aria-label={`${counts.done} of ${counts.total} tasks sorted`}>
            <div className="progress-ring" style={{ '--progress': `${counts.total ? counts.done / counts.total * 100 : 0}%` } as CSSProperties}><span>{counts.done}<small>/{counts.total}</small></span></div><span>sorted</span>
          </div>
          <IconButton label="Switch traveller" onClick={() => setIdentityOpen(true)} className="my-avatar"><Avatar traveller={me} /></IconButton>
        </div>
      </div>
      <div className="header-status">
        <span className={urgent > 0 ? 'urgent-summary' : 'urgent-clear'}>{urgent > 0 ? <TriangleAlert size={12} /> : <span className="connection-dot connection-connected" />} {loading ? 'Loading the trip' : urgent > 0 ? `${urgent} urgent to sort` : 'Urgent items sorted'}</span>
        <span className="trip-date-label">31 OCT &ndash; 08 NOV</span>
      </div>
    </header>
    {connection === 'preview' && <div className="preview-banner"><CircleHelp size={14} /><span>Read-only preview</span><span>Supabase not connected</span></div>}
    {error && !loading && data.tasks.length > 0 && <div className="sync-warning" role="status"><WifiOff size={15} /><span>{error}</span><IconButton label="Retry sync" onClick={() => void save(() => store.refresh())}><RefreshCw size={16} /></IconButton></div>}
    <main id="main-content" tabIndex={-1}>
      {loading ? <LoadingState /> : error && !data.tasks.length ?
        <EmptyState icon={WifiOff} title="We couldn't reach the trip" detail="The connection is unavailable. No changes have been made."><button className="button button-primary" onClick={() => void save(() => store.refresh())}><RefreshCw size={16} />Try again</button></EmptyState> :
        <Routes><Route path="/" element={<ChecklistPage />} /><Route path="/itinerary" element={<ItineraryPage />} /><Route path="/money" element={<MoneyPage />} /><Route path="/map" element={<MapPage />} /><Route path="/summary" element={<Navigate to="/map" replace />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes>}
    </main>
    <nav className="bottom-nav" aria-label="Trip navigation">{tabs.map(({ to, label, icon: Icon }) => <NavLink to={to} key={to} end={to === '/'} className={({ isActive }) => isActive ? 'nav-tab active' : 'nav-tab'}><Icon size={21} strokeWidth={1.8} /><span>{label}</span></NavLink>)}</nav>
    {!loading && data.travellers.length > 0 && (identityOpen || !me) && <IdentityPicker onClose={() => setIdentityOpen(false)} />}
    {connectionOpen && <Sheet title="With the group" onClose={() => setConnectionOpen(false)}>
      <div className="connection-detail"><span className={`connection-dot connection-${connection}`} /><h3>{connectionLabels[connection]}</h3>{connection === 'offline' ? <WifiOff size={21} /> : <Wifi size={21} />}</div>
      <dl className="connection-facts">
        <div><dt>Last synced</dt><dd>{lastSynced ? new Date(lastSynced).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Not yet'}</dd></div>
        <div><dt>Shared database</dt><dd>{connection === 'preview' ? 'Not connected' : 'Supabase'}</dd></div>
      </dl>
      {connection === 'preview' && <p className="preview-form-note">This preview cannot save changes. A Supabase connection is required for the shared trip.</p>}
      {connection === 'offline' && <p className="privacy-note">Changes cannot be saved while offline.</p>}
      <button className="button button-primary full-width" disabled={refreshing || connection === 'preview'} onClick={() => void save(() => store.refresh(), 'Trip refreshed.')}><RefreshCw size={17} className={refreshing ? 'spin' : ''} />Refresh trip</button>
    </Sheet>}
    <Toaster position="top-center" richColors closeButton toastOptions={{ className: 'trip-toast' }} />
  </div>
}

export default function App() {
  return <HashRouter><TripProvider><TripLayout /></TripProvider></HashRouter>
}
