import { DEMO_SNAPSHOT } from '@/data/generated/demoSnapshot'
import { createDemoAppointments, createDemoAppointmentResources } from '@/data/agenda'

export const DEMO_SEED_ENABLED = import.meta.env.VITE_DEMO_SEED_ENABLED === 'true'

export class DemoRepository {
  constructor(snapshot = DEMO_SNAPSHOT) {
    this.snapshot = snapshot
  }

  get seedVersion() {
    return this.snapshot.seedVersion
  }

  session() {
    const user = this.snapshot.iam.users[0]
    return {
      id: user.seedKey,
      userId: user.seedKey,
      membershipId: `demo:${user.seedKey}`,
      workspaceId: `demo:${this.snapshot.workspaceSlug}`,
      name: user.displayName,
      email: user.email,
      role: 'Administrador demo',
      initials: user.displayName.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase(),
      branchIds: this.snapshot.foundation.branches.map((branch) => branch.seedKey),
      visibleBranches: this.snapshot.foundation.branches,
      effectivePermissionCodes: ['*'],
      enabledModules: ['*'],
      seedVersion: this.snapshot.seedVersion,
      source: 'demo',
    }
  }

  branches() {
    return structuredClone(this.snapshot.foundation.branches)
  }

  paymentMethods() {
    return structuredClone(this.snapshot.configuration.paymentMethods)
  }

  users() {
    return structuredClone(this.snapshot.iam.users)
  }

  customers() {
    return structuredClone(this.snapshot.customers.items)
  }

  employees() {
    return structuredClone(this.snapshot.employees.items)
  }

  catalog() {
    return structuredClone(this.snapshot.catalog)
  }

  inventory() {
    const inventory = structuredClone(this.snapshot.inventory)
    return {
      ...inventory,
      itemProfiles: inventory.itemProfiles.map((profile) => ({
        salePrice: null,
        unitCost: null,
        taxRate: 0,
        minimumStock: 0,
        stockByBranch: {},
        ...profile,
      })),
    }
  }

  purchasing() {
    return structuredClone(this.snapshot.purchasing)
  }

  hr() {
    return structuredClone(this.snapshot.hr)
  }

  appointments(params = {}) {
    const search = String(params.search || '').trim().toLowerCase()
    return createDemoAppointments().filter((appointment) => {
      if (params.branchId && appointment.branchId !== params.branchId) return false
      if (params.dateFrom && appointment.date < params.dateFrom) return false
      if (params.dateTo && appointment.date > params.dateTo) return false
      if (params.employeeId && appointment.employeeId !== params.employeeId) return false
      if (params.status && appointment.status !== params.status) return false
      if (!search) return true
      return appointment.customerName.toLowerCase().includes(search)
        || appointment.serviceName.toLowerCase().includes(search)
        || appointment.customerPhone.includes(search)
    })
  }

  appointmentResources({ branchId } = {}) {
    return createDemoAppointmentResources(branchId)
  }
}

export const demoRepository = new DemoRepository()
