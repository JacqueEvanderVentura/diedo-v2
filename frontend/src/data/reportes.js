// Seed / constants for report modules (simulates backend datasets).

export const MEMBERSHIP_STATUSES = [
  { id: 'activo', label: 'Activo' },
  { id: 'proximo', label: 'Próximo a vencer' },
  { id: 'vencido', label: 'Vencido' },
  { id: 'inactivo', label: 'Inactivo' },
]

export const MEMBERSHIP_PLANS = ['Membresía Charm', 'Membresía Premium', 'Membresía Básica', 'Membresía Familiar']

const FIRST_NAMES = [
  'Harlenys', 'Elianny', 'Anabel', 'Anny', 'Pedro', 'Nicole', 'María', 'José', 'Carla', 'Luis',
  'Rosa', 'Miguel', 'Sandra', 'Roberto', 'Diana', 'Fernando', 'Patricia', 'Andrés', 'Lucía', 'Diego',
]
const LAST_NAMES = [
  'Mateo Castillo', 'Alba Veras', 'Carela Diaz', 'Montero', 'Rodríguez', 'Cavallo', 'Martínez', 'Gómez',
  'Hernández', 'López', 'Pérez', 'Ramírez', 'Torres', 'Flores', 'Reyes', 'Morales', 'Cruz', 'Ortiz',
]

const BRANCH_IDS = ['charm-dn', 'charm-santiago', 'charm-este']
const PLAN_AMOUNTS = { 'Membresía Charm': 1000, 'Membresía Premium': 1500, 'Membresía Básica': 750, 'Membresía Familiar': 2200 }

function daysAgo(n) {
  return new Date(Date.now() - n * 86400000).toISOString()
}

function pick(arr, i) {
  return arr[i % arr.length]
}

export function buildMembershipSeed(count = 96) {
  const statuses = ['activo', 'activo', 'activo', 'proximo', 'vencido', 'inactivo']
  const rows = []
  for (let i = 0; i < count; i++) {
    const status = pick(statuses, i)
    const daysSincePay =
      status === 'activo' ? 1 + (i % 25)
      : status === 'proximo' ? 26 + (i % 4)
      : status === 'vencido' ? 35 + (i % 20)
      : 65 + (i % 30)
    const plan = pick(MEMBERSHIP_PLANS, i)
    rows.push({
      id: `mem-${i + 1}`,
      clientName: `${pick(FIRST_NAMES, i)} ${pick(LAST_NAMES, i + 3)}`,
      plan,
      branchId: pick(BRANCH_IDS, i),
      amount: PLAN_AMOUNTS[plan],
      lastPaymentAt: daysAgo(daysSincePay),
      status,
    })
  }
  return rows
}

export const MEMBERSHIP_SEED = buildMembershipSeed()
