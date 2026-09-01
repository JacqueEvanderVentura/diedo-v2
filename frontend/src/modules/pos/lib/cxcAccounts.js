import { calcSnapshotTotal } from './openAccount'
import { getBalance, getPaidAmount, getReceivableStatus } from './receivables'

export const ACCOUNT_KIND_META = {
  receivable: { label: 'CxC', tone: 'warning' },
  agenda: { label: 'Agenda', tone: 'brand' },
  'open-quote': { label: 'Cuenta abierta', tone: 'brand' },
  'held-park': { label: 'Venta retenida', tone: 'neutral' },
}

export function getAccountRowMeta(row) {
  if (row.kind === 'receivable' && ['agenda', 'appointment'].includes(row.source)) {
    return ACCOUNT_KIND_META.agenda
  }
  if (row.kind === 'receivable') return ACCOUNT_KIND_META.receivable
  return ACCOUNT_KIND_META[row.kind] || { label: row.kind, tone: 'neutral' }
}

function cartSnapshotToRow(snapshot, { kind, taxPct }) {
  const amount = snapshot.total != null
    ? Number(snapshot.total) || 0
    : calcSnapshotTotal({ ...snapshot, taxPct })
  const createdAt = snapshot.createdAt || new Date().toISOString()
  return {
    id: snapshot.id,
    kind,
    customer: snapshot.customer,
    amount,
    paid: 0,
    balance: amount,
    status: kind === 'open-quote' ? 'open-quote' : 'held',
    dueDate: snapshot.updatedAt || createdAt,
    createdAt,
    branchId: snapshot.branchId || 'charm-dn',
    reference: kind === 'open-quote' ? 'Cuenta abierta' : 'Venta retenida',
    items: snapshot.items || [],
    label: snapshot.label,
    heldKind: snapshot.heldKind,
    source: snapshot,
    proof: null,
    payments: [],
    method: kind === 'open-quote' ? 'cuenta-abierta' : 'retenida',
  }
}

export function buildCxcAccountRows({ receivables = [], openQuotes = [], heldCarts = [], taxPct = 18 }) {
  const rows = []
  const openQuoteIds = new Set()

  for (const receivable of receivables) {
    rows.push({
      ...receivable,
      kind: 'receivable',
      status: getReceivableStatus(receivable),
      balance: getBalance(receivable),
      paid: getPaidAmount(receivable),
    })
  }

  for (const quote of openQuotes) {
    openQuoteIds.add(quote.id)
    rows.push(cartSnapshotToRow(quote, { kind: 'open-quote', taxPct }))
  }

  for (const held of heldCarts) {
    if (held.heldKind === 'quote' && openQuoteIds.has(held.id)) continue
    rows.push(
      cartSnapshotToRow(held, {
        kind: held.heldKind === 'quote' ? 'open-quote' : 'held-park',
        taxPct,
      })
    )
  }

  return rows
}

export function filterCxcAccounts(rows, { filter, query, branchFilter }) {
  const q = query.trim().toLowerCase()

  return rows.filter((row) => {
    if (filter === 'cxc' && row.kind !== 'receivable') return false
    if (filter === 'open-quote' && row.kind !== 'open-quote') return false
    if (filter === 'held' && row.kind !== 'held-park') return false
    if (filter === 'partial' && (row.kind !== 'receivable' || row.status !== 'partial')) return false
    if (filter === 'paid' && (row.kind !== 'receivable' || row.status !== 'paid')) return false
    if (filter === 'open') {
      if (row.kind === 'receivable' && ['paid', 'voided', 'written_off'].includes(row.status)) return false
    }

    if (branchFilter !== 'all' && row.branchId !== branchFilter) return false

    if (!q) return true
    return (
      row.customer?.name?.toLowerCase().includes(q) ||
      row.id.toLowerCase().includes(q) ||
      row.reference?.toLowerCase().includes(q) ||
      (row.label && row.label.toLowerCase().includes(q))
    )
  })
}

export function summarizeCxcAccounts(rows) {
  const pendingReceivables = rows.filter(
    (r) => r.kind === 'receivable' && !['paid', 'voided', 'written_off'].includes(r.status)
  )
  const openQuotes = rows.filter((r) => r.kind === 'open-quote')
  const held = rows.filter((r) => r.kind === 'held-park')

  const pendingTotal = pendingReceivables.reduce((sum, r) => sum + r.balance, 0)

  return {
    pendingTotal,
    openCount: pendingReceivables.length + openQuotes.length + held.length,
    partialCount: rows.filter((r) => r.kind === 'receivable' && r.status === 'partial').length,
    openQuoteCount: openQuotes.length,
    heldCount: held.length,
    cxcCount: pendingReceivables.length,
  }
}

export function reconcileCxcSummary(
  localSummary,
  authoritativeReceivables,
  authoritativeQuotes
) {
  const hasReceivables = authoritativeReceivables?.pendingTotal != null
  const hasQuotes = authoritativeQuotes?.openCount != null
  if (!hasReceivables && !hasQuotes) return localSummary

  const cxcCount = hasReceivables
    ? Number(authoritativeReceivables.pendingCount) || 0
    : localSummary.cxcCount
  const openQuoteCount = hasQuotes
    ? Number(authoritativeQuotes.openCount) || 0
    : localSummary.openQuoteCount
  const heldCount = hasQuotes
    ? Number(authoritativeQuotes.heldCount) || 0
    : localSummary.heldCount
  return {
    ...localSummary,
    pendingTotal: hasReceivables
      ? Number(authoritativeReceivables.pendingTotal) || 0
      : localSummary.pendingTotal,
    partialCount: hasReceivables
      ? Number(authoritativeReceivables.partialCount) || 0
      : localSummary.partialCount,
    cxcCount,
    openQuoteCount,
    heldCount,
    openCount: cxcCount + openQuoteCount + heldCount,
  }
}
