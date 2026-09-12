import { cn } from '@/lib/utils'

export const PRODUCT_NAME = 'Helios 360'
export const HELIOS_LOGO_SRC = '/favicon.svg'

export function resolveHeliosLogoSrc() {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${HELIOS_LOGO_SRC}`
  }
  return HELIOS_LOGO_SRC
}

export function buildHeliosLogoHtml({
  className = 'brand-logo',
  title = PRODUCT_NAME,
  src = resolveHeliosLogoSrc(),
} = {}) {
  const safeTitle = String(title).replace(/"/g, '&quot;')
  return `<img src="${src}" alt="${safeTitle}" class="${className}" />`
}

export function HeliosIcon({ className, title = PRODUCT_NAME, ...props }) {
  return (
    <img
      src={HELIOS_LOGO_SRC}
      alt={title}
      className={cn('h-9 w-9 shrink-0 rounded-lg object-contain', className)}
      {...props}
    />
  )
}
