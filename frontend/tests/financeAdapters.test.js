import { describe, expect, it } from 'vitest'
import {
  accountToApiPayload,
  liabilityToApiPayload,
  mapFinanceAccountFromApi,
  mapFinanceBudgetFromApi,
  mapFinanceExpenseFromApi,
  mapFinanceOverviewFromApi,
} from '@/services/adapters/finance'

describe('adaptadores de Finanzas', () => {
  it('convierte decimales de la API sin perder UUID, versión ni origen', () => {
    expect(mapFinanceExpenseFromApi({
      id: 'expense-id',
      amount: '1250.50',
      budgetId: null,
      source: 'caja',
      editable: false,
      version: null,
    })).toMatchObject({
      id: 'expense-id',
      amount: 1250.5,
      source: 'caja',
      editable: false,
      version: null,
    })
    expect(mapFinanceBudgetFromApi({
      id: 'budget-id',
      monthlyLimit: '15000.00',
      spent: '1250.50',
      remaining: '13749.50',
      usagePercent: '8.34',
      version: 2,
      transactions: [{ id: 'expense-id', amount: '1250.50' }],
    })).toMatchObject({
      monthlyLimit: 15000,
      spent: 1250.5,
      remaining: 13749.5,
      usagePercent: 8.34,
      version: 2,
      transactions: [{ amount: 1250.5 }],
    })
  })

  it('mapea overview y cuentas enmascaradas a números seguros para la UI', () => {
    expect(mapFinanceOverviewFromApi({
      incomes: '20000.00',
      expenses: '7500.00',
      balance: '12500.00',
      grossProfitEstimate: '14000.00',
      netMarginPercent: '62.50',
      trend: [{ period: '2026-09', label: 'sep', value: '20000.00' }],
    })).toMatchObject({
      incomes: 20000,
      expenses: 7500,
      balance: 12500,
      grossProfitEstimate: 14000,
      netMarginPercent: 62.5,
      trend: [{ value: 20000 }],
    })
    expect(mapFinanceAccountFromApi({
      id: 'account-id',
      accountNumber: '****7890',
      balance: '14500.25',
      version: 1,
    })).toMatchObject({ accountNumber: '****7890', balance: 14500.25, version: 1 })
    expect(accountToApiPayload({
      name: 'Operativa',
      type: 'banco',
      accountNumber: '001-234567890',
      balance: '14500.25',
      branchId: 'branch-id',
    })).toMatchObject({ accountNumber: '001-234567890', balance: 14500.25 })
  })

  it('limpia campos incompatibles al cambiar entre préstamo y tarjeta', () => {
    expect(liabilityToApiPayload({
      name: 'Tarjeta',
      type: 'tarjeta',
      initialAmount: '50000',
      pendingAmount: '25000',
      branchId: 'branch-id',
      payDay: '20',
      cutDay: '15',
      installment: '1000',
      paidInstallments: '2',
      totalInstallments: '12',
    })).toMatchObject({
      cutDay: 15,
      installment: null,
      paidInstallments: 0,
      totalInstallments: null,
    })
  })
})
