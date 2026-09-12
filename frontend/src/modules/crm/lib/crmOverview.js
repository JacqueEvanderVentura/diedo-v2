/**
 * KPIs y tarjetas de navegación del overview CRM (embudo comercial).
 */

export function buildCrmOverviewStats({ overview, leads = [], opportunities = [], activities = [] }) {
  if (overview) {
    return {
      totalLeads: overview.totalLeads ?? 0,
      qualifiedLeads: overview.qualifiedLeads ?? 0,
      convertedMonth: overview.convertedThisMonth ?? 0,
      pipelineValue: overview.pipelineValue ?? 0,
      openOpportunities: overview.openOpportunities ?? 0,
      salesValueThisMonth: overview.salesValueThisMonth ?? 0,
      pendingActivities: overview.pendingActivities ?? 0,
    }
  }

  const qualified = leads.filter((l) => l.status === 'calificado').length
  const now = new Date()
  const convertedMonth = leads.filter((l) => {
    if (l.status !== 'convertido') return false
    const d = new Date(l.updatedAt)
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).length
  const openOpps = opportunities.filter((o) => !['cerrado', 'perdido'].includes(o.stage))
  const pipelineValue = openOpps.reduce((a, o) => a + (o.value || 0), 0)
  const pendingActivities = activities.filter((a) => a.status !== 'completada').length

  return {
    totalLeads: leads.length,
    qualifiedLeads: qualified,
    convertedMonth,
    pipelineValue,
    openOpportunities: openOpps.length,
    salesValueThisMonth: null,
    pendingActivities,
  }
}

export function buildCrmOverviewKpis(stats) {
  const pipelineSublabel =
    stats.openOpportunities != null && stats.openOpportunities > 0
      ? `${stats.openOpportunities} oportunidad${stats.openOpportunities === 1 ? '' : 'es'} abierta${stats.openOpportunities === 1 ? '' : 's'}`
      : 'Deals en curso (sin cerrar)'

  const kpis = [
    {
      key: 'leads',
      label: 'Leads en cartera',
      sublabel: 'Prospectos registrados',
      value: stats.totalLeads,
      tone: 'brand',
    },
    {
      key: 'qualified',
      label: 'Leads calificados',
      sublabel: 'Listos para pipeline',
      value: stats.qualifiedLeads,
      tone: 'info',
    },
    {
      key: 'converted',
      label: 'Convertidos (mes)',
      sublabel: 'Leads pasados a cliente',
      value: stats.convertedMonth,
      tone: 'success',
    },
    {
      key: 'pipeline',
      label: 'Valor en pipeline',
      sublabel: pipelineSublabel,
      valueIsMoney: true,
      rawValue: stats.pipelineValue,
      tone: 'warning',
    },
  ]

  if (stats.salesValueThisMonth != null && stats.salesValueThisMonth > 0) {
    kpis.push({
      key: 'salesMonth',
      label: 'Ventas CRM (mes)',
      sublabel: 'Ingresos registrados',
      valueIsMoney: true,
      rawValue: stats.salesValueThisMonth,
      tone: 'success',
    })
  }

  if (stats.pendingActivities > 0) {
    kpis.push({
      key: 'activities',
      label: 'Seguimientos pendientes',
      sublabel: 'Tareas y actividades',
      value: stats.pendingActivities,
      tone: 'info',
    })
  }

  return kpis
}

/** Orden del embudo comercial para las tarjetas de navegación. */
export function buildCrmNavCards({ crmDiscovery = false }) {
  const leadsTitle = crmDiscovery ? 'Leads & Discovery' : 'Leads'
  const leadsDesc = crmDiscovery
    ? 'Descubre negocios en la web, puntúalos y conviértelos.'
    : 'Registra leads, puntúalos y llévalos al pipeline o a cliente.'

  return [
    { title: leadsTitle, desc: leadsDesc, to: '/crm/leads', tone: 'violet', navKey: 'leads' },
    {
      title: 'Pipeline',
      desc: 'Embudo Kanban por etapa; cotiza y vincula clientes sin salir del deal.',
      to: '/crm/pipeline',
      tone: 'emerald',
      navKey: 'pipeline',
    },
    {
      title: 'Cotizaciones y facturas',
      desc: 'Cotizaciones, emisión de factura y cuentas por cobrar sin salir del CRM.',
      to: '/crm/cotizaciones',
      tone: 'purple',
      navKey: 'cotizaciones',
    },
    {
      title: 'Seguimiento',
      desc: 'Actividades y oportunidades; cotizar o abrir pipeline desde cada fila.',
      to: '/crm/seguimiento',
      tone: 'sky',
      navKey: 'seguimiento',
    },
    {
      title: 'Clientes',
      desc: 'Ficha 360: oportunidades, cotizaciones, compras y acciones en contexto.',
      to: '/crm/clientes',
      tone: 'brand',
      navKey: 'clientes',
    },
    {
      title: 'Ventas & Facturas',
      desc: 'Historial unificado POS y pipeline, con filtro por origen.',
      to: '/crm/ventas',
      tone: 'cyan',
      navKey: 'ventas',
    },
    {
      title: 'Compras por Cliente',
      desc: 'Compras agregadas por cliente (POS y ventas CRM) con detalle de factura.',
      to: '/crm/compras',
      tone: 'amber',
      navKey: 'compras',
    },
    {
      title: 'Reporte Consolidado',
      desc: 'Vista unificada de ingresos por origen y sucursal.',
      to: '/reportes/generales',
      tone: 'indigo',
      navKey: 'reportes',
    },
  ]
}
