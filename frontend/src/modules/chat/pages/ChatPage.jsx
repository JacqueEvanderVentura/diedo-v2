import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Loader2, RefreshCw, Settings } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useActiveBranchScope } from '@/hooks/useActiveBranchScope'
import { useSessionStore } from '@/stores/sessionStore'
import { chatApi } from '@/services/chatApi'
import { isUuid } from '@/lib/workspaceBranch'
import { ChatConversationList } from '../components/ChatConversationList'
import { ChatThreadPanel } from '../components/ChatThreadPanel'

const POLL_MS = 12_000

export default function ChatPage() {
  const online = useSessionStore((s) => s.status === 'online')
  const canSend = useSessionStore((s) => s.hasPermission('chat.send'))
  const { activeBranchId, setActiveBranch, selectOptions } = useActiveBranchScope()

  const [conversations, setConversations] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [search, setSearch] = useState('')
  const [channelFilter, setChannelFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [mobileShowThread, setMobileShowThread] = useState(false)
  const [searchDebounced, setSearchDebounced] = useState('')
  const [pollTick, setPollTick] = useState(0)
  const selectedIdRef = useRef(null)
  selectedIdRef.current = selectedId

  const selectedConversation = useMemo(
    () => conversations.find((item) => item.id === selectedId) || null,
    [conversations, selectedId],
  )

  const loadConversations = useCallback(async () => {
    if (!online || !isUuid(activeBranchId)) {
      setConversations([])
      return
    }
    setError(null)
    setLoading(true)
    try {
      const params = {
        branchId: activeBranchId,
        page: 1,
        pageSize: 50,
      }
      if (channelFilter) params.channel = channelFilter
      const trimmed = searchDebounced.trim()
      if (trimmed) params.search = trimmed

      const data = await chatApi.listConversations(params)
      const items = data.items || []
      setConversations(items)
      const currentSelected = selectedIdRef.current
      if (currentSelected && !items.some((item) => item.id === currentSelected)) {
        setSelectedId(null)
        setMobileShowThread(false)
      }
    } catch (err) {
      setError(err?.message || 'No se pudieron cargar las conversaciones.')
    } finally {
      setLoading(false)
    }
  }, [online, activeBranchId, channelFilter, searchDebounced])

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchDebounced(search), 300)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    loadConversations()
  }, [loadConversations, pollTick])

  useEffect(() => {
    if (!online) return undefined
    const timer = window.setInterval(() => {
      setPollTick((value) => value + 1)
    }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [online])

  const handleSelectConversation = (id) => {
    setSelectedId(id)
    setMobileShowThread(true)
  }

  const refreshAll = () => setPollTick((value) => value + 1)

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-4 p-6 sm:p-8" data-testid="chat-inbox-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          Bandeja unificada por sucursal. Las cuentas compartidas muestran los mismos hilos en cada
          sucursal asignada.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={refreshAll}
            disabled={loading || !online}
          >
            <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            Actualizar
          </Button>
          <Link to="/configuracion?open=chat-canales">
            <Button type="button" variant="secondary" size="sm">
              <Settings className="h-4 w-4" />
              Canales
            </Button>
          </Link>
        </div>
      </div>

      {!online && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Inicia sesión en línea para ver el inbox de chat.
        </div>
      )}

      {!activeBranchId && online && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          No hay sucursal activa. Elige una sucursal en el selector del ERP.
        </div>
      )}

      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </span>
          <Button size="sm" variant="secondary" onClick={refreshAll}>
            Reintentar
          </Button>
        </div>
      )}

      {loading && conversations.length > 0 && (
        <p className="flex items-center gap-2 text-xs text-slate-400">
          <Loader2 className="h-3 w-3 animate-spin" />
          Actualizando…
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div
          className={mobileShowThread ? 'hidden lg:col-span-2 lg:block' : 'lg:col-span-2'}
        >
          <ChatConversationList
            items={conversations}
            selectedId={selectedId}
            onSelect={handleSelectConversation}
            search={search}
            onSearchChange={setSearch}
            channelFilter={channelFilter}
            onChannelFilterChange={setChannelFilter}
            branchSelectOptions={selectOptions}
            branchId={activeBranchId}
            onBranchChange={setActiveBranch}
            loading={loading}
          />
        </div>
        <div
          className={mobileShowThread ? 'lg:col-span-3' : 'hidden lg:col-span-3 lg:block'}
        >
          <ChatThreadPanel
            conversation={selectedConversation}
            canSend={canSend}
            showBack={mobileShowThread}
            onBack={() => setMobileShowThread(false)}
            pollTick={pollTick}
            onSent={refreshAll}
          />
        </div>
      </div>
    </div>
  )
}
