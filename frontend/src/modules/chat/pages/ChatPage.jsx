import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { chatInboxCopy, useAppReviewEnglish } from '../lib/appReviewLocale'
import { Link } from 'react-router-dom'
import { AlertTriangle, RefreshCw, Settings } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useActiveBranchScope } from '@/hooks/useActiveBranchScope'
import { useSessionStore } from '@/stores/sessionStore'
import { chatApi } from '@/services/chatApi'
import { isUuid } from '@/lib/workspaceBranch'
import { ChatConversationList } from '../components/ChatConversationList'
import { ChatThreadPanel } from '../components/ChatThreadPanel'

export const POLL_MS = 12_000

export default function ChatPage() {
  const online = useSessionStore((s) => s.status === 'online')
  const canSend = useSessionStore((s) => s.hasPermission('chat.send'))
  const { activeBranchId, setActiveBranch, selectOptions } = useActiveBranchScope()
  const reviewEn = useAppReviewEnglish()
  const copy = useMemo(() => chatInboxCopy(reviewEn), [reviewEn])
  const channelsPath = reviewEn
    ? '/configuracion?open=chat-canales&lang=en'
    : '/configuracion?open=chat-canales'

  const [conversations, setConversations] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [search, setSearch] = useState('')
  const [channelFilter, setChannelFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [mobileShowThread, setMobileShowThread] = useState(false)
  const [searchDebounced, setSearchDebounced] = useState('')
  const [pollTick, setPollTick] = useState(0)
  const selectedIdRef = useRef(null)
  const conversationsRef = useRef(conversations)
  selectedIdRef.current = selectedId
  conversationsRef.current = conversations

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
    const background = conversationsRef.current.length > 0
    if (background) setRefreshing(true)
    else setLoading(true)
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
      setError(err?.message || copy.loadError)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [online, activeBranchId, channelFilter, searchDebounced, copy.loadError])

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchDebounced(search), 300)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    loadConversations()
  }, [loadConversations, pollTick])

  useEffect(() => {
    if (!online) return undefined

    const tick = () => {
      if (document.hidden) return
      setPollTick((value) => value + 1)
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') tick()
    }

    const timer = window.setInterval(tick, POLL_MS)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [online])

  const handleSelectConversation = (id) => {
    setSelectedId(id)
    setMobileShowThread(true)
  }

  const refreshAll = () => setPollTick((value) => value + 1)

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-4 p-6 sm:p-8" data-testid="chat-inbox-page">
      {copy.appReviewBanner ? (
        <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-900">
          {copy.appReviewBanner}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{copy.headerSubtitle}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={refreshAll}
            disabled={loading || !online}
          >
            <RefreshCw className={loading || refreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            {copy.refresh}
          </Button>
          <Link to={channelsPath}>
            <Button type="button" variant="secondary" size="sm">
              <Settings className="h-4 w-4" />
              {copy.channels}
            </Button>
          </Link>
        </div>
      </div>

      {!online && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {copy.offline}
        </div>
      )}

      {!activeBranchId && online && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          {copy.noActiveBranch}
        </div>
      )}

      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </span>
          <Button size="sm" variant="secondary" onClick={refreshAll}>
            {copy.retry}
          </Button>
        </div>
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
            copy={copy}
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
            copy={copy}
            channelsPath={channelsPath}
          />
        </div>
      </div>
    </div>
  )
}
