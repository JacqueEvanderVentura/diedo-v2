import { buildHeliosLogoHtml, PRODUCT_NAME } from '@/components/brand/HeliosIcon'
import { formatDOP } from '@/lib/format'
import { downloadInvoiceDocument, printInvoiceDocument } from './invoicePdf'

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
    return `<s class="strike" style="text-decoration:line-through;text-decoration-line:line-through;-webkit-text-decoration-line:line-through;">${escapeHtml(formatDOP(list))}</s> ${escapeHtml(formatDOP(unit))}`
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

function splitAddressLines(address) {
  if (!address) return []
  return String(address)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function buildInvoiceFooterHtml(data) {
  const {
    businessName,
    legalName = '',
    businessRnc = '',
    businessAddress = '',
    businessPhone = '',
    businessEmail = '',
    footerNote = '',
    branchName = '',
    kind = 'sale',
  } = data

  const isExpense = kind === 'expense'
  const isQuote = kind === 'quote'
  const defaultNote = isExpense
    ? `Comprobante de gasto · ${businessName}`
    : isQuote
      ? `Cotización sujeta a disponibilidad · ${businessName}`
      : `Gracias por su compra · ${businessName}`
  const note = footerNote || defaultNote
  const legalTitle = (legalName && legalName !== businessName ? legalName : businessName) || businessName
  const addressLines = splitAddressLines(businessAddress)
  const rncLine = businessRnc ? `RNC: ${businessRnc}` : ''

  const contacts = []
  if (businessPhone) {
    contacts.push(
      `<div class="invoice-footer-contact">`
      + `<span class="invoice-footer-icon" aria-hidden="true">☎</span>`
      + `<span>${escapeHtml(businessPhone)}</span>`
      + `</div>`
    )
  }
  if (businessEmail) {
    contacts.push(
      `<div class="invoice-footer-contact invoice-footer-contact-end">`
      + `<span class="invoice-footer-icon" aria-hidden="true">✉</span>`
      + `<span>${escapeHtml(businessEmail)}</span>`
      + `</div>`
    )
  }

  const legalLines = [
    legalTitle,
    rncLine,
    ...addressLines,
    note,
  ].filter(Boolean)

  return `
    <footer class="invoice-footer">
      ${contacts.length ? `<div class="invoice-footer-contacts">${contacts.join('')}</div>` : ''}
      <div class="invoice-footer-divider" role="presentation"></div>
      <div class="invoice-footer-legal">
        ${legalLines.map((line, index) => (
          `<div class="${index === 0 ? 'invoice-footer-legal-name' : 'invoice-footer-legal-line'}">${escapeHtml(line)}</div>`
        )).join('')}
      </div>
      ${branchName ? `<div class="invoice-footer-branch">${escapeHtml(branchName)}</div>` : ''}
      <div class="invoice-page-number" aria-hidden="true"></div>
    </footer>
  `
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
    paidAmount = 0,
    balanceDue = null,
    kind = 'sale',
    validUntil = '',
  } = data

  const isExpense = kind === 'expense'
  const isQuote = kind === 'quote'
  const docTitle = isExpense ? 'Gasto' : isQuote ? 'Cotización' : 'Factura'
  const totalColor = isExpense ? '#dc2626' : isQuote ? '#d97706' : '#2563eb'

  const balance = balanceDue != null ? Number(balanceDue) : Math.max(0, Number(total) - Number(paidAmount))
  const paid = Number(paidAmount) || 0

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
      max-width: 100%;
      margin: 0 auto;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      padding: 12px 10px;
      box-sizing: border-box;
    }
    .invoice-content {
      flex: 1 0 auto;
    }
    .invoice-print-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 16px;
      margin-bottom: 20px;
      flex-shrink: 0;
    }
    .header-left { flex: 1; min-width: 0; }
    .header-left h1 { margin: 0; font-size: 22px; letter-spacing: -0.02em; }
    .header-left p { margin: 0 2px 0 0; font-size: 12px; color: #64748b; }
    .header-right {
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 10px;
      max-width: 42%;
    }
    .brand-logo {
      flex-shrink: 0;
      max-height: 72px;
      max-width: min(240px, 100%);
      width: auto;
      height: auto;
      object-fit: contain;
      object-position: right top;
    }
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
    .strike, s.strike {
      display: inline-block;
      line-height: 1.25;
      vertical-align: baseline;
      text-decoration: line-through;
      text-decoration-line: line-through;
      -webkit-text-decoration-line: line-through;
      text-decoration-color: #94a3b8;
      text-decoration-thickness: 1px;
      text-decoration-skip-ink: none;
      color: #94a3b8;
      margin-right: 4px;
    }
    .totals { margin-top: 20px; margin-left: auto; width: 280px; font-size: 13px; }
    .totals div { display: flex; justify-content: space-between; padding: 5px 0; color: #475569; }
    .totals .discount { color: #059669; }
    .totals .grand { border-top: 1px solid #e2e8f0; margin-top: 8px; padding-top: 10px; font-size: 16px; font-weight: 700; color: #0f172a; }
    .totals .grand span:last-child { color: ${totalColor}; }
    .invoice-footer {
      margin-top: auto;
      padding-top: 24px;
      font-size: 12px;
      color: #475569;
      flex-shrink: 0;
    }
    .invoice-page-number {
      display: none;
    }
    .invoice-footer-contacts {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px 16px;
      margin-bottom: 12px;
      font-size: 12px;
      color: #334155;
    }
    .invoice-footer-contact {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .invoice-footer-contact-end { margin-left: auto; }
    .invoice-footer-icon {
      display: inline-flex;
      width: 16px;
      justify-content: center;
      color: #64748b;
      font-size: 13px;
      line-height: 1;
    }
    .invoice-footer-divider {
      height: 0;
      border-top: 1px solid #cbd5e1;
      margin: 0 0 14px;
    }
    .invoice-footer-legal {
      text-align: left;
      line-height: 1.45;
    }
    .invoice-footer-legal-name {
      font-weight: 700;
      color: #0f172a;
      font-size: 13px;
      margin-bottom: 2px;
    }
    .invoice-footer-legal-line {
      color: #64748b;
      font-size: 12px;
    }
    .invoice-footer-branch {
      margin-top: 12px;
      padding-top: 10px;
      border-top: 1px solid #e2e8f0;
      font-weight: 600;
      font-size: 12px;
      color: #334155;
      text-align: left;
    }
    @media print {
      @page {
        size: A4;
        margin: 8mm 8mm 10mm 8mm;
        @bottom-right {
          content: counter(page) ' / ' counter(pages);
          font-size: 9pt;
          color: #64748b;
        }
      }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .sheet {
        max-width: none;
        min-height: auto;
        display: block;
        padding: 0;
      }
      .invoice-print-header {
        position: fixed;
        top: 0;
        left: 8mm;
        right: 8mm;
        margin: 0;
        padding: 0 0 10px 0;
        background: #fff;
        z-index: 20;
      }
      .invoice-footer {
        position: fixed;
        bottom: 0;
        left: 8mm;
        right: 8mm;
        margin: 0;
        padding: 6px 0 0 0;
        background: #fff;
        z-index: 20;
      }
      .invoice-content {
        padding-top: var(--invoice-header-clearance, 52mm);
        padding-bottom: var(--invoice-footer-clearance, 42mm);
      }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <header class="invoice-print-header">
      <div class="header-left">
        <h1>${escapeHtml(businessName)}</h1>
        ${businessRnc ? `<p class="muted">RNC: ${escapeHtml(businessRnc)}</p>` : ''}
        ${businessAddress ? `<p class="muted">${escapeHtml(businessAddress.split('\n')[0])}</p>` : ''}
      </div>
      <div class="header-right">
        ${logoHtml}
        <div class="meta">
          <strong>${escapeHtml(docTitle)}</strong>
          ${escapeHtml(id)}<br />
          ${escapeHtml(issuedAt)}
        </div>
      </div>
    </header>

    <main class="invoice-content">
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
      ${
        !isQuote && paid > 0
          ? `<div><span>Cobrado</span><span>${escapeHtml(formatDOP(paid))}</span></div>`
          : ''
      }
      ${
        !isQuote && balance > 0.009
          ? `<div class="grand"><span>Saldo pendiente</span><span>${escapeHtml(formatDOP(balance))}</span></div>`
          : ''
      }
    </div>
    </main>

    ${buildInvoiceFooterHtml(data)}
  </div>
</body>
</html>`
}

export async function printInvoice(data, options = {}) {
  await printInvoiceDocument(data, options)
}

export async function downloadInvoicePdf(data, filename, options = {}) {
  await downloadInvoiceDocument(data, filename, options)
}
