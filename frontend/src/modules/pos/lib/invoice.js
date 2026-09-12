import { buildHeliosLogoHtml, PRODUCT_NAME } from '@/components/brand/HeliosIcon'
import { formatDOP } from '@/lib/format'
import { downloadHtmlAsPdf, printHtml } from '@/lib/print'

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

function itemUnitPrice(item) {
  return Number(item.price) || 0
}

function itemListPrice(item) {
  return Number(item.listPrice ?? item.price) || 0
}

function isItemDiscounted(item) {
  return itemUnitPrice(item) < itemListPrice(item) - 0.001
}

function formatItemPriceHtml(item) {
  const unit = itemUnitPrice(item)
  const list = itemListPrice(item)
  if (isItemDiscounted(item)) {
    return `<span class="strike">${escapeHtml(formatDOP(list))}</span> ${escapeHtml(formatDOP(unit))}`
  }
  return escapeHtml(formatDOP(unit))
}

export function formatInvoiceDate(date = new Date()) {
  return date.toLocaleString('es-DO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function makeInvoiceId(date = new Date(), kind = 'sale') {
  const prefix = kind === 'expense' ? 'GTO' : kind === 'quote' ? 'COT' : 'FAC'
  return `${prefix}-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

export function invoiceFilename(id) {
  return `${id}.pdf`
}

export function buildInvoiceHtml(data) {
  const {
    id,
    issuedAt,
    businessName,
    legalName = '',
    businessRnc = '',
    businessAddress = '',
    businessPhone = '',
    businessEmail = '',
    logoDataUrl = '',
    footerNote = '',
    branchName,
    region,
    customerName,
    customerPhone,
    customerTaxLine = '',
    paymentMethod,
    paymentReference,
    items,
    subtotal,
    discountAmt,
    discountPct,
    taxPct,
    taxLabel,
    taxAmt,
    total,
    kind = 'sale',
    validUntil = '',
  } = data

  const isExpense = kind === 'expense'
  const isQuote = kind === 'quote'
  const docTitle = isExpense ? 'Gasto' : isQuote ? 'Cotización' : 'Factura'
  const totalColor = isExpense ? '#dc2626' : isQuote ? '#d97706' : '#2563eb'
  const footerText = footerNote
    || (isExpense
      ? `Comprobante de gasto · ${escapeHtml(businessName)}`
      : isQuote
        ? `Cotización sujeta a disponibilidad · ${escapeHtml(businessName)}`
        : `Gracias por su compra · ${escapeHtml(businessName)}`)

  const logoHtml = logoDataUrl
    ? `<img src="${logoDataUrl.replace(/"/g, '&quot;')}" alt="" class="brand-logo" />`
    : buildHeliosLogoHtml({ title: businessName || PRODUCT_NAME })

  const rows = items
    .map((item) => {
      const line = itemUnitPrice(item) * item.qty
      return `<tr>
        <td>
          <div class="item-name">${escapeHtml(item.name)}</div>
          ${item.sku ? `<div class="muted">SKU: ${escapeHtml(item.sku)}</div>` : ''}
        </td>
        <td class="num">${item.qty}</td>
        <td class="num">${formatItemPriceHtml(item)}</td>
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
    .brand-logo { width: 36px; height: 36px; flex-shrink: 0; border-radius: 8px; object-fit: contain; }
    .brand h1 { margin: 0; font-size: 22px; letter-spacing: -0.02em; }
    .brand p { margin: 0 2px 0 0; font-size: 12px; color: #64748b; }
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
    .strike { text-decoration: line-through; color: #94a3b8; margin-right: 4px; }
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
        ${logoHtml}
        <div>
          <h1>${escapeHtml(businessName)}</h1>
          ${legalName && legalName !== businessName ? `<p>${escapeHtml(legalName)}</p>` : ''}
          ${businessRnc ? `<p class="muted">RNC ${escapeHtml(businessRnc)}</p>` : ''}
          ${businessAddress ? `<p class="muted">${escapeHtml(businessAddress)}</p>` : ''}
          ${[businessPhone, businessEmail].filter(Boolean).length
    ? `<p class="muted">${escapeHtml([businessPhone, businessEmail].filter(Boolean).join(' · '))}</p>`
    : ''}
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
        ${customerTaxLine ? `<div class="muted">${escapeHtml(customerTaxLine)}</div>` : ''}
        ${customerPhone ? `<div class="muted">${escapeHtml(customerPhone)}</div>` : ''}
      </div>
      <div>
        <div class="label">${isQuote ? 'Condición' : 'Pago'}</div>
        <div><strong>${escapeHtml(paymentMethod)}</strong></div>
        ${paymentReference ? `<div class="muted">Ref: ${escapeHtml(paymentReference)}</div>` : ''}
        ${isQuote && validUntil ? `<div class="muted">Válida hasta ${escapeHtml(validUntil)}</div>` : ''}
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
      <div><span>${escapeHtml(taxLabel || `ITBIS (${taxPct}%)`)}</span><span>${escapeHtml(formatDOP(taxAmt))}</span></div>
      <div class="grand"><span>Total</span><span>${escapeHtml(formatDOP(total))}</span></div>
    </div>

    <footer>${footerText}</footer>
  </div>
</body>
</html>`
}

export function printInvoice(html) {
  printHtml(html)
}

export async function downloadInvoicePdf(data, filename) {
  await downloadHtmlAsPdf(buildInvoiceHtml(data), filename)
}
