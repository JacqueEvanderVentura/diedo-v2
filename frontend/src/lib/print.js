import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

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

/** Download styled HTML as a PDF (same layout as print preview). */
export async function downloadHtmlAsPdf(html, filename) {
  const { iframe, doc } = mountHtmlDocument(html)
  try {
    await preparePdfDocument(doc)
    const sheet = doc.querySelector('.sheet') || doc.body
    const canvas = await html2canvas(sheet, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      windowWidth: PDF_RENDER_WIDTH_PX,
    })

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const margin = 14
    const contentWidth = pageWidth - margin * 2
    const imgHeight = (canvas.height * contentWidth) / canvas.width
    const imgData = canvas.toDataURL('image/png')
    let heightLeft = imgHeight
    let position = margin

    pdf.addImage(imgData, 'PNG', margin, position, contentWidth, imgHeight)
    heightLeft -= pageHeight - margin * 2

    while (heightLeft > 0) {
      position = heightLeft - imgHeight + margin
      pdf.addPage()
      pdf.addImage(imgData, 'PNG', margin, position, contentWidth, imgHeight)
      heightLeft -= pageHeight - margin * 2
    }

    pdf.save(filename)
  } finally {
    iframe.remove()
  }
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

  win.focus()
  win.print()
}
