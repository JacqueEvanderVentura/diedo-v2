import { DatePeriodFilter } from '@/components/ui/DatePeriodFilter'
import { REPORT_PERIODS } from '../lib/reportes'

export function PeriodFilter({
  period,
  dateFrom = null,
  dateTo = null,
  onChange,
  periods = REPORT_PERIODS,
}) {
  return (
    <DatePeriodFilter
      period={period}
      dateFrom={dateFrom}
      dateTo={dateTo}
      onChange={onChange}
      periods={periods}
      testId="report-period-filter"
    />
  )
}
