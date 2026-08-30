import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const frontendRoot = resolve(scriptDir, '..')
const fixtureRoot = resolve(frontendRoot, '..', 'demo-data', 'v1')
const manifest = JSON.parse(readFileSync(resolve(fixtureRoot, 'manifest.json'), 'utf8'))
const foundation = JSON.parse(readFileSync(resolve(fixtureRoot, 'foundation.json'), 'utf8'))
const iam = JSON.parse(readFileSync(resolve(fixtureRoot, 'iam.json'), 'utf8'))
const configuration = JSON.parse(readFileSync(resolve(fixtureRoot, 'configuration.json'), 'utf8'))
const catalog = JSON.parse(readFileSync(resolve(fixtureRoot, 'catalog.json'), 'utf8'))
const customers = JSON.parse(readFileSync(resolve(fixtureRoot, 'customers.json'), 'utf8'))
const employees = JSON.parse(readFileSync(resolve(fixtureRoot, 'employees.json'), 'utf8'))
const hr = JSON.parse(readFileSync(resolve(fixtureRoot, 'hr.json'), 'utf8'))

const snapshot = {
  seedVersion: manifest.seedVersion,
  schemaVersion: manifest.schemaVersion,
  workspaceSlug: manifest.workspaceSlug,
  foundation,
  iam,
  configuration,
  catalog,
  customers,
  employees,
  hr,
}
const output = resolve(frontendRoot, 'src', 'data', 'generated', 'demoSnapshot.js')
mkdirSync(dirname(output), { recursive: true })
writeFileSync(output, `// Generated from demo-data/${manifest.seedVersion}; do not edit.\nexport const DEMO_SNAPSHOT = Object.freeze(${JSON.stringify(snapshot, null, 2)})\n`)
