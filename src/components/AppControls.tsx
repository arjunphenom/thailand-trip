import { useEffect, useState } from 'react'
import { Bell, Check, Download, Link, RefreshCw, Send, Smartphone } from 'lucide-react'
import { appRequest, tripClient } from '../lib/client.ts'
import { IconButton, Sheet } from './ui.tsx'

interface InstallPrompt extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const topics = [{ id: 'tasks', label: 'Tasks and comments' }, { id: 'money', label: 'Expenses and settlements' }, { id: 'itinerary', label: 'Itinerary changes' }]

function standalone() {
  return matchMedia('(display-mode: standalone)').matches || !!(navigator as Navigator & { standalone?: boolean }).standalone
}

function vapidBytes(value: string): Uint8Array<ArrayBuffer> {
  const decoded = atob(value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '='))
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0))
}

export function AppControls() {
  const [open, setOpen] = useState(false)
  const [installed, setInstalled] = useState(standalone)
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null)
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null)
  const [updateReady, setUpdateReady] = useState(false)
  const [subscription, setSubscription] = useState<PushSubscription | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [selectedTopics, setSelectedTopics] = useState(topics.map((topic) => topic.id))
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [invitation, setInvitation] = useState<string | null>(null)
  const appleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const pushSupported = 'Notification' in window && 'PushManager' in window && 'serviceWorker' in navigator
  const needsHomeScreen = appleMobile && !installed

  useEffect(() => {
    const beforeInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPrompt) }
    const afterInstall = () => { setInstalled(true); setInstallPrompt(null) }
    window.addEventListener('beforeinstallprompt', beforeInstall)
    window.addEventListener('appinstalled', afterInstall)
    return () => {
      window.removeEventListener('beforeinstallprompt', beforeInstall)
      window.removeEventListener('appinstalled', afterInstall)
    }
  }, [])

  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
    let active = true
    let worker: ServiceWorkerRegistration | null = null
    let installing: ServiceWorker | null = null
    const observeState = () => { if (active && worker?.waiting) setUpdateReady(true) }
    const observeUpdate = () => {
      installing = worker?.installing ?? null
      installing?.addEventListener('statechange', observeState)
    }
    const checkUpdate = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) void worker?.update().catch(() => {})
    }
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
      scope: import.meta.env.BASE_URL, updateViaCache: 'none',
    }).then(async (result) => {
      if (!active) return
      worker = result
      setUpdateReady(!!result.waiting)
      result.addEventListener('updatefound', observeUpdate)
      observeUpdate()
      await navigator.serviceWorker.ready
      if (active) setRegistration(result)
    }).catch(() => { if (active) setError('App installation is unavailable. Reconnect and reload.') })
    document.addEventListener('visibilitychange', checkUpdate)
    return () => {
      active = false
      document.removeEventListener('visibilitychange', checkUpdate)
      worker?.removeEventListener('updatefound', observeUpdate)
      installing?.removeEventListener('statechange', observeState)
    }
  }, [])

  useEffect(() => {
    if (!registration || !tripClient || !pushSupported) return
    let active = true
    void registration.pushManager.getSubscription().then(async (device) => {
      if (!active) return
      setSubscription(device)
      if (!device) return
      const result = await appRequest<{ subscribed: boolean; topics: string[] }>('status', { endpoint: device.endpoint })
      if (active) { setEnabled(result.subscribed); setSelectedTopics(result.topics) }
    }).catch(() => { if (active) setError('Could not verify notification settings. Reconnect to check them.') })
    return () => { active = false }
  }, [registration, pushSupported])

  const enableNotifications = async () => {
    if (!registration || !tripClient || !pushSupported) return
    setPending(true)
    setError(null)
    setMessage(null)
    let created: PushSubscription | null = null
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') throw new Error('Notifications are blocked. Allow them in this browser or device settings.')
      const config = await appRequest<{ publicKey: string }>('config')
      let device = await registration.pushManager.getSubscription()
      if (!device) {
        device = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidBytes(config.publicKey) })
        created = device
      }
      await appRequest('subscribe', { subscription: device.toJSON(), topics: selectedTopics })
      setSubscription(device)
      setEnabled(true)
      setMessage('Notifications enabled on this device.')
    } catch (failure) {
      if (created) await created.unsubscribe().catch(() => {})
      setError((failure as Error).message || 'Could not enable notifications.')
    } finally { setPending(false) }
  }

  const disableNotifications = async () => {
    setPending(true)
    setError(null)
    setMessage(null)
    try {
      const device = subscription ?? await registration?.pushManager.getSubscription()
      if (device) {
        await appRequest('unsubscribe', { endpoint: device.endpoint })
        await device.unsubscribe()
      }
      setSubscription(null)
      setEnabled(false)
      setMessage('Notifications disabled on this device.')
    } catch { setError('Could not disable notifications. Reconnect and retry.') }
    finally { setPending(false) }
  }

  return <>
    <IconButton label="App and notifications" onClick={() => setOpen(true)} className="app-settings-button"><Smartphone size={21} />{updateReady && <span className="app-update-dot" />}</IconButton>
    {open && <Sheet title="App & notifications" onClose={() => setOpen(false)}>
      <section className="app-setting-section" aria-label="App installation">
        <h3><Smartphone size={18} />On this phone</h3>
        {installed ? <p className="app-status"><Check size={16} />Installed</p> : installPrompt ? <button className="button button-primary full-width" onClick={async () => {
          await installPrompt.prompt()
          const choice = await installPrompt.userChoice
          if (choice.outcome === 'accepted') setInstalled(true)
          setInstallPrompt(null)
        }}><Download size={17} />Install app</button> : <p className="app-platform-note">{appleMobile ? 'Safari: Share > Add to Home Screen.' : 'Install from your browser menu when available.'}</p>}
        {updateReady && <button className="button button-secondary full-width" onClick={() => {
          if (!registration?.waiting) return
          navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true })
          registration.waiting.postMessage({ type: 'SKIP_WAITING' })
        }}><RefreshCw size={17} />Update app</button>}
      </section>
      <section className="app-setting-section" aria-label="Notification settings">
        <h3><Bell size={18} />Notifications</h3>
        {needsHomeScreen ? <p className="app-platform-note">On iPhone or iPad, notifications require the Home Screen app and iOS 16.4 or later.</p> : !pushSupported ? <p className="app-platform-note">This browser does not support push notifications.</p> : !import.meta.env.PROD ? <p className="app-platform-note">Notifications are available in the built or installed app.</p> : null}
        <label className="app-toggle"><span>Updates on this device</span><input type="checkbox" role="switch" aria-label="Notifications on this device" checked={enabled} disabled={pending || !registration || !tripClient || !pushSupported || needsHomeScreen} onChange={() => void (enabled ? disableNotifications() : enableNotifications())} /></label>
        {topics.map((topic) => <label className="app-toggle" key={topic.id}><span>{topic.label}</span><input type="checkbox" checked={selectedTopics.includes(topic.id)} disabled={pending || !enabled} onChange={async (event) => {
          const next = event.target.checked ? [...selectedTopics, topic.id] : selectedTopics.filter((value) => value !== topic.id)
          if (!subscription) return
          setPending(true)
          setError(null)
          try {
            await appRequest('subscribe', { subscription: subscription.toJSON(), topics: next })
            setSelectedTopics(next)
          } catch (failure) { setError((failure as Error).message) }
          finally { setPending(false) }
        }} /></label>)}
        <button className="button button-secondary full-width" disabled={!enabled || pending} onClick={async () => {
          if (!subscription) return
          setPending(true)
          setError(null)
          try {
            await appRequest('test', { endpoint: subscription.endpoint })
            setMessage('Test accepted by the push service. Check this device for the notification.')
          } catch (failure) { setError((failure as Error).message) }
          finally { setPending(false) }
        }}><Send size={16} />Send test notification</button>
      </section>
      <section className="app-setting-section" aria-label="Trip invitation">
        <button className="button button-secondary full-width" disabled={!tripClient || pending} onClick={async () => {
          setError(null)
          setPending(true)
          try {
            const { url } = await appRequest<{ url: string }>('invite')
            setInvitation(url)
            await navigator.clipboard.writeText(url)
            setMessage('Private invitation copied. Share only with your group.')
          } catch { setError('Could not copy the invitation. Select the link below if it is shown.') }
          finally { setPending(false) }
        }}><Link size={17} />Copy private invitation</button>
        {invitation && <input className="app-invitation" readOnly aria-label="Private invitation" value={invitation} onFocus={(event) => event.target.select()} />}
      </section>
      <p className="app-platform-note">Location updates require this app to stay open. Offline views may be out of date. This app is not an emergency tracking service.</p>
      {pending && <p className="app-status" role="status">Saving...</p>}
      {message && <p className="app-status" role="status">{message}</p>}
      {error && <p className="access-error" role="alert">{error}</p>}
    </Sheet>}
  </>
}