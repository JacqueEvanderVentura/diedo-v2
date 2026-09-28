import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { expect, test } from '@playwright/test'

const demoUrl = 'http://127.0.0.1:3101/carwash'
const tabs = ['operativo', 'comisiones', 'reportes', 'configuracion']
const evidenceDir = path.resolve('../output/playwright')
const moduleCodes = ['foundation', 'iam', 'dashboard', 'carwash', 'pos', 'sales', 'inventory', 'crm', 'catalog', 'hr']

async function demo(page) {
  await page.route('**/api-backend/**', (route) => route.fulfill({ status: 503, json: { message: 'API offline for explicit demo preview' } }))
  await page.goto(demoUrl)
  await expect(page.getByTestId('carwash-page')).toBeVisible()
}
async function connected(page, { enabledModules = moduleCodes, permissions = ['carwash.read', 'carwash.wash.manage', 'carwash.settings.manage', 'carwash.commissions.read', 'carwash.reports.read'] } = {}) {
  const me = {
    userId: 'cw-test-user', membershipId: 'cw-test-member', workspaceId: 'cw-test-workspace',
    displayName: 'Carwash API', email: 'carwash@example.com',
    workspace: { id: 'cw-test-workspace', name: 'Workspace de prueba', slug: 'carwash-e2e', defaultCurrency: 'DOP', timezone: 'America/Santo_Domingo', locale: 'es-DO' },
    effectivePermissionCodes: ['dashboard.read', ...permissions], workspacePermissionCodes: [],
    enabledModules, visibleBranches: [{ id: 'cw-api-branch', code: 'HQ', name: 'Sucursal API' }],
    primaryRole: { code: 'workspace_admin', name: 'Administrador' }, roleAssignments: [],
    subscriptionStatus: 'active',
  }
  const mutations = []
  await page.route('**/api-backend/**', (route) => {
    const pathname = new URL(route.request().url()).pathname
    if (pathname.endsWith('/health/ready')) return route.fulfill({ json: { status: 'ready', database: 'ok', schemaStatus: 'compatible', schemaRevision: '20260928_0049' } })
    if (pathname.endsWith('/auth/refresh')) return route.fulfill({ json: { accessToken: 'carwash-test-token' } })
    if (pathname.endsWith('/auth/me')) return route.fulfill({ json: me })
    if (route.request().method() !== 'GET') mutations.push(pathname)
    return route.fulfill({ status: 404, json: { message: 'No endpoint in phase 0' } })
  })
  return mutations
}

test('preview filters and tab survive reload; employee in both roles is not a duplicate wash', async ({ page }) => {
  await demo(page)
  await page.getByTestId('carwash-search').fill('DEMO-003')
  await expect(page.getByTestId('carwash-washes')).toContainText('DEMO-003')
  await expect(page.getByTestId('carwash-washes')).not.toContainText('DEMO-001')
  await page.getByTestId('carwash-tab-comisiones').click()
  await expect(page).toHaveURL(/tab=comisiones/)
  await page.reload()
  await expect(page.getByTestId('carwash-tab-comisiones')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('carwash-commissions')).toContainText('Lavador')
  await expect(page.getByTestId('carwash-commissions')).toContainText('Encargado')
  await page.getByTestId('carwash-tab-operativo').click()
  await expect(page.getByTestId('carwash-search')).toHaveValue('DEMO-003')
  await page.getByTestId('carwash-clear-filters').click()
  await expect(page.getByTestId('carwash-washes')).toContainText('DEMO-001')
  await page.getByTestId('carwash-toggle-example').click()
  await expect(page.getByTestId('carwash-washes')).not.toContainText('DEMO-001')
})

