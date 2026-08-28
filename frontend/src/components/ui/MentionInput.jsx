import { useMemo, useRef, useState, useEffect } from 'react'
import { useConfigStore } from '@/stores/configStore'
import { useRrhhStore } from '@/stores/rrhhStore'
import {
  buildMentionCatalog,
  filterMentionCatalog,
  buildMentionToken,
  detectActiveMention,
} from '@/lib/mentions'
import { cn } from '@/lib/utils'

export function MentionInput({
  value,
  onChange,
  onKeyDown,
  placeholder,
  className,
  testId,
  disabled,
}) {
  const users = useConfigStore((s) => s.users)
  const employees = useRrhhStore((s) => s.employees)
  const inputRef = useRef(null)
  const menuRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [mentionCtx, setMentionCtx] = useState(null)

  const catalog = useMemo(() => buildMentionCatalog(users, employees), [users, employees])
  const options = useMemo(
    () => (mentionCtx ? filterMentionCatalog(catalog, mentionCtx.query) : []),
    [catalog, mentionCtx]
  )

  useEffect(() => {
    setOpen(!!mentionCtx && options.length > 0)
    setActiveIndex(0)
  }, [mentionCtx, options.length])

  const syncMention = () => {
    const el = inputRef.current
    if (!el) return
    setMentionCtx(detectActiveMention(value, el.selectionStart ?? value.length))
  }

  const insertMention = (item) => {
    const el = inputRef.current
    if (!el || !mentionCtx) return

    const token = `${buildMentionToken(item)} `
    const before = value.slice(0, mentionCtx.start)
    const after = value.slice(el.selectionStart ?? value.length)
    const next = `${before}${token}${after}`
    onChange(next)
    setMentionCtx(null)
    setOpen(false)

    requestAnimationFrame(() => {
      const pos = before.length + token.length
      el.focus()
      el.setSelectionRange(pos, pos)
    })
  }

  const handleKeyDown = (e) => {
    if (open && options.length) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => (i + 1) % options.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => (i - 1 + options.length) % options.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        insertMention(options[activeIndex])
        return
      }
      if (e.key === 'Escape') {
        setOpen(false)
        setMentionCtx(null)
        return
      }
    }
    onKeyDown?.(e)
  }

  return (
    <div className="relative w-full min-w-0 flex-1">
      <textarea
        ref={inputRef}
        value={value}
        disabled={disabled}
        rows={3}
        onChange={(e) => {
          onChange(e.target.value)
          requestAnimationFrame(syncMention)
        }}
        onClick={syncMention}
        onKeyUp={syncMention}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        placeholder={placeholder}
        data-testid={testId}
        className={cn('w-full resize-none', className)}
      />

      {open && (
        <div
          ref={menuRef}
          className="absolute bottom-full left-0 z-50 mb-2 w-full min-w-[240px] overflow-hidden rounded-xl border border-slate-100 bg-white p-1 shadow-xl"
          data-testid="mention-menu"
        >
          {options.map((item, index) => (
            <button
              key={`${item.type}-${item.id}`}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertMention(item)}
              className={cn(
                'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                index === activeIndex ? 'bg-slate-100' : 'hover:bg-slate-50'
              )}
            >
              <span
                className={cn(
                  'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase',
                  item.type === 'user' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-800'
                )}
              >
                {item.type === 'user' ? 'Usuario' : 'Empleado'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-slate-800">{item.label}</span>
                <span className="block truncate text-xs text-slate-400">{item.hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
