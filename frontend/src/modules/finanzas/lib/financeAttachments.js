const STORAGE_KEY = 'diedo-finance-attachment-archive'

function readArchive() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : { expenses: {}, incomes: {} }
  } catch {
    return { expenses: {}, incomes: {} }
  }
}

function writeArchive(archive) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(archive))
  } catch {
    // quota exceeded — best effort
  }
}

export function serializeFinanceAttachments(attachments = []) {
  return (attachments || []).map((item) => ({
    id: item.id,
    name: item.name,
    contentType: item.contentType,
    dataUrl: item.dataUrl || item.previewObjectUrl || null,
  })).filter((item) => item.dataUrl)
}

export function hydrateFinanceAttachments(serialized = []) {
  return (serialized || []).map((item) => ({
    ...item,
    previewObjectUrl: item.dataUrl,
  }))
}

export function saveExpenseAttachments(expenseId, attachments) {
  if (!expenseId) return
  const archive = readArchive()
  archive.expenses[expenseId] = serializeFinanceAttachments(attachments)
  writeArchive(archive)
}

export function saveIncomeAttachments(incomeId, attachments) {
  if (!incomeId) return
  const archive = readArchive()
  archive.incomes[incomeId] = serializeFinanceAttachments(attachments)
  writeArchive(archive)
}

export function loadExpenseAttachments(expenseId) {
  const archive = readArchive()
  return hydrateFinanceAttachments(archive.expenses[expenseId])
}

export function loadIncomeAttachments(incomeId) {
  const archive = readArchive()
  return hydrateFinanceAttachments(archive.incomes[incomeId])
}

export function mergeExpenseAttachments(expense) {
  if (!expense?.id) return expense
  const stored = loadExpenseAttachments(expense.id)
  if (!stored.length) return expense
  const existing = expense.attachments || []
  if (existing.length) return expense
  return { ...expense, attachments: stored }
}

export function mergeIncomeAttachments(income) {
  if (!income?.id) return income
  const stored = loadIncomeAttachments(income.id)
  if (!stored.length) return income
  const existing = income.attachments || []
  if (existing.length) return income
  return { ...income, attachments: stored }
}

export async function loadFinanceAttachmentBlob(attachment) {
  if (!attachment) throw new Error('Adjunto no disponible.')
  if (attachment.dataUrl) {
    const response = await fetch(attachment.dataUrl)
    return response.blob()
  }
  throw new Error('No se pudo cargar el comprobante.')
}
