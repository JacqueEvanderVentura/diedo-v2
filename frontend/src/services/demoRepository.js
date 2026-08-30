import { DEMO_SNAPSHOT } from '@/data/generated/demoSnapshot'

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

  hr() {
    return structuredClone(this.snapshot.hr)
  }
}

export const demoRepository = new DemoRepository()
