import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { DataSourceNotice } from '@/components/ui/DataSourceNotice'
import { carwashApi } from '../api'
import { demoReports, monthRange, reportRangeError } from '../lib/reports'
import { useCarwashRead } from '../lib/useCarwashRead'
import { CARWASH_PREVIEW_DATE } from '../data/preview'
import { CarwashEmpty } from './CarwashPrimitives'
import { ReportCharts } from './ReportCharts'

export function ReportsPanel(props) {
  return props.isDemo ? <DemoReports {...props} /> : <ConnectedReports {...props} />
}

function ConnectedReports({ branchId, workspace, params, updateQuery }) {
  const from = params.get('dateFrom') || ''
  const to = params.get('dateTo') || ''
  const invalid = from && to ? reportRangeError(from, to) : ''
  const load = useCallback(async () => ({ ...await carwashApi.reports({ branchId, dateFrom: from || undefined, dateTo: to || undefined }), requestedFrom: from, requestedTo: to }), [branchId, from, to])
  const { data, source, reload } = useCarwashRead(load, 0, !!branchId && !invalid)
  useEffect(() => {
    if (data && data.requestedFrom === from && data.requestedTo === to && source.status === 'ready' && (!from || !to)) updateQuery({ dateFrom: data.dateFrom, dateTo: data.dateTo }, true)
  }, [data, source.status, from, to, updateQuery])
  return <div className="space-y-5" data-testid="carwash-reports">
    <ReportPeriod from={from || data?.dateFrom || ''} to={to || data?.dateTo || ''} onApply={updateQuery} disabled={!invalid && !data && source.status === 'loading'} />
    <DataSourceNotice state={source} onRetry={reload} />
    {invalid ? <p role="alert" className="text-sm text-red-700">{invalid}</p> : data ? <ReportCharts data={data} workspace={workspace} /> : <CarwashEmpty message="No hay datos disponibles para mostrar. Reintenta la consulta." />}
  </div>
}

function DemoReports({ data: preview, params, updateQuery, workspace }) {
  const defaults = monthRange(CARWASH_PREVIEW_DATE)
  const from = params.get('dateFrom') || defaults.dateFrom
  const to = params.get('dateTo') || defaults.dateTo
  const data = demoReports(preview, from, to)
  return <div className="space-y-5" data-testid="carwash-reports"><ReportPeriod from={from} to={to} onApply={updateQuery} />{data ? <ReportCharts data={data} workspace={workspace} /> : <p role="alert" className="text-sm text-red-700">{reportRangeError(from, to)}</p>}</div>
}

function ReportPeriod({ from, to, onApply, disabled }) {
  const [draftFrom, setFrom] = useState(from)
  const [draftTo, setTo] = useState(to)
  const [error, setError] = useState('')
  useEffect(() => { setFrom(from); setTo(to); setError('') }, [from, to])
  return <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); const failure = reportRangeError(draftFrom, draftTo); setError(failure); if (!failure) onApply({ dateFrom: draftFrom, dateTo: draftTo }) }}>
    <div className="grid grid-cols-1 min-[380px]:grid-cols-2 items-end gap-3 sm:flex sm:flex-wrap"><label className="min-w-0 text-xs font-medium text-slate-600 sm:min-w-40 sm:max-w-52 sm:flex-1">Fecha desde<Input className="mt-2" type="date" data-testid="carwash-report-from" value={draftFrom} disabled={disabled} onChange={(event) => setFrom(event.target.value)} /></label><label className="min-w-0 text-xs font-medium text-slate-600 sm:min-w-40 sm:max-w-52 sm:flex-1">Fecha hasta<Input className="mt-2" type="date" data-testid="carwash-report-to" value={draftTo} disabled={disabled} onChange={(event) => setTo(event.target.value)} /></label><Button type="submit" disabled={disabled}>Aplicar período</Button><Button type="button" variant="secondary" disabled={disabled} onClick={() => onApply({ dateFrom: null, dateTo: null })}>Mes actual</Button></div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </form>
}
