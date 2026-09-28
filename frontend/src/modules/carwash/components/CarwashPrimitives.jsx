import { Info } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { ResponsiveList, ResponsiveTable, ResponsiveCards } from '@/components/ui/ResponsiveList'

export function CarwashPanel({ title, description, action, children }) {
  return (
    <Card className="min-w-0 p-4 sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-heading text-lg font-semibold tracking-tight text-slate-900">{title}</h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-500">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </Card>
  )
}

export function CarwashTable({ columns, rows, emptyMessage, testId }) {
  return (
    <ResponsiveList columnCount={columns.length}>
      <ResponsiveTable testId={testId} wrapCard={false} className="rounded-xl border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
            <tr>{columns.map((column) => <th key={column.key} scope="col" className="px-4 py-4 font-medium">{column.label}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.id} className="align-top">
                {columns.map((column) => <td key={column.key} className="px-4 py-4 text-slate-700">{column.render(row)}</td>)}
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={columns.length}><CarwashEmpty message={emptyMessage} /></td></tr>}
          </tbody>
        </table>
      </ResponsiveTable>
      <ResponsiveCards testId={`${testId}-mobile`}>
        {rows.map((row) => (
          <article key={row.id} className="min-w-0 rounded-xl border border-slate-200 p-4">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              {columns.map((column) => (
                <div key={column.key} className="min-w-0">
                  <dt className="mb-1 text-xs text-slate-500">{column.label}</dt>
                  <dd className="break-words text-sm text-slate-800">{column.render(row)}</dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
        {!rows.length && <CarwashEmpty message={emptyMessage} />}
      </ResponsiveCards>
    </ResponsiveList>
  )
}

export function CarwashEmpty({ message }) {
  return (
    <div className="flex min-h-36 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-slate-500">
      <Info className="h-7 w-7 text-slate-400" aria-hidden />
      <p className="max-w-lg leading-relaxed">{message}</p>
    </div>
  )
}

export function CarwashMetric({ label, value, icon: Icon, tone = 'blue' }) {
  const tones = { blue: 'bg-blue-100 text-blue-600', green: 'bg-emerald-100 text-emerald-600', violet: 'bg-indigo-100 text-indigo-600', amber: 'bg-amber-100 text-amber-600' }
  return (
    <Card className="flex min-w-0 items-center gap-3 p-4 sm:gap-4 sm:p-5">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${tones[tone]}`}><Icon className="h-6 w-6" aria-hidden /></div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase leading-relaxed tracking-wide text-slate-500">{label}</p>
        <p className="mt-1 break-words font-heading text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{value}</p>
      </div>
    </Card>
  )
}
