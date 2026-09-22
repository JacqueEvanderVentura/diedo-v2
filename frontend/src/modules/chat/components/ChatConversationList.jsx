import { Instagram, Search } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { EmptyState } from '@/components/ui/EmptyState'
import { WhatsAppIcon } from '@/components/brand/WhatsAppIcon'
import { cn } from '@/lib/utils'
import { conversationTitle, formatChatTimestamp } from '../lib/format'

const CHANNEL_FILTERS = [
  { value: '', label: 'Todos los canales' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'instagram', label: 'Instagram' },
]

function ChannelIcon({ channel, className }) {
  if (channel === 'whatsapp') {
    return <WhatsAppIcon className={cn('h-4 w-4 text-emerald-600', className)} />
  }
  return <Instagram className={cn('h-4 w-4 text-pink-600', className)} />
}

export function ChatConversationList({
  items,
  selectedId,
  onSelect,
  search,
  onSearchChange,
  channelFilter,
  onChannelFilterChange,
  branchSelectOptions,
  branchId,
  onBranchChange,
  loading,
}) {
  return (
    <div
      className="flex h-[min(72vh,720px)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft"
      data-testid="chat-conversation-list"
    >
      <div className="space-y-3 border-b border-slate-100 p-4">
        {branchSelectOptions.length > 1 && (
          <Select
            value={branchId}
            onChange={onBranchChange}
            options={branchSelectOptions}
            size="sm"
            data-testid="chat-branch-select"
          />
        )}
        <Select
          value={channelFilter}
          onChange={onChannelFilterChange}
          options={CHANNEL_FILTERS}
          size="sm"
          data-testid="chat-channel-filter"
        />
        <Input
          icon={Search}
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Buscar conversación…"
          data-testid="chat-search"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-400">Cargando hilos…</p>
        ) : items.length === 0 ? (
          <EmptyState
            title="Sin conversaciones"
            description="No hay mensajes para esta sucursal y filtro. Conecta canales en Configuración o espera mensajes entrantes."
            className="py-10"
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((conversation) => {
              const active = conversation.id === selectedId
              return (
                <li key={conversation.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(conversation.id)}
                    data-testid={`chat-thread-${conversation.id}`}
                    className={cn(
                      'flex w-full gap-3 px-4 py-3 text-left transition-colors',
                      active ? 'bg-blue-50/80' : 'hover:bg-slate-50',
                    )}
                  >
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100">
                      <ChannelIcon channel={conversation.channel} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate font-semibold text-slate-800">
                          {conversationTitle(conversation)}
                        </p>
                        <span className="shrink-0 text-[11px] text-slate-400">
                          {formatChatTimestamp(conversation.lastMessageAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-sm text-slate-500">
                        {conversation.lastMessagePreview || 'Sin mensajes'}
                      </p>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
