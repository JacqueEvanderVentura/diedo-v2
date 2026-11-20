const FAILURE_LABELS = {
  profile: 'perfil',
  appointments: 'citas',
  invoices: 'facturas',
  payments: 'pagos',
  receivables: 'cuentas pendientes',
  tasks: 'tareas',
}

async function settled(promise) {
  try {
    return { ok: true, value: await promise }
  } catch {
    return { ok: false, value: null }
  }
}

function itemsFrom(result) {
  if (!result.ok) return []
  return result.value?.items || []
}

export function portalLoadErrorMessage(failures) {
  const named = (failures || [])
    .map((id) => FAILURE_LABELS[id])
    .filter(Boolean)
  if (named.length === 0) return ''
  if (named.length >= 4) {
    return 'No se pudo cargar tu portal. Intenta iniciar sesión de nuevo.'
  }
  return `No se pudo cargar: ${named.join(', ')}.`
}

export async function loadPortalDashboard({ branchId, session, bookingApi, portalApi }) {
  const [context, me, apts, invs, payments, cxc, tasks] = await Promise.all([
    settled(bookingApi.getContext(branchId)),
    settled(portalApi.me(branchId, session)),
    settled(portalApi.listAppointments(branchId, session)),
    settled(portalApi.listInvoices(branchId, session)),
    settled(portalApi.listPayments(branchId, session)),
    settled(portalApi.listReceivables(branchId, session)),
    settled(portalApi.listTasks(branchId, session)),
  ])

  const failures = []
  if (!me.ok) failures.push('profile')
  if (!apts.ok) failures.push('appointments')
  if (!invs.ok) failures.push('invoices')
  if (!payments.ok) failures.push('payments')
  if (!cxc.ok) failures.push('receivables')
  if (!tasks.ok) failures.push('tasks')

  return {
    branchName: context.ok ? (context.value?.branch?.branchName || '') : '',
    profile: me.ok ? me.value : null,
    appointments: itemsFrom(apts),
    invoices: itemsFrom(invs),
    payments: itemsFrom(payments),
    receivables: itemsFrom(cxc),
    portalTasks: itemsFrom(tasks),
    failures,
  }
}
