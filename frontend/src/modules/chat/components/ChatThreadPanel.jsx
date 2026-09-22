import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Clock, Instagram, Loader2, Send } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { WhatsAppIcon } from '@/components/brand/WhatsAppIcon'
import { cn } from '@/lib/utils'
import { chatApi } from '@/services/chatApi'
import { conversationTitle, formatChatTimestamp } from '../lib/format'

function ChannelBadge({ channel }) {
  if (channel === 'whatsapp') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
        <WhatsAppIcon className="h-3 w-3" />
        WhatsApp
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-pink-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-pink-700">
      <Instagram className="h-3 w-3" />
      Instagram
    </span>
  )
}

async function fetchLatestMessages(conversationId) {
  const first = await chatApi.listMessages(conversationId, { page: 1, pageSize: 50 })
  if (!first?.totalPages || first.totalPages <= 1) {
    return first?.items || []
  }
  const last = await chatApi.listMessages(conversationId, {
    page: first.totalPages,
    pageSize: 50,
  })
  return last?.items || []
}

export function ChatThreadPanel({
  conversation,
  canSend,
  onBack,
  showBack,
  pollTick = 0,
  onSent,
}) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [draft, setDraft] = useState('')
  const scrollRef = useRef(null)
  const threadLoadedRef = useRef(false)

  const windowOpen = conversation?.messagingWindowOpen ?? false

  useEffect(() => {
    threadLoadedRef.current = false
    setMessages([])
  }, [conversation?.id])

  useEffect(() => {
    if (!conversation?.id) {
      return undefined
    }

    let cancelled = false
    const silent = threadLoadedRef.current && pollTick > 0

    const load = async () => {
      if (!silent) setLoading(true)
      try {
        const items = await fetchLatestMessages(conversation.id)
        if (!cancelled) {
          setMessages(items)
          threadLoadedRef.current = true
        }
      } catch (error) {
        if (!cancelled && !silent) {
          toast.error(error?.message || 'No se pudieron cargar los mensajes.')
        }
      } finally {
        if (!cancelled && !silent) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [conversation?.id, pollTick])

  useEffect(() => {
    const node = scrollRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [messages, conversation?.id])

  const handleSend = async () => {
    const body = draft.trim()
    if (!body || !conversation?.id || !canSend || !windowOpen) return
    setSending(true)
    try {
      const message = await chatApi.sendMessage(conversation.id, body)
      setMessages((prev) => [...prev, message])
      setDraft('')
      onSent?.()
    } catch (error) {
      toast.error(error?.message || 'No se pudo enviar el mensaje.')
    } finally {
      setSending(false)
    }
  }

  if (!conversation) {
    return (
      <div
        className="flex h-[min(72vh,720px)] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white shadow-soft"
        data-testid="chat-thread-empty"
      >
        <EmptyState
          title="Selecciona una conversación"
          description="Elige un hilo a la izquierda para ver el historial y responder."
        />
      </div>
    )
  }

  return (
    <div
      className="flex h-[min(72vh,720px)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft"
      data-testid="chat-thread-panel"
    >
      <header className="flex items-start gap-3 border-b border-slate-100 px-4 py-3">
        {showBack && (
          <Button type="button" variant="ghost" size="sm" className="mt-0.5 shrink-0" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate font-heading text-lg font-bold text-slate-900">
              {conversationTitle(conversation)}
            </h2>
            <ChannelBadge channel={conversation.channel} />
          </div>
          <p className="mt-0.5 text-xs text-slate-500">ID {conversation.participantProviderId}</p>
        </div>
        <div
          className={cn(
            'flex max-w-[11rem] items-start gap-1.5 rounded-lg px-2 py-1.5 text-xs',
            windowOpen ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900',
          )}
          data-testid="chat-window-indicator"
        >
          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {windowOpen
              ? 'Ventana de 24 h abierta'
              : 'Fuera de ventana de 24 h. En WhatsApp haría falta plantilla (próximamente).'}
          </span>
        </div>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-slate-50/50 p-4">
        {loading ? (
          <p className="flex items-center justify-center gap-2 py-12 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando mensajes…
          </p>
        ) : messages.length === 0 ? (
          <EmptyState title="Sin mensajes" description="Aún no hay mensajes en este hilo." className="py-8" />
        ) : (
          messages.map((message) => {
            const outbound = message.direction === 'outbound'
            return (
              <div
                key={message.id}
                className={cn('flex', outbound ? 'justify-end' : 'justify-start')}
                data-testid={`chat-message-${message.id}`}
              >
                <div
                  className={cn(
                    'max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm',
                    outbound
                      ? 'rounded-br-md bg-blue-600 text-white'
                      : 'rounded-bl-md border border-slate-200 bg-white text-slate-800',
                  )}
                >
                  <p className="whitespace-pre-wrap break-words">{message.bodyText}</p>
                  <p
                    className={cn(
                      'mt-1 text-[10px]',
                      outbound ? 'text-blue-100' : 'text-slate-400',
                    )}
                  >
                    {formatChatTimestamp(message.createdAt)}
                  </p>
                </div>
              </div>
            )
          })
        )}
      </div>

      <footer className="border-t border-slate-100 p-4">
        {!canSend ? (
          <p className="text-center text-xs text-slate-400">
            Necesitas el permiso <span className="font-medium">chat.send</span> para responder.
          </p>
        ) : (
          <div className="flex gap-2">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  handleSend()
                }
              }}
              disabled={!windowOpen || sending}
              rows={2}
              placeholder={
                windowOpen ? 'Escribe un mensaje…' : 'No puedes responder fuera de la ventana de 24 h'
              }
              className="min-h-[2.75rem] flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400"
              data-testid="chat-composer-input"
            />
            <Button
              type="button"
              onClick={handleSend}
              disabled={!windowOpen || sending || !draft.trim()}
              data-testid="chat-composer-send"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        )}
        {!windowOpen && canSend && (
          <p className="mt-2 text-center text-xs text-slate-500">
            <Link to="/configuracion?open=chat-canales" className="text-blue-600 hover:underline">
              Revisa la conexión de canales
            </Link>{' '}
            si esperabas poder responder.
          </p>
        )}
      </footer>
    </div>
  )
}
