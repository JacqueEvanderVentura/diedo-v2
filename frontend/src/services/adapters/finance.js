const amount = (value) => Number(value) || 0

export const mapFinanceExpenseFromApi = (item) => ({
  ...item,
  amount: amount(item.amount),
  budgetId: item.budgetId || null,
})

export const mapFinanceFixedExpenseFromApi = (item) => ({
  ...item,
  amount: amount(item.amount),
  paidMonths: item.paidPeriods || [],
})

export const mapFinanceLiabilityFromApi = (item) => ({
  ...item,
  initialAmount: amount(item.initialAmount),
  pendingAmount: amount(item.pendingAmount),
  installment: item.installment == null ? null : amount(item.installment),
})

export const mapFinanceBudgetFromApi = (item) => ({
  ...item,
  monthlyLimit: amount(item.monthlyLimit),
  spent: amount(item.spent),
  remaining: amount(item.remaining),
  usagePercent: amount(item.usagePercent),
  transactions: (item.transactions || []).map((transaction) => ({
    ...transaction,
    amount: amount(transaction.amount),
  })),
})

export const mapFinanceAccountFromApi = (item) => ({
  ...item,
  accountNumber: item.accountNumber || '',
  balance: amount(item.balance),
})

export const mapFinanceIncomeFromApi = (item) => ({
  ...item,
  amount: amount(item.amount),
})

export const mapFinanceOverviewFromApi = (item) => ({
  ...item,
  incomes: amount(item.incomes),
  expenses: amount(item.expenses),
  balance: amount(item.balance),
  grossProfitEstimate: amount(item.grossProfitEstimate),
  netMarginPercent: amount(item.netMarginPercent),
  trend: (item.trend || []).map((point) => ({ ...point, value: amount(point.value) })),
})

export const expenseToApiPayload = (item) => ({
  concept: item.concept,
  amount: amount(item.amount),
  category: item.category || 'otros',
  date: item.date,
  branchId: item.branchId,
  status: item.status || 'pagado',
  budgetId: item.budgetId || null,
})

export const fixedExpenseToApiPayload = (item) => ({
  concept: item.concept,
  amount: amount(item.amount),
  category: item.category || 'otros',
  branchId: item.branchId,
  dayOfMonth: Number(item.dayOfMonth) || 1,
})

export const liabilityToApiPayload = (item) => ({
  name: item.name,
  type: item.type || 'prestamo',
  initialAmount: amount(item.initialAmount),
  pendingAmount: item.pendingAmount === '' || item.pendingAmount == null
    ? amount(item.initialAmount)
    : amount(item.pendingAmount),
  branchId: item.branchId,
  payDay: Number(item.payDay) || 1,
  cutDay: item.type === 'tarjeta' ? Number(item.cutDay) || null : null,
  installment: item.type === 'prestamo' && item.installment ? amount(item.installment) : null,
  paidInstallments: item.type === 'prestamo' ? Number(item.paidInstallments) || 0 : 0,
  totalInstallments: item.type === 'prestamo' && item.totalInstallments
    ? Number(item.totalInstallments)
    : null,
  categoryIds: item.categoryIds || [],
})

export const budgetToApiPayload = (item) => ({
  name: item.name,
  group: item.group || 'operaciones',
  monthlyLimit: amount(item.monthlyLimit),
  branchId: item.branchId,
})

export const accountToApiPayload = (item) => ({
  name: item.name,
  type: item.type || 'banco',
  bank: item.bank || '',
  accountNumber: item.accountNumber || '',
  balance: amount(item.balance),
  currency: item.currency || 'DOP',
  branchId: item.branchId,
  notes: item.notes || '',
})

export const manualIncomeToApiPayload = (item) => ({
  category: item.category || 'servicios',
  branchId: item.branchId,
  amount: amount(item.amount),
  date: item.date,
  customer: item.customer || '',
  source: item.source || 'Formulario',
  status: item.status || 'pagado',
})
