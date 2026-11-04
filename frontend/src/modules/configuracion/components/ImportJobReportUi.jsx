import { Modal } from '@/components/ui/Modal'

export function filterImportDetailRows(report, detailModal) {
  if (!report || !detailModal) return []
  const isAgenda = report.kind === 'agenda'

  if (detailModal === 'created') {
    return report.rows.filter((row) => row.status === 'created')
  }
  if (detailModal === 'skipped') {
    return report.rows.filter((row) => row.status === 'skipped')
  }
  if (detailModal === 'crmCreated') {
    return report.rows.filter((row) => row.customerSync === 'created')
  }
  if (detailModal === 'crmUpdated') {
    return report.rows.filter((row) => row.customerSync === 'updated')
  }
  if (detailModal === 'crmLinked') {
    return report.rows.filter((row) => row.customerSync === 'linked')
  }
  if (detailModal === 'updated') {
    if (isAgenda) {
      return report.rows.filter((row) => row.customerSync === 'updated')
    }
    return report.rows.filter((row) => row.status === 'updated')
  }
  return report.rows.filter((row) => row.status === 'error')
}

export function importDetailModalTitle(detailModal, report) {
  if (detailModal === 'created') {
    return report?.kind === 'agenda' ? 'Citas nuevas' : 'Importados correctamente'
  }
  if (detailModal === 'skipped') {
    return report?.kind === 'agenda' ? 'Citas ya importadas' : 'Duplicados omitidos'
  }
  if (detailModal === 'crmCreated') return 'Clientes nuevos en directorio'
  if (detailModal === 'crmUpdated') return 'Clientes actualizados'
  if (detailModal === 'crmLinked') return 'Clientes vinculados sin cambios'
  if (detailModal === 'updated') return 'Actualizados'
  return 'Inválidos o con error'
}

export function ImportDetailLink({ count, label, onOpen, emptyText }) {
  if (!count) {
    return <span className="text-slate-600">{emptyText ?? `0 ${label}`}</span>
  }

  return (
    <button
      type="button"
      className="text-left text-slate-800 underline decoration-slate-400 underline-offset-2 hover:text-blue-600 hover:decoration-blue-400"
      onClick={onOpen}
    >
      {count} {label}
    </button>
  )
}

export function ImportDetailRow({ row }) {
  const title = row.displayName?.trim()
    || (row.externalId ? `ID externo ${row.externalId}` : 'Fila sin identificar')

  const contactParts = [row.phone, row.email].filter(Boolean)

  const statusLabel = row.status === 'created'
    ? (row.customerSync === 'created' ? 'Cita nueva · cliente nuevo' : 'Cita nueva')
    : row.status === 'updated'
      ? 'Actualizado'
      : row.status === 'skipped'
        ? (row.customerSync === 'updated'
          ? 'Cita existente · cliente actualizado'
          : row.customerSync === 'created'
            ? 'Cita existente · cliente nuevo'
            : row.customerSync === 'linked'
              ? 'Cita existente · cliente vinculado'
              : 'Cita ya importada')
        : row.status === 'error'
          ? 'Error'
          : null

  return (
    <li className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-medium text-slate-900">
          {title}
          {row.rowNumber ? <span className="font-normal text-slate-500"> · línea {row.rowNumber}</span> : null}
        </p>
        {statusLabel ? (
          <span className="shrink-0 rounded-full bg-slate-200/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
            {statusLabel}
          </span>
        ) : null}
      </div>
      {contactParts.length > 0 ? (
        <p className="mt-1 text-slate-700">{contactParts.join(' · ')}</p>
      ) : null}
      {row.displayName && row.externalId ? (
        <p className="mt-1 text-xs text-slate-500">ID externo: {row.externalId}</p>
      ) : null}
      {row.status === 'updated' && row.message ? (
        <p className="mt-2 text-slate-800">
          <span className="font-medium text-emerald-800">Cambios: </span>
          {row.message}
        </p>
      ) : null}
      {row.status !== 'updated' && row.message ? (
        <p className="mt-2 text-slate-600">{row.message}</p>
      ) : null}
    </li>
  )
}

