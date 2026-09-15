import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

export function deploymentConfig(source, domain = '') {
  const config = structuredClone(source)
  if (domain && domain !== 'app.helios360erp.com') {
    throw new Error('El dominio aprobado para producción es app.helios360erp.com')
  }
  config.env.production.routes = domain ? [{ pattern: domain, custom_domain: true }] : []
  return config
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const source = JSON.parse(fs.readFileSync('wrangler.jsonc', 'utf8'))
  fs.writeFileSync('.wrangler.deploy.json', JSON.stringify(
    deploymentConfig(source, process.env.CLOUDFLARE_CUSTOM_DOMAIN || ''), null, 2,
  ) + '\n')
}
