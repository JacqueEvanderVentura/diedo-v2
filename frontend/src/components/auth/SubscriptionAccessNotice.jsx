import { useEffect, useState } from 'react'
import { useSessionStore } from '@/stores/sessionStore'
import { authApi } from '@/services/authApi'
import { Button } from '@/components/ui/Button'

export function SubscriptionAccessNotice({ moduleUnavailable = false }) {
  const [workspaces, setWorkspaces] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const currentWorkspaceId = useSessionStore((state) => state.user?.workspaceId)
  useEffect(() => {
    let active = true
    authApi
      .workspaces()
      .then((data) => {
        if (active) setWorkspaces(Array.isArray(data) ? data : data.items || [])
      })
      .catch((err) => {
        if (active) setError(err.message)
      })
    return () => {
      active = false
    }
  }, [])
  const run = async (action) => {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="mx-auto my-12 max-w-xl rounded-2xl border border-amber-200 bg-white p-8 text-center">
      <h1 className="text-xl font-semibold">
        {moduleUnavailable ? 'Acceso al panel no disponible' : 'Suscripción sin acceso vigente'}
      </h1>
      <p className="mt-3 text-sm text-slate-600">
        {moduleUnavailable
          ? 'Contacta al administrador para revisar tus módulos y permisos.'
          : 'Contacta al administrador de la plataforma para revisar la vigencia de esta compañía.'}
      </p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-amber-800">
          {error}
        </p>
      )}
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button
          disabled={busy}
          onClick={() => run(() => useSessionStore.getState().refreshCurrentUser())}
        >
          Comprobar acceso
        </Button>
        {workspaces
          .filter((workspace) => workspace.workspaceId !== currentWorkspaceId)
          .map((workspace) => (
            <Button
              key={workspace.workspaceId}
              variant="secondary"
              disabled={busy}
              onClick={() =>
                run(() => useSessionStore.getState().switchWorkspace(workspace.workspaceId))
              }
            >
              Ir a {workspace.name}
            </Button>
          ))}
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => run(() => useSessionStore.getState().logout())}
        >
          Cerrar sesión
        </Button>
      </div>
    </div>
  )
}
