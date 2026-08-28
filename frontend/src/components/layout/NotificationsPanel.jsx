import { useMemo, useRef, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck } from 'lucide-react'
import { DropdownPanel } from '@/components/ui/DropdownPanel'
import { useNotificationsStore } from '@/stores/notificationsStore'
import { useIncidenciasStore } from '@/stores/incidenciasStore'
import { CURRENT_USER } from '@/data/dashboard'
import { cn } from '@/lib/utils'

function fmtWhen(iso) {
  try {
    return new Date(iso).toLocaleString('es-DO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

export function NotificationsPanel() {
  const navigate = useNavigate()
  const anchorRef = useRef(null)
  const menuRef = useRef(null)
  const [open, setOpen] = useState(false)

  const allNotifications = useNotificationsStore((s) => s.notifications)
  const markRead = useNotificationsStore((s) => s.markRead)
  const markAllRead = useNotificationsStore((s) => s.markAllRead)
  const setSelectedId = useIncidenciasStore((s) => s.setSelectedId)

  const notifications = useMemo(
    () =>
      allNotifications
        .filter((n) => n.userId === CURRENT_USER.id)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    [allNotifications]
  )

  const unread = notifications.filter((n) => !n.read).length

  useEffect(() => {
    if (!open) return
    function onClick(e) {
      if (anchorRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const openNotification = (n) => {
    markRead(n.id)
    setOpen(false)
    if (n.link?.incidenciaId) setSelectedId(n.link.incidenciaId)
    if (n.link?.path) navigate(n.link.path)
  }

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        data-testid="navbar-notifications"
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-2 top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      <DropdownPanel
        open={open}
        anchorRef={anchorRef}
        menuRef={menuRef}
        align="end"
        width={360}
        estimatedHeight={320}
        zIndex={120}
        testId="notifications-panel"
        className="p-0"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <p className="font-heading text-sm font-bold text-slate-900">Notificaciones</p>
          {unread > 0 && (
            <button
              type="button"
              onClick={() => markAllRead(CURRENT_USER.id)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Marcar todas
            </button>
          )}
        </div>

        <div className="max-h-80 overflow-y-auto p-2">
          {notifications.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-slate-400">No tienes notificaciones.</p>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => openNotification(n)}
                data-testid={`notification-${n.id}`}
                className={cn(
                  'flex w-full flex-col gap-1 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-slate-50',
                  !n.read && 'bg-blue-50/60'
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-800">{n.title}</p>
                  {!n.read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-600" />}
                </div>
                <p className="text-xs leading-relaxed text-slate-500">{n.body}</p>
                <p className="text-[10px] text-slate-400">{fmtWhen(n.createdAt)}</p>
              </button>
            ))
          )}
        </div>
      </DropdownPanel>
    </>
  )
}
