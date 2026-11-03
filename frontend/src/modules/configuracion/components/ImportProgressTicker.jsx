import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

import {
  getTickerWindow,
  nextTickerStartIndex,
  TICKER_STEP_MS,
  TICKER_VISIBLE_COUNT,
} from '@/modules/configuracion/lib/importProgressTicker'

const ROW_HEIGHT_PX = 52

function TickerRow({ row }) {
  const subtitle = [row.date, row.time].filter(Boolean).join(' · ')
  const meta = [row.phone, subtitle, row.serviceName].filter(Boolean).join(' · ')

  return (
    <div className="flex min-h-[52px] flex-col justify-center border-b border-blue-100/80 px-1 py-2 last:border-b-0">
      <p className="truncate text-sm font-semibold text-slate-800">
        {row.displayName || 'Cita importada'}
      </p>
      {meta ? (
        <p className="truncate text-xs text-slate-500">{meta}</p>
      ) : null}
    </div>
  )
}

export function ImportProgressTicker({ rows, animating = true }) {
  const [startIndex, setStartIndex] = useState(0)
  const rowsRef = useRef(rows)
  rowsRef.current = rows

  useEffect(() => {
    if (rows.length === 0) setStartIndex(0)
  }, [rows.length])

  useEffect(() => {
    if (!animating) return undefined
    if (rows.length <= TICKER_VISIBLE_COUNT) return undefined

    const timer = window.setInterval(() => {
      setStartIndex((prev) => nextTickerStartIndex(rowsRef.current, prev))
    }, TICKER_STEP_MS)

    return () => window.clearInterval(timer)
  }, [animating, rows.length])

  const visibleRows = useMemo(
    () => getTickerWindow(rows, startIndex, TICKER_VISIBLE_COUNT),
    [rows, startIndex],
  )

  if (!visibleRows.length) return null

  const viewportHeight = TICKER_VISIBLE_COUNT * ROW_HEIGHT_PX

  return (
    <div
      className="mt-4 border-t border-blue-100/80 pt-3"
      data-testid="data-import-ticker"
      aria-live="polite"
      aria-label="Muestra de citas importadas"
    >
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-blue-700/80">
        Importando citas
      </p>
      <div
        className="relative overflow-hidden rounded-lg bg-white/60"
        style={{ height: `${Math.min(viewportHeight, visibleRows.length * ROW_HEIGHT_PX)}px` }}
      >
        <AnimatePresence initial={false} mode="popLayout">
          {visibleRows.map((row, index) => (
            <motion.div
              key={`${startIndex}-${index}-${row.id}`}
              layout
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -22 }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            >
              <TickerRow row={row} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
