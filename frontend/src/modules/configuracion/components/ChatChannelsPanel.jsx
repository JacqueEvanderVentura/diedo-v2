import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Instagram, MessageCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useConfigStore } from '@/stores/configStore'
import { useSessionStore } from '@/stores/sessionStore'
import { chatApi } from '@/services/chatApi'
import { navigateOauthPopup, openOauthPopupPlaceholder } from '@/modules/chat/lib/oauthPopup'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/utils'

const CHANNEL_META = {
  instagram: {
    label: 'Instagram',
    icon: Instagram,
    description: 'Mensajes directos de cuentas profesionales (Graph Messaging).',
  },
  whatsapp: {
    label: 'WhatsApp',
    icon: MessageCircle,
    description: 'WhatsApp Cloud API. El permiso se pide en Facebook Business, no en WhatsApp.',
  },
}

function statusBadge(status) {
  if (status === 'connected') {
    return (
      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
        Conectado
      </span>
    )
  }
  if (status === 'error') {
    return (
      <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-600">
        Error
      </span>
    )
  }
  return (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
      No conectado
    </span>
  )
}

export default function ChatChannelsPanel({ embedded, visibleBlockIds }) {
  const branches = useConfigStore((s) => s.branches) || []
  const online = useSessionStore((s) => s.status === 'online')
  const canManage = useSessionStore((s) => s.hasPermission('workspace.update'))
  const [searchParams, setSearchParams] = useSearchParams()

  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(false)
  const [connectingChannel, setConnectingChannel] = useState(null)
  const [branchModalAccount, setBranchModalAccount] = useState(null)
  const [selectedBranchIds, setSelectedBranchIds] = useState([])
  const [oauthSelect, setOauthSelect] = useState(null)
  const [savingBranches, setSavingBranches] = useState(false)
  const [blockedAuth, setBlockedAuth] = useState(null)
  const oauthPollRef = useRef(null)

  const stopOauthPoll = useCallback(() => {
    if (oauthPollRef.current) {
      window.clearInterval(oauthPollRef.current)
      oauthPollRef.current = null
    }
  }, [])

  const accountsByChannel = useMemo(() => {
    const map = { instagram: [], whatsapp: [] }
    for (const account of accounts) {
      if (account.connectionStatus !== 'connected') continue
      if (map[account.channel]) map[account.channel].push(account)
    }
    return map
  }, [accounts])

  const loadAccounts = useCallback(async () => {
    if (!online || !canManage) return
    setLoading(true)
    try {
      const data = await chatApi.listChannelAccounts()
      setAccounts(data.items || [])
    } catch (error) {
      toast.error(error?.message || 'No se pudieron cargar las cuentas de chat.')
    } finally {
      setLoading(false)
    }
  }, [online, canManage])

  useEffect(() => {
    loadAccounts()
  }, [loadAccounts])

  useEffect(() => () => stopOauthPoll(), [stopOauthPoll])

  useEffect(() => {
    const oauth = searchParams.get('chatOauth')
    if (!oauth || !canManage || !online) return

    const clearOauthParams = () => {
      const next = new URLSearchParams(searchParams)
      ;[
        'chatOauth',
        'chatOauthMessage',
        'chatOauthDetail',
        'chatOauthState',
        'chatChannel',
        'chatOauthCount',
      ].forEach((key) => next.delete(key))
      setSearchParams(next, { replace: true })
    }

    if (oauth === 'connected') {
      toast.success('Cuenta Meta conectada correctamente.')
      clearOauthParams()
      loadAccounts()
      return
    }

    if (oauth === 'error') {
      const hint = searchParams.get('chatOauthMessage')
      const detail = searchParams.get('chatOauthDetail')
      const messages = {
        no_accounts:
          'Meta no encontró un WhatsApp Business o Instagram para este usuario. El Facebook con el que entras debe ser admin del WABA en Business Manager.',
        oauth_denied: 'Cancelaste el permiso de Meta.',
        oauth_failed: 'No se pudo completar la conexión con Meta.',
        graph_failed: 'Meta Graph rechazó el token o la consulta de cuentas.',
        missing_state: 'Meta no devolvió la sesión de conexión. Vuelve a pulsar Conectar.',
        invalid_state:
          'No encontramos la sesión de conexión. Completa Facebook en la ventana nueva sin cerrar Helios y vuelve a conectar.',
        meta_not_configured: 'Faltan META_APP_ID / META_INSTAGRAM_APP_ID en el servidor.',
      }
      const text = messages[hint] || messages.oauth_failed
      toast.error(detail ? `${text} (${detail})` : text)
      clearOauthParams()
      return
    }

    if (oauth === 'select') {
      const stateId = searchParams.get('chatOauthState')
      const channel = searchParams.get('chatChannel')
      if (!stateId) {
        clearOauthParams()
        return
      }
      chatApi
        .getOAuthPending(stateId)
        .then((pending) => {
          setOauthSelect({
            oauthStateId: stateId,
            channel: pending.channel || channel,
            candidates: pending.candidates || [],
          })
        })
        .catch(() =>
          toast.error(
            'No encontramos la sesión de conexión. Vuelve a pulsar Conectar y termina Facebook en la ventana nueva.',
          ),
        )
        .finally(() => clearOauthParams())
    }
  }, [searchParams, canManage, online, setSearchParams, loadAccounts])

  const startOauthPoll = useCallback(
    (channel) => {
      const started = Date.now()
      oauthPollRef.current = window.setInterval(async () => {
        if (Date.now() - started > 5 * 60 * 1000) {
          stopOauthPoll()
          setConnectingChannel(null)
          return
        }
        try {
          const data = await chatApi.listChannelAccounts()
          const items = data.items || []
          setAccounts(items)
          const connected = items.some(
            (item) => item.channel === channel && item.connectionStatus === 'connected',
          )
          if (connected) {
            stopOauthPoll()
            setConnectingChannel(null)
            toast.success('Cuenta Meta conectada correctamente.')
          }
        } catch {
          /* keep polling until Meta finishes or the timeout */
        }
      }, 2500)
    },
    [stopOauthPoll],
  )

  const handleConnect = async (channel) => {
    if (!canManage) return
    stopOauthPoll()
    setBlockedAuth(null)
    setConnectingChannel(channel)
    const popup = openOauthPopupPlaceholder(channel)
    try {
      const { authorizationUrl } = await chatApi.startOAuth(channel)
      if (!navigateOauthPopup(popup, authorizationUrl)) {
        popup?.close?.()
        setBlockedAuth({ url: authorizationUrl, channel })
        toast.error(
          'El navegador bloqueó la ventana de Meta. Permite ventanas emergentes en Helios y pulsa Abrir Meta.',
        )
        setConnectingChannel(null)
        return
      }
      toast.message(
        channel === 'whatsapp'
          ? 'WhatsApp Cloud se autoriza en Facebook (Business). Completa el permiso en la ventana nueva; Helios se queda abierto.'
          : 'Completa el permiso de Meta en la ventana nueva. Esta pantalla se actualizará sola.',
      )
      startOauthPoll(channel)
    } catch (error) {
      popup?.close?.()
      toast.error(error?.message || 'Meta no está configurada en el servidor.')
      setConnectingChannel(null)
    }
  }

  const handleOpenBlockedAuth = () => {
    if (!blockedAuth?.url) return
    const popup = openOauthPopupPlaceholder(blockedAuth.channel || 'retry')
    if (!navigateOauthPopup(popup, blockedAuth.url)) {
      popup?.close?.()
      toast.error('Sigue bloqueada la ventana emergente. Permítela para app.helios360erp.com.')
      return
    }
    setConnectingChannel(blockedAuth.channel || null)
    startOauthPoll(blockedAuth.channel)
    setBlockedAuth(null)
  }

  const openBranchModal = (account) => {
    setBranchModalAccount(account)
    setSelectedBranchIds(account.assignedBranchIds || [])
  }

  const toggleBranch = (branchId) => {
    setSelectedBranchIds((prev) =>
      prev.includes(branchId) ? prev.filter((id) => id !== branchId) : [...prev, branchId],
    )
  }

  const saveBranches = async () => {
    if (!branchModalAccount) return
    setSavingBranches(true)
    try {
      const updated = await chatApi.updateAccountBranches(
        branchModalAccount.id,
        selectedBranchIds,
      )
      setAccounts((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
      toast.success('Sucursales actualizadas.')
      setBranchModalAccount(null)
    } catch (error) {
      toast.error(error?.message || 'No se pudieron guardar las sucursales.')
    } finally {
      setSavingBranches(false)
    }
  }

  const handleDisconnect = async (account) => {
    if (!window.confirm(`¿Desconectar ${account.displayName || account.channel}?`)) return
    try {
      const updated = await chatApi.disconnectAccount(account.id)
      setAccounts((prev) => prev.filter((item) => item.id !== (updated?.id || account.id)))
      toast.success('Cuenta desconectada.')
    } catch (error) {
      toast.error(error?.message || 'No se pudo desconectar la cuenta.')
    }
  }

  const completeOAuthSelection = async (providerAccountId) => {
    if (!oauthSelect) return
    try {
      const account = await chatApi.completeOAuth({
        oauthStateId: oauthSelect.oauthStateId,
        providerAccountId,
      })
      setAccounts((prev) => {
        const rest = prev.filter((item) => item.id !== account.id)
        return [...rest, account]
      })
      setOauthSelect(null)
      toast.success('Cuenta conectada.')
      openBranchModal(account)
    } catch (error) {
      toast.error(error?.message || 'No se pudo completar la conexión.')
    }
  }

  return (
    <div className={embedded ? '' : 'space-y-6'} data-testid="chat-channels-panel">
      <p className="text-sm text-slate-600">
        Conecta una cuenta Meta por canal y asígnala a una o varias sucursales. Varias sucursales pueden
        usar el mismo Instagram o WhatsApp sin duplicar el token. Los tokens permanecen solo en el servidor.
        WhatsApp Cloud se conecta con Facebook Business (no con whatsapp.com).
      </p>

      {blockedAuth?.url && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p>El navegador bloqueó la ventana de Meta. Permite ventanas emergentes y ábrela de nuevo.</p>
          <Button type="button" size="sm" onClick={handleOpenBlockedAuth}>
            Abrir Meta
          </Button>
        </div>
      )}

      {!canManage && online && (
        <p className="text-sm text-amber-700">
          Se requiere el permiso <span className="font-medium">workspace.update</span> para conectar cuentas.
        </p>
      )}

      {loading && (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando cuentas…
        </p>
      )}

      <div className="space-y-3">
        {['instagram', 'whatsapp']
          .filter((channel) => {
            if (!visibleBlockIds?.length) return true
            if (visibleBlockIds.includes(channel)) return true
            const mentionsChannel = visibleBlockIds.some((id) => id === 'instagram' || id === 'whatsapp')
            return !mentionsChannel && visibleBlockIds.includes('branches')
          })
          .map((channel) => {
          const meta = CHANNEL_META[channel]
          const Icon = meta.icon
          const channelAccounts = accountsByChannel[channel] || []
          const hasConnected = channelAccounts.some((a) => a.connectionStatus === 'connected')

          return (
            <div
              key={channel}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-soft"
              data-testid={`chat-channel-${channel}`}
              data-settings-block={`chat-canales:${channel}`}
            >
              <div className="flex flex-wrap items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-800">{meta.label}</p>
                    {statusBadge(hasConnected ? 'connected' : 'disconnected')}
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{meta.description}</p>

                  {channelAccounts.length > 0 && (
                    <ul className="mt-3 space-y-2">
                      {channelAccounts.map((account) => (
                        <li
                          key={account.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2"
                        >
                          <div>
                            <p className="text-sm font-medium text-slate-800">
                              {account.displayName || account.providerAccountId}
                            </p>
                            <p className="text-xs text-slate-500">
                              {account.assignedBranchIds?.length
                                ? `${account.assignedBranchIds.length} sucursal(es)`
                                : 'Sin sucursales asignadas'}
                            </p>
                          </div>
                          {canManage && online && account.connectionStatus === 'connected' && (
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => openBranchModal(account)}
                              >
                                Sucursales
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDisconnect(account)}
                              >
                                Desconectar
                              </Button>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {canManage && online && (
                  <Button
                    type="button"
                    size="sm"
                    disabled={connectingChannel === channel}
                    onClick={() => handleConnect(channel)}
                  >
                    {connectingChannel === channel ? (
                      <>
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                        Abriendo Meta…
                      </>
                    ) : (
                      'Conectar'
                    )}
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <Modal
        open={Boolean(branchModalAccount)}
        onClose={() => !savingBranches && setBranchModalAccount(null)}
        title="Asignar sucursales"
      >
        {branchModalAccount && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Elige qué sucursales verán los mensajes de{' '}
              <span className="font-medium">{branchModalAccount.displayName}</span>.
            </p>
            <ul className="max-h-64 space-y-2 overflow-y-auto">
              {branches.length === 0 ? (
                <li className="text-sm text-slate-400">No hay sucursales cargadas.</li>
              ) : (
                branches.map((branch) => {
                  const checked = selectedBranchIds.includes(branch.id)
                  return (
                    <li key={branch.id}>
                      <label
                        className={cn(
                          'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm',
                          checked ? 'border-blue-200 bg-blue-50/50' : 'border-slate-200',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleBranch(branch.id)}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        {branch.name}
                      </label>
                    </li>
                  )
                })
              )}
            </ul>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setBranchModalAccount(null)}>
                Cancelar
              </Button>
              <Button type="button" onClick={saveBranches} disabled={savingBranches}>
                Guardar
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(oauthSelect)}
        onClose={() => setOauthSelect(null)}
        title="Elige la cuenta Meta"
      >
        {oauthSelect && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Meta devolvió varias cuentas para{' '}
              <span className="font-medium">{CHANNEL_META[oauthSelect.channel]?.label}</span>.
            </p>
            <ul className="space-y-2">
              {oauthSelect.candidates.map((candidate) => (
                <li key={candidate.providerAccountId}>
                  <button
                    type="button"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:border-blue-200 hover:bg-blue-50/40"
                    onClick={() => completeOAuthSelection(candidate.providerAccountId)}
                  >
                    <span className="font-medium text-slate-800">{candidate.displayName}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      ID {candidate.providerAccountId}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Modal>
    </div>
  )
}
