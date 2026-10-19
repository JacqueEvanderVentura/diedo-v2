import { isIOS, prefersPdfOpenInNewTab } from '@/lib/printPlatform'

const PRINT_SUPPRESS_STYLES = `
<style>
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
`

const PDF_RENDER_WIDTH_PX = 794

function waitForImages(doc) {
  const images = Array.from(doc?.images || [])
  if (!images.length) return Promise.resolve()
  return Promise.all(images.map((img) => {
    if (img.complete) return Promise.resolve()
    return new Promise((resolve) => {
      img.addEventListener('load', resolve, { once: true })
      img.addEventListener('error', resolve, { once: true })
    })
  }))
}

function mountHtmlDocument(html) {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = `position:fixed;left:-10000px;top:0;width:${PDF_RENDER_WIDTH_PX}px;height:1200px;border:0;visibility:hidden`
  document.body.appendChild(iframe)

  const doc = iframe.contentDocument
  doc.open()
  doc.write(html)
  doc.close()

  return { iframe, doc }
}

async function preparePdfDocument(doc) {
  await waitForImages(doc)
  const logo = doc.querySelector('.brand-logo')
  if (logo?.src?.includes('.svg')) {
    logo.src = `${window.location.origin}/helios-360-icon.png`
    await waitForImages(doc)
  }
}

function revokeObjectUrlLater(url) {
  setTimeout(() => URL.revokeObjectURL(url), 120_000)
}

function openBlobInNewTab(blob) {
  const url = URL.createObjectURL(blob)
  const popup = window.open(url, '_blank', 'noopener,noreferrer')
  popup?.focus()
  revokeObjectUrlLater(url)
  return popup
}

/** Open printable HTML so the user can print or Save as PDF (Safari / offline fallback). */
export function openHtmlInNewTab(html) {
  const payload = html.includes('</head>')
    ? html.replace('</head>', `${PRINT_SUPPRESS_STYLES}</head>`)
    : `${PRINT_SUPPRESS_STYLES}${html}`
  const blob = new Blob([payload], { type: 'text/html;charset=utf-8' })
  openBlobInNewTab(blob)
}

/** Print a PDF blob; Safari/iOS opens in a new tab for reliable print/share. */
export async function printPdfBlob(blob) {
  if (prefersPdfOpenInNewTab()) {
    openBlobInNewTab(blob)
    return
  }

  const url = URL.createObjectURL(blob)
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
  iframe.src = url
  document.body.appendChild(iframe)

  const cleanup = () => {
    if (iframe.parentNode) iframe.remove()
    revokeObjectUrlLater(url)
  }

  const triggerPrint = () => {
    try {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
    } catch {
      openBlobInNewTab(blob)
    }
    setTimeout(cleanup, 120_000)
  }

  iframe.addEventListener('load', () => {
    requestAnimationFrame(triggerPrint)
  }, { once: true })
}

export function savePdfBlob(blob, filename) {
  if (isIOS()) {
    openBlobInNewTab(blob)
    return
  }
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  revokeObjectUrlLater(url)
}

/** Silent print via hidden iframe (no new browser tab). */
export function printHtml(html) {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
  document.body.appendChild(iframe)

  const win = iframe.contentWindow
  const doc = win.document
  const payload = html.includes('</head>')
    ? html.replace('</head>', `${PRINT_SUPPRESS_STYLES}</head>`)
    : `${PRINT_SUPPRESS_STYLES}${html}`
  doc.open()
  doc.write(payload)
  doc.close()

  const cleanup = () => {
    if (iframe.parentNode) iframe.remove()
  }
  win.addEventListener('afterprint', cleanup, { once: true })
  setTimeout(cleanup, 120000)

  const applyPrintClearance = () => {
    const footer = doc.querySelector('.invoice-footer')
    const header = doc.querySelector('.invoice-print-header') || doc.querySelector('header')
    const headerH = Math.ceil(header?.getBoundingClientRect().height || 0)
    const footerH = Math.ceil(footer?.getBoundingClientRect().height || 0)
    doc.documentElement.style.setProperty('--invoice-header-clearance', `${Math.max(headerH + 20, 188)}px`)
    doc.documentElement.style.setProperty('--invoice-footer-clearance', `${Math.max(footerH + 16, 150)}px`)
  }

  win.requestAnimationFrame(() => {
    applyPrintClearance()
    win.focus()
    win.print()
  })
}