for (const width of [1440, 768, 390, 320]) {
  test(`visual preview and modal remain usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 640 ? 640 : 1000 })
    await demo(page)
    await mkdir(evidenceDir, { recursive: true })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    for (const tab of tabs) {
      await page.getByTestId(`carwash-tab-${tab}`).click()
      await expect(page.getByTestId(`carwash-tab-${tab}`)).toHaveAttribute('aria-selected', 'true')
      await expect(page.getByRole('tabpanel')).toBeVisible()
      expect(await page.getByTestId('carwash-page').evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
      await page.locator('main').evaluate((element) => { element.scrollTop = 0 })
      await page.screenshot({ path: path.join(evidenceDir, `carwash-phase6-${tab}-${width}.png`), fullPage: true, animations: 'disabled' })
      if (width < 640) {
        await page.getByRole('tabpanel').scrollIntoViewIfNeeded()
        if (tab === 'reportes') {
          expect((await page.getByTestId('carwash-report-from').boundingBox()).width).toBeGreaterThan(140)
          expect((await page.getByTestId('carwash-report-to').boundingBox()).width).toBeGreaterThan(140)
        }
        await page.screenshot({ path: path.join(evidenceDir, `carwash-phase6-${tab}-${width}-content.png`), animations: 'disabled' })
      }
    }
    await page.getByTestId('carwash-new-service').click()
    await expect(page.getByTestId('carwash-preview-modal')).toHaveCSS('opacity', '1')
    await expect(page.getByTestId('carwash-preview-washer-rate')).toHaveValue('20')
    await expect(page.getByTestId('carwash-preview-supervisor-rate')).toHaveValue('5')
    await expect(page.getByTestId('carwash-preview-save')).toBeDisabled()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('carwash-new-service')).toBeFocused()
    await page.getByTestId(width < 1100 ? 'carwash-services-mobile' : 'carwash-services').getByTestId('carwash-preview-service-cw-demo-basic').click()
    await expect(page.getByTestId('carwash-preview-service-name')).toHaveValue('Lavado básico')
    await expect(page.getByTestId('carwash-preview-service-name')).toHaveAttribute('readonly', '')
    await page.keyboard.press('Escape')
    await page.getByTestId('carwash-tab-operativo').click()
    await page.getByTestId('carwash-new-wash').click()
    await expect(page.getByTestId('carwash-preview-modal')).toBeVisible()
    await expect(page.getByTestId('carwash-preview-modal')).toHaveCSS('opacity', '1')
    await expect(page.getByTestId('carwash-preview-save')).toBeDisabled()
    await expect(page.getByTestId('modal-close')).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(page.getByTestId('carwash-preview-close')).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.getByTestId('modal-close')).toBeFocused()
    const bounds = await page.getByTestId('carwash-preview-close').boundingBox()
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(width < 640 ? 640 : 1000)
    await page.screenshot({ path: path.join(evidenceDir, `carwash-phase6-modal-${width}.png`), animations: 'disabled' })
    await page.getByTestId('carwash-preview-close').click()
    await expect(page.getByTestId('carwash-preview-modal')).toHaveCount(0)
    await expect(page.getByTestId('carwash-new-wash')).toBeFocused()
    expect(errors).toEqual([])
  })
}

test('connected API failure never shows demo records or enables writes', async ({ page }) => {
  const mutations = await connected(page)
  await page.goto('/carwash?tab=configuracion&branchId=charm-dn')
  await expect(page.getByTestId('carwash-page')).toBeVisible()
  await expect(page).toHaveURL(/branchId=cw-api-branch/)
  await expect(page.getByTestId('carwash-new-wash')).toBeDisabled()
  await expect(page.getByTestId('carwash-new-service')).toBeDisabled()
  for (const tab of tabs) {
    await page.getByTestId(`carwash-tab-${tab}`).click()
    await expect(page.getByTestId('carwash-page')).not.toContainText('Cliente de ejemplo')
    await expect(page.getByTestId('carwash-page')).not.toContainText('Lavado premium SUV')
    await expect(page.getByTestId('carwash-availability-notice')).toHaveCount(0)
  }
  expect(mutations).toEqual([])
})

test('tab permissions block deep links and keyboard navigation skips unauthorized tabs', async ({ page }) => {
  await connected(page, { permissions: ['carwash.read'] })
  await page.goto('/carwash?tab=comisiones')
  await expect(page).toHaveURL(/tab=operativo/)
  await expect(page.getByTestId('carwash-tab-comisiones')).toBeDisabled()
  await expect(page.getByTestId('carwash-tab-reportes')).toBeDisabled()
  await expect(page.getByTestId('carwash-tab-configuracion')).toBeDisabled()
  await expect(page.getByTestId('carwash-new-wash')).toHaveCount(0)
  await page.getByTestId('carwash-tab-operativo').focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByTestId('carwash-tab-operativo')).toBeFocused()
})

for (const scenario of ['module', 'permission', 'dependency']) {
  test(`route and navigation require ${scenario}`, async ({ page }) => {
    await connected(page, {
      enabledModules: moduleCodes.filter((code) => code !== (scenario === 'module' ? 'carwash' : scenario === 'dependency' ? 'hr' : 'nothing')),
      ...(scenario === 'permission' ? { permissions: [] } : {}),
    })
    await page.goto('/carwash')
    await expect(page).toHaveURL(/\/dashboard$/)
    await expect(page.getByTestId('carwash-page')).toHaveCount(0)
    await expect(page.getByTestId('nav-carwash')).toHaveCount(0)
  })
}
