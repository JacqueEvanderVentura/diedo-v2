// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { carwashApi } from '@/modules/carwash/api'
import { ReportsPanel } from '@/modules/carwash/components/ReportsPanel'
import { ConnectedIndicators } from '@/modules/carwash/components/ConnectedIndicators'
import { demoReports, monthRange, reportRangeError } from '@/modules/carwash/lib/reports'
import { previewData } from '@/modules/carwash/data/preview'

vi.mock('@/modules/carwash/api', () => ({ carwashApi: { reports: vi.fn(), indicators: vi.fn() } }))
vi.mock('@/modules/carwash/components/ReportCharts', () => ({ ReportCharts: ({ data }) => <div data-testid="chart-data">{JSON.stringify(data)}</div> }))
const report = { dateFrom: '2026-09-01', dateTo: '2026-09-30', currency: 'DOP', timezone: 'America/Santo_Domingo', totals: { billed: '637.46' }, daily: [], services: [], employees: [] }
function Page({ initial = '', demo = false }) {
  const [params, setParams] = useState(new URLSearchParams(initial))
  const updateQuery = (changes) => setParams((current) => {
    const next = new URLSearchParams(current)
    Object.entries(changes).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key))
    return next
  })
  return <><output data-testid="query">{params.toString()}</output><ReportsPanel branchId="b1" params={params} updateQuery={updateQuery} isDemo={demo} data={previewData({ isDemo: demo, populated: true })} /></>
}
beforeEach(() => {
  vi.resetAllMocks()
  carwashApi.reports.mockResolvedValue(report)
  carwashApi.indicators.mockResolvedValue({ activeWashes: 2, completedToday: 1, billedToday: '637.46', pendingCommissions: '135.05', currency: 'DOP', today: '2026-09-27', timezone: 'America/Santo_Domingo' })
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
})
afterEach(cleanup)

describe('Carwash reports', () => {
  it('uses the branch month from the API, keeps dates in the URL, and resets a historical period', async () => {
    render(<Page initial="dateFrom=2000-01-01&dateTo=2000-01-31" />)
    await screen.findByTestId('chart-data')
    expect(carwashApi.reports).toHaveBeenCalledWith({ branchId: 'b1', dateFrom: '2000-01-01', dateTo: '2000-01-31' })
    fireEvent.click(screen.getByRole('button', { name: 'Mes actual' }))
    await waitFor(() => expect(screen.getByTestId('query').textContent).toBe('dateFrom=2026-09-01&dateTo=2026-09-30'))
    expect(carwashApi.reports).toHaveBeenCalledWith({ branchId: 'b1', dateFrom: undefined, dateTo: undefined })
    fireEvent.change(screen.getByTestId('carwash-report-from'), { target: { value: '2026-08-01' } })
    fireEvent.change(screen.getByTestId('carwash-report-to'), { target: { value: '2026-08-31' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar período' }))
    await waitFor(() => expect(carwashApi.reports).toHaveBeenLastCalledWith({ branchId: 'b1', dateFrom: '2026-08-01', dateTo: '2026-08-31' }))
  })
  it('allows correcting an invalid URL range and blocks ranges over 366 days', async () => {
    render(<Page initial="dateFrom=2026-09-30&dateTo=2026-09-01" />)
    expect(carwashApi.reports).not.toHaveBeenCalled()
    expect(screen.getByTestId('carwash-report-from').disabled).toBe(false)
    fireEvent.change(screen.getByTestId('carwash-report-from'), { target: { value: '2020-01-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar período' }))
    expect(carwashApi.reports).not.toHaveBeenCalled()
    fireEvent.change(screen.getByTestId('carwash-report-from'), { target: { value: '2026-09-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar período' }))
    await screen.findByTestId('chart-data')
  })
  it('keeps the last labeled report on network failure and clears it on permission loss', async () => {
    render(<Page initial="dateFrom=2026-09-01&dateTo=2026-09-30" />)
    await screen.findByTestId('chart-data')
    carwashApi.reports.mockRejectedValue(new Error('Sin conexión'))
    fireEvent(document, new Event('visibilitychange'))
    await screen.findByText('Mostrando la última copia disponible en memoria.')
    expect(screen.getByTestId('chart-data').textContent).toContain('637.46')
    carwashApi.reports.mockRejectedValue(Object.assign(new Error('Sin permiso'), { status: 403 }))
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await screen.findByText('No fue posible cargar estos datos.')
    expect(screen.queryByTestId('chart-data')).toBeNull()
  })
  it('does not substitute synthetic charts when the connected API fails', async () => {
    carwashApi.reports.mockRejectedValue(new Error('Sin conexión'))
    render(<Page />)
    await screen.findByText('No fue posible cargar estos datos.')
    expect(screen.queryByTestId('chart-data')).toBeNull()
  })
  it('uses synthetic reports only in demo and validates leap years', async () => {
    render(<Page demo />)
    expect(screen.getByTestId('chart-data')).toBeTruthy()
    expect(carwashApi.reports).not.toHaveBeenCalled()
    expect(monthRange('2024-02-12')).toEqual({ dateFrom: '2024-02-01', dateTo: '2024-02-29' })
    expect(reportRangeError('2024-01-01', '2024-12-31')).toBe('')
    expect(reportRangeError('', '')).toBe('Selecciona ambas fechas.')
    const data = demoReports({ washes: [], commissions: [] }, '2024-02-01', '2024-02-29')
    expect(data.daily).toHaveLength(29)
    expect(data.totals.billed).toBe('0.00')
    expect(demoReports({ washes: [], commissions: [] }, 'invalid', 'invalid')).toBeNull()
  })
  it('shows authorized indicators and refreshes immediately after a financial action', async () => {
    const { rerender } = render(<ConnectedIndicators branchId="b1" revision={0} />)
    await screen.findByText(/Hoy: 2026-09-27/)
    expect(screen.getByText('En espera / Lavando').nextSibling.textContent).toBe('2')
    carwashApi.indicators.mockResolvedValue({ activeWashes: 0, completedToday: 2, billedToday: '708.30', pendingCommissions: null, currency: 'DOP' })
    rerender(<ConnectedIndicators branchId="b1" revision={1} />)
    await screen.findByText('Sin permiso')
    expect(carwashApi.indicators).toHaveBeenCalledTimes(2)
    carwashApi.indicators.mockRejectedValue(new Error('Offline'))
    fireEvent(document, new Event('visibilitychange'))
    await screen.findByText('Indicadores sin actualizar; mostrando la última consulta.')
    expect(screen.getByText('Completados hoy').nextSibling.textContent).toBe('2')
  })
  it('does not poll while the page is hidden', async () => {
    render(<ConnectedIndicators branchId="b1" revision={0} />)
    await screen.findByText(/Hoy:/)
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    fireEvent(document, new Event('visibilitychange'))
    expect(carwashApi.indicators).toHaveBeenCalledOnce()
  })
})