export function ImportDetailModal({ open, onClose, title, rows }) {
  return (
    <Modal open={open} onClose={onClose} title={title} wide testId="data-import-detail-modal">
      <div className="max-h-[min(60vh,28rem)] overflow-y-auto p-5 text-sm">
        {rows.length === 0 ? (
          <p className="text-slate-500">No hay registros en esta categoría.</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((row, index) => (
              <ImportDetailRow key={`${row.externalId || 'row'}-${index}`} row={row} />
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}

export function ImportJobReportSummary({ report, onOpenDetail }) {
  if (!report) return null

  const isAgenda = report.kind === 'agenda'
  const agenda = report.agendaSummary

  return (
    <div className="text-sm">
      <p className="font-semibold text-slate-900">{report.headline}</p>
      <p className="mt-1 text-xs text-slate-500">
        Archivo: {report.totalInFile} filas · procesadas {report.processed}
        {report.branchName ? ` · sucursal: ${report.branchName}` : ''}
      </p>
      {isAgenda && agenda?.syncCustomers ? (
        <p className="mt-2 text-xs text-slate-600">
          Las citas ya importadas no se duplican; el directorio de clientes se fusiona por teléfono,
          correo o documento y se asigna a esta sucursal sin reemplazar otras.
        </p>
      ) : null}
      {isAgenda ? (
        <>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Citas</p>
          <ul className="mt-1.5 space-y-1.5 text-slate-800">
            <li>
              -{' '}
              <ImportDetailLink
                count={report.summary.created || 0}
                label="citas nuevas"
                emptyText="0 citas nuevas"
                onOpen={() => onOpenDetail('created')}
              />
            </li>
            <li>
              -{' '}
              <ImportDetailLink
                count={report.summary.skipped || 0}
                label="citas ya importadas (mismo ID externo)"
                onOpen={() => onOpenDetail('skipped')}
              />
            </li>
            <li>
              -{' '}
              <ImportDetailLink
                count={report.summary.error || 0}
                label="filas con error"
                emptyText="No hubo errores"
                onOpen={() => onOpenDetail('error')}
              />
            </li>
          </ul>
          {agenda?.syncCustomers ? (
            <>
              <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Clientes CRM
              </p>
              <ul className="mt-1.5 space-y-1.5 text-slate-800">
                <li>
                  -{' '}
                  <ImportDetailLink
                    count={agenda.customersCreated || 0}
                    label="nuevos en directorio"
                    emptyText="0 nuevos en directorio"
                    onOpen={() => onOpenDetail('crmCreated')}
                  />
                </li>
                <li>
                  -{' '}
                  <ImportDetailLink
                    count={agenda.customersUpdated || 0}
                    label="actualizados (datos o sucursal)"
                    emptyText="0 clientes actualizados"
                    onOpen={() => onOpenDetail('crmUpdated')}
                  />
                </li>
                <li>
                  -{' '}
                  <ImportDetailLink
                    count={agenda.customersLinked || 0}
                    label="vinculados sin cambios"
                    emptyText="0 vinculados sin cambios"
                    onOpen={() => onOpenDetail('crmLinked')}
                  />
                </li>
              </ul>
            </>
          ) : null}
        </>
      ) : (
        <ul className="mt-3 space-y-1.5 text-slate-800">
          <li>
            -{' '}
            <ImportDetailLink
              count={report.summary.created || 0}
              label="importados correctamente"
              onOpen={() => onOpenDetail('created')}
            />
          </li>
          <li>
            -{' '}
            <ImportDetailLink
              count={report.summary.updated || 0}
              label="actualizados"
              emptyText="0 actualizados"
              onOpen={() => onOpenDetail('updated')}
            />
          </li>
          <li>
            -{' '}
            <ImportDetailLink
              count={report.summary.skipped || 0}
              label="duplicados (ya existían)"
              onOpen={() => onOpenDetail('skipped')}
            />
          </li>
          <li>
            -{' '}
            <ImportDetailLink
              count={report.summary.error || 0}
              label="inválidos o con error"
              emptyText="No hubo inválidos ni errores"
              onOpen={() => onOpenDetail('error')}
            />
          </li>
        </ul>
      )}
    </div>
  )
}
