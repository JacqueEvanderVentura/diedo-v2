import { useEffect, useRef, useState } from 'react'

import { AnimatePresence, motion } from 'framer-motion'

import { CalendarRange } from 'lucide-react'

import { REPORT_PERIODS } from '@/modules/reportes/lib/reportes'

import { formatCompactDate } from '@/modules/agenda/lib/calendar'

import { isCustomPeriod, periodFilterLabel } from '@/lib/datePeriod'

import { cn } from '@/lib/utils'

import { DateCalendar } from './DateCalendar'



function RangeSwitch({ enabled, onChange, testId }) {

  return (

    <button

      type="button"

      role="switch"

      aria-checked={enabled}

      onClick={() => onChange(!enabled)}

      data-testid={testId}

      className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 text-left transition-colors hover:bg-slate-50"

    >

      <span className="text-sm font-medium text-slate-700">Rango de fechas</span>

      <span

        className={cn(

          'relative h-6 w-11 shrink-0 rounded-full transition-colors',

          enabled ? 'bg-blue-600' : 'bg-slate-200'

        )}

      >

        <span

          className={cn(

            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform',

            enabled ? 'translate-x-5' : 'translate-x-0.5'

          )}

        />

      </span>

    </button>

  )

}



export function DatePeriodFilter({

  period,

  dateFrom = null,

  dateTo = null,

  onChange,

  periods = REPORT_PERIODS,

  testId = 'report-period-filter',

}) {

  const rootRef = useRef(null)

  const [customOpen, setCustomOpen] = useState(false)

  const [rangeMode, setRangeMode] = useState(

    () => isCustomPeriod({ period, dateFrom, dateTo }) && Boolean(dateTo && dateFrom !== dateTo)

  )



  useEffect(() => {

    if (isCustomPeriod({ period, dateFrom, dateTo })) {

      setRangeMode(Boolean(dateTo && dateFrom !== dateTo))

    }

  }, [period, dateFrom, dateTo])



  useEffect(() => {

    const handlePointerDown = (event) => {

      if (!rootRef.current?.contains(event.target)) {

        setCustomOpen(false)

      }

    }

    document.addEventListener('mousedown', handlePointerDown)

    return () => document.removeEventListener('mousedown', handlePointerDown)

  }, [])



  const applyPreset = (nextPeriod) => {

    setCustomOpen(false)

    onChange?.({ period: nextPeriod, dateFrom: null, dateTo: null })

  }



  const applyCustom = (nextFrom, nextTo, close = false) => {

    if (!nextFrom) return

    const resolvedTo = rangeMode ? (nextTo || nextFrom) : nextFrom

    onChange?.({

      period: 'custom',

      dateFrom: nextFrom,

      dateTo: resolvedTo,

    })

    if (close) setCustomOpen(false)

  }



  const handleRangeModeChange = (enabled) => {

    setRangeMode(enabled)

    if (!enabled && dateFrom) {

      applyCustom(dateFrom, dateFrom)

      return

    }

    if (enabled && dateFrom && !dateTo) {

      applyCustom(dateFrom, dateFrom)

    }

  }



  const customActive = isCustomPeriod({ period, dateFrom, dateTo })

  const customLabel = customActive

    ? periodFilterLabel({ period, dateFrom, dateTo }, periods)

    : 'Fecha personalizada'



  return (

    <div ref={rootRef} className="relative w-full min-w-0" data-testid={testId}>

      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-100 bg-white p-1 shadow-soft">

        {periods.map((item) => (

          <button

            key={item.id}

            type="button"

            onClick={() => applyPreset(item.id)}

            data-testid={`${testId}-${item.id}`}

            className={cn(

              'whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-semibold transition-[background-color,color] duration-200',

              period === item.id && !customActive

                ? 'bg-blue-600 text-white shadow-sm'

                : 'text-slate-500 hover:text-slate-800'

            )}

          >

            {item.label}

          </button>

        ))}



        <div className="relative ml-0.5 pl-0.5 before:absolute before:left-0 before:top-1/2 before:h-5 before:w-px before:-translate-y-1/2 before:bg-slate-200">

          <button

            type="button"

            onClick={() => setCustomOpen((current) => !current)}

            data-testid={`${testId}-custom-trigger`}

            className={cn(

              'flex items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-semibold transition-[background-color,color,box-shadow] duration-200',

              customActive || customOpen

                ? 'bg-blue-600 text-white shadow-sm'

                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'

            )}

          >

            <CalendarRange className="h-4 w-4 shrink-0" />

            <span className="max-w-[180px] truncate">{customLabel}</span>

          </button>

        </div>

      </div>



      <AnimatePresence>

        {customOpen && (

          <motion.div

            initial={{ opacity: 0, y: -6, scale: 0.98 }}

            animate={{ opacity: 1, y: 0, scale: 1 }}

            exit={{ opacity: 0, y: -6, scale: 0.98 }}

            transition={{ duration: 0.16, ease: 'easeOut' }}

            className="absolute right-0 z-50 mt-2 w-[min(100vw-2rem,320px)] overflow-visible rounded-2xl border border-slate-100 bg-white p-4 shadow-2xl ring-1 ring-slate-900/5"

            data-testid={`${testId}-custom-panel`}

          >

            <div className="mb-3 flex items-start gap-3">

              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">

                <CalendarRange className="h-5 w-5" />

              </div>

              <div className="min-w-0">

                <p className="font-semibold text-slate-900">Fecha personalizada</p>

                <p className="text-xs text-slate-500">

                  {rangeMode ? 'Elige inicio y fin del período.' : 'Elige un día específico.'}

                </p>

              </div>

            </div>



            <RangeSwitch

              enabled={rangeMode}

              onChange={handleRangeModeChange}

              testId={`${testId}-range-switch`}

            />



            <div className="mt-3 space-y-3">

              {rangeMode ? (

                <>

                  <div>

                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">

                      Desde {dateFrom ? `· ${formatCompactDate(dateFrom)}` : ''}

                    </p>

                    <DateCalendar

                      value={dateFrom}

                      onChange={(value) => applyCustom(value, dateTo && dateTo < value ? value : dateTo)}

                      testId={`${testId}-from`}

                    />

                  </div>

                  <div>

                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">

                      Hasta {dateTo ? `· ${formatCompactDate(dateTo)}` : ''}

                    </p>

                    <DateCalendar

                      value={dateTo || dateFrom}

                      minDate={dateFrom || undefined}

                      onChange={(value) => applyCustom(dateFrom || value, value, true)}

                      testId={`${testId}-to`}

                    />

                  </div>

                </>

              ) : (

                <div>

                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">

                    Fecha {dateFrom ? `· ${formatCompactDate(dateFrom)}` : ''}

                  </p>

                  <DateCalendar

                    value={dateFrom}

                    onChange={(value) => applyCustom(value, value, true)}

                    testId={`${testId}-single`}

                  />

                </div>

              )}

            </div>

          </motion.div>

        )}

      </AnimatePresence>

    </div>

  )

}

