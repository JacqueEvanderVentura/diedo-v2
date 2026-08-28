import { formatDOP } from '@/lib/format'

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function pad(n) {
  return String(n).padStart(2, '0')
}

export function formatInvoiceDate(date = new Date()) {
  return date.toLocaleString('es-DO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function makeInvoiceId(date = new Date(), kind = 'sale') {
  const prefix = kind === 'expense' ? 'GTO' : 'FAC'
  return `${prefix}-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

export function invoiceFilename(id) {
  return `${id}.html`
}

const LOGO_SVG = `<svg width="36" height="36" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="30" cy="18" r="6" fill="#3B82F6"/><rect x="24" y="30" width="12" height="40" rx="6" fill="#3B82F6"/><circle cx="30" cy="82" r="6" fill="#22D3EE"/><path d="M42 30H56A22 22 0 0 1 71.5 36.5" stroke="#A855F7" stroke-width="12" stroke-linecap="round"/><path d="M42 70H56A22 22 0 0 0 71.5 63.5" stroke="#22D3EE" stroke-width="12" stroke-linecap="round"/><circle cx="82" cy="50" r="6" fill="#A855F7"/></svg>`

export function buildInvoiceHtml(data) {
  const {
    id,
    issuedAt,
    businessName,
    branchName,
    region,
    customerName,
    customerPhone,
    paymentMethod,
    paymentReference,
    items,
    subtotal,
    discountAmt,
    discountPct,
    taxPct,
    taxAmt,
    total,
    kind = 'sale',
  } = data

  const isExpense = kind === 'expense'
  const docTitle = isExpense ? 'Gasto' : 'Factura'
  const totalColor = isExpense ? '#dc2626' : '#2563eb'
  const footer = isExpense
    ? `Comprobante de gasto · ${escapeHtml(businessName)}`
    : `Gracias por su compra · ${escapeHtml(businessName)}`

  const rows = items
    .map((item) => {
      const line = item.price * item.qty
      return `<tr>
        <td>
          <div class="item-name">${escapeHtml(item.name)}</div>
          ${item.sku ? `<div class="muted">SKU: ${escapeHtml(item.sku)}</div>` : ''}
        </td>
        <td class="num">${item.qty}</td>
        <td class="num">${escapeHtml(formatDOP(item.price))}</td>
        <td class="num">${escapeHtml(formatDOP(line))}</td>
      </tr>`
    })
    .join('')

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(docTitle)} ${escapeHtml(id)}</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
      color: #0f172a;
      background: #fff;
    }
    .sheet {
      max-width: 720px;
      margin: 0 auto;
      padding: 32px 28px;
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 20px;
      margin-bottom: 24px;
    }
    .brand { display: flex; align-items: center; gap: 12px; }
    .brand h1 { margin: 0; font-size: 22px; letter-spacing: -0.02em; }
    .brand p { margin: 2px 0 0; font-size: 12px; color: #64748b; }
    .meta { text-align: right; font-size: 13px; color: #475569; }
    .meta strong { display: block; color: #0f172a; font-size: 15px; margin-bottom: 4px; }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 24px;
      font-size: 13px;
    }
    .label { font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #94a3b8; margin-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: #94a3b8; padding: 8px 0; border-bottom: 1px solid #e2e8f0; }
    th.num, td.num { text-align: right; white-space: nowrap; }
    td { padding: 10px 0; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
    .item-name { font-weight: 600; }
    .muted { color: #94a3b8; font-size: 11px; margin-top: 2px; }
    .totals { margin-top: 20px; margin-left: auto; width: 280px; font-size: 13px; }
    .totals div { display: flex; justify-content: space-between; padding: 5px 0; color: #475569; }
    .totals .discount { color: #059669; }
    .totals .grand { border-top: 1px solid #e2e8f0; margin-top: 8px; padding-top: 10px; font-size: 16px; font-weight: 700; color: #0f172a; }
    .totals .grand span:last-child { color: ${totalColor}; }
    footer { margin-top: 36px; padding-top: 16px; border-top: 1px dashed #e2e8f0; text-align: center; font-size: 12px; color: #64748b; }
    @media print {
      @page { size: A4; margin: 14mm; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .sheet { max-width: none; padding: 0; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <header>
      <div class="brand">
        ${LOGO_SVG}
        <div>
          <h1>${escapeHtml(businessName)}</h1>
          <p>${escapeHtml([branchName, region].filter(Boolean).join(' · '))}</p>
        </div>
      </div>
      <div class="meta">
        <strong>${escapeHtml(docTitle)}</strong>
        ${escapeHtml(id)}<br />
        ${escapeHtml(issuedAt)}
      </div>
    </header>

    <div class="grid">
      <div>
        <div class="label">Cliente</div>
        <div><strong>${escapeHtml(customerName)}</strong></div>
        ${customerPhone ? `<div class="muted">${escapeHtml(customerPhone)}</div>` : ''}
      </div>
      <div>
        <div class="label">Pago</div>
        <div><strong>${escapeHtml(paymentMethod)}</strong></div>
        ${paymentReference ? `<div class="muted">Ref: ${escapeHtml(paymentReference)}</div>` : ''}
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Descripción</th>
          <th class="num">Cant.</th>
          <th class="num">Precio</th>
          <th class="num">Importe</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="totals">
      <div><span>Subtotal</span><span>${escapeHtml(formatDOP(subtotal))}</span></div>
      ${
        discountAmt > 0
          ? `<div class="discount"><span>Descuento (${escapeHtml(discountPct.toFixed(1))}%)</span><span>−${escapeHtml(formatDOP(discountAmt))}</span></div>`
          : ''
      }
      <div><span>ITBIS (${escapeHtml(taxPct)}%)</span><span>${escapeHtml(formatDOP(taxAmt))}</span></div>
      <div class="grand"><span>Total</span><span>${escapeHtml(formatDOP(total))}</span></div>
    </div>

    <footer>${footer}</footer>
  </div>
</body>
</html>`
}

export function printInvoice(html) {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
  document.body.appendChild(iframe)

  const win = iframe.contentWindow
  const doc = win.document
  doc.open()
  doc.write(html)
  doc.close()

  const cleanup = () => {
    if (iframe.parentNode) iframe.remove()
  }
  win.addEventListener('afterprint', cleanup, { once: true })
  setTimeout(cleanup, 120000)

  win.focus()
  win.print()
}

export function downloadInvoice(html, filename) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
