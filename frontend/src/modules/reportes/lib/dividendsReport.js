const PARTNER_COLORS = ['#3b82f6', '#16a34a', '#f59e0b', '#9c2ad5', '#0da2e7', '#ef4444', '#64748b']

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100
}

export function aggregateDividendRows(rows = []) {
  const byBranchMap = new Map()
  const byPartnerMap = new Map()

  rows.forEach((row) => {
    const branchKey = row.branchId
    if (!byBranchMap.has(branchKey)) {
      byBranchMap.set(branchKey, {
        branchId: row.branchId,
        branchName: row.branchName,
        netProfit: Number(row.totalBranchProfit) || 0,
        partners: [],
      })
    }
    const branch = byBranchMap.get(branchKey)
    branch.partners.push({
      partnerName: row.partnerName,
      document: row.cedula || row.document || '—',
      share: Number(row.share) || 0,
      dividend: Number(row.dividend) || 0,
    })

    const partnerKey = `${row.partnerName}::${row.cedula || row.document || ''}`
    if (!byPartnerMap.has(partnerKey)) {
      byPartnerMap.set(partnerKey, {
        id: partnerKey,
        partnerName: row.partnerName,
        document: row.cedula || row.document || '—',
        totalDividend: 0,
        branchShares: [],
      })
    }
    const partner = byPartnerMap.get(partnerKey)
    partner.totalDividend += Number(row.dividend) || 0
    partner.branchShares.push({
      branchId: row.branchId,
      branchName: row.branchName,
      share: Number(row.share) || 0,
      dividend: Number(row.dividend) || 0,
    })
  })

  const byBranch = [...byBranchMap.values()]
    .map((branch) => ({
      ...branch,
      netProfit: roundMoney(branch.netProfit),
      partners: branch.partners.map((partner) => ({
        ...partner,
        dividend: roundMoney(partner.dividend),
      })),
    }))
    .sort((left, right) => right.netProfit - left.netProfit)

  const byPartner = [...byPartnerMap.values()]
    .map((partner, index) => ({
      ...partner,
      color: PARTNER_COLORS[index % PARTNER_COLORS.length],
      totalDividend: roundMoney(partner.totalDividend),
    }))
    .sort((left, right) => right.totalDividend - left.totalDividend)

  const totalNetProfit = roundMoney(byBranch.reduce((sum, branch) => sum + branch.netProfit, 0))
  const totalDividends = roundMoney(byPartner.reduce((sum, partner) => sum + partner.totalDividend, 0))

  return {
    byBranch,
    byPartner,
    branchChart: byBranch.map((branch) => ({
      name: branch.branchName,
      value: branch.netProfit,
    })),
    partnerChart: byPartner
      .filter((partner) => partner.totalDividend !== 0)
      .map((partner) => ({
        name: partner.partnerName,
        value: partner.totalDividend,
        color: partner.color,
      })),
    totals: {
      netProfit: totalNetProfit,
      totalDividends,
      partners: byPartner.length,
      branches: byBranch.length,
    },
  }
}

export function enrichBranchFinancials(analytics, financials = []) {
  if (!financials.length) return analytics
  const lookup = Object.fromEntries(financials.map((row) => [row.branchId, row]))
  return {
    ...analytics,
    byBranch: analytics.byBranch.map((branch) => {
      const detail = lookup[branch.branchId]
      if (!detail) return branch
      return {
        ...branch,
        grossIncome: detail.grossIncome,
        expenses: detail.expenses,
        netProfit: detail.netProfit ?? branch.netProfit,
      }
    }),
  }
}

export function buildDividendCsv(rows = []) {
  const header = ['Socio', 'Cédula', 'Sucursal', 'Participación %', 'Dividendo']
  const lines = rows.map((row) => [
    row.partnerName,
    row.cedula || row.document || '',
    row.branchName,
    row.share,
    row.dividend,
  ])
  return [header, ...lines]
    .map((line) => line.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n')
}

export function buildPartnerPayrollCsv(partners = []) {
  const header = ['Socio', 'Cédula', 'Sucursales', 'Dividendo total']
  const lines = partners.map((partner) => [
    partner.partnerName,
    partner.document,
    partner.branchShares.map((share) => `${share.branchName} (${share.share}%)`).join('; '),
    partner.totalDividend,
  ])
  return [header, ...lines]
    .map((line) => line.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n')
}

export function downloadCsv(filename, content) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function mapDividendAnalyticsFromApi(summary = {}) {
  const byBranch = (summary.byBranch || summary.by_branch || []).map((branch) => ({
    branchId: branch.branchId || branch.branch_id,
    branchName: branch.branchName || branch.branch_name,
    grossIncome: Number(branch.grossIncome ?? branch.gross_income) || 0,
    expenses: Number(branch.expenses) || 0,
    netProfit: Number(branch.netProfit ?? branch.net_profit) || 0,
    partners: (branch.partners || []).map((partner) => ({
      partnerName: partner.partnerName || partner.partner_name,
      document: partner.document || '—',
      share: Number(partner.share) || 0,
      dividend: Number(partner.dividend) || 0,
    })),
  }))
  const byPartner = (summary.byPartner || summary.by_partner || []).map((partner, index) => ({
    id: partner.id || `${partner.partnerName || partner.partner_name}-${index}`,
    partnerName: partner.partnerName || partner.partner_name,
    document: partner.document || '—',
    totalDividend: Number(partner.totalDividend ?? partner.total_dividend) || 0,
    color: PARTNER_COLORS[index % PARTNER_COLORS.length],
    branchShares: (partner.branches || partner.branchShares || []).map((share) => ({
      branchId: share.branchId || share.branch_id,
      branchName: share.branchName || share.branch_name,
      share: Number(share.share) || 0,
      dividend: Number(share.dividend) || 0,
    })),
  }))
  const totals = {
    netProfit: Number(summary.totalNetProfit ?? summary.total_net_profit)
      || roundMoney(byBranch.reduce((sum, branch) => sum + branch.netProfit, 0)),
    totalDividends: Number(summary.totalDividends ?? summary.total_dividends)
      || roundMoney(byPartner.reduce((sum, partner) => sum + partner.totalDividend, 0)),
    partners: Number(summary.partners) || byPartner.length,
    branches: Number(summary.branches) || byBranch.length,
  }
  return {
    byBranch,
    byPartner,
    branchChart: byBranch.map((branch) => ({ name: branch.branchName, value: branch.netProfit })),
    partnerChart: byPartner
      .filter((partner) => partner.totalDividend !== 0)
      .map((partner) => ({ name: partner.partnerName, value: partner.totalDividend, color: partner.color })),
    totals,
  }
}
