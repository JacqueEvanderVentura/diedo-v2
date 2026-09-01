import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatDOP } from '@/lib/format'
import { printHtml } from '@/lib/print'

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

function formatItemPricePdf(item) {
  const unit = itemUnitPrice(item)
  const list = itemListPrice(item)
  if (isItemDiscounted(item)) {
    return `${formatDOP(unit)} (antes ${formatDOP(list)})`
  }
  return formatDOP(unit)
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
    taxLabel,
    taxAmt,
    total,
    kind = 'sale',
  } = data

  const isExpense = kind === 'expense'
  const isQuote = kind === 'quote'
  const docTitle = isExpense ? 'Gasto' : isQuote ? 'Cotización' : 'Factura'
  const totalColor = isExpense ? '#dc2626' : isQuote ? '#d97706' : '#2563eb'
  const footer = isExpense
    ? `Comprobante de gasto · ${escapeHtml(businessName)}`
    : `Gracias por su compra · ${escapeHtml(businessName)}`

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
      <div><span>${escapeHtml(taxLabel || `ITBIS (${taxPct}%)`)}</span><span>${escapeHtml(formatDOP(taxAmt))}</span></div>
      <div class="grand"><span>Total</span><span>${escapeHtml(formatDOP(total))}</span></div>
    </div>

    <footer>${footer}</footer>
  </div>
</body>
</html>`
}

export function printInvoice(html) {
  printHtml(html)
}

export function downloadInvoicePdf(data, filename) {
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
    taxLabel,
    taxAmt,
    total,
    kind = 'sale',
  } = data

  const isExpense = kind === 'expense'
  const isQuote = kind === 'quote'
  const docTitle = isExpense ? 'Gasto' : isQuote ? 'Cotización' : 'Factura'
  const pdf = new jsPDF()
  const margin = 14
  let y = 18

  pdf.setFontSize(16)
  pdf.text(businessName, margin, y)
  y += 7
  pdf.setFontSize(9)
  pdf.setTextColor(100)
  const subtitle = [branchName, region].filter(Boolean).join(' · ')
  if (subtitle) {
    pdf.text(subtitle, margin, y)
    y += 5
  }
  pdf.setTextColor(0)

  pdf.setFontSize(11)
  pdf.text(docTitle, 150, 18, { align: 'right' })
  pdf.setFontSize(9)
  pdf.setTextColor(80)
  pdf.text(id, 150, 24, { align: 'right' })
  pdf.text(issuedAt, 150, 29, { align: 'right' })
  pdf.setTextColor(0)

  y += 6
  pdf.setFontSize(9)
  pdf.text(`Cliente: ${customerName}`, margin, y)
  y += 5
  if (customerPhone) {
    pdf.text(customerPhone, margin, y)
    y += 5
  }
  pdf.text(`Pago: ${paymentMethod}${paymentReference ? ` · Ref: ${paymentReference}` : ''}`, margin, y)
  y += 8

  autoTable(pdf, {
    startY: y,
    head: [['Descripción', 'Cant.', 'Precio', 'Importe']],
    body: items.map((item) => {
      const unit = itemUnitPrice(item)
      const line = unit * item.qty
      const desc = item.sku ? `${item.name}\nSKU: ${item.sku}` : item.name
      return [desc, String(item.qty), formatItemPricePdf(item), formatDOP(line)]
    }),
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: isExpense ? [220, 38, 38] : isQuote ? [217, 119, 6] : [37, 99, 235] },
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
    },
  })

  const finalY = (pdf.lastAutoTable?.finalY ?? y) + 10
  const totalsX = 130
  let ty = finalY

  pdf.setFontSize(10)
  pdf.text('Subtotal:', totalsX, ty)
  pdf.text(formatDOP(subtotal), 196, ty, { align: 'right' })
  ty += 6

  if (discountAmt > 0) {
    pdf.setTextColor(5, 150, 105)
    pdf.text(`Descuento (${discountPct.toFixed(1)}%):`, totalsX, ty)
    pdf.text(`−${formatDOP(discountAmt)}`, 196, ty, { align: 'right' })
    pdf.setTextColor(0)
    ty += 6
  }

  pdf.text(`${taxLabel || `ITBIS (${taxPct}%)`}:`, totalsX, ty)
  pdf.text(formatDOP(taxAmt), 196, ty, { align: 'right' })
  ty += 8

  pdf.setFontSize(12)
  pdf.setFont(undefined, 'bold')
  pdf.text('Total:', totalsX, ty)
  if (isExpense) pdf.setTextColor(220, 38, 38)
  else if (isQuote) pdf.setTextColor(217, 119, 6)
  else pdf.setTextColor(37, 99, 235)
  pdf.text(formatDOP(total), 196, ty, { align: 'right' })
  pdf.setTextColor(0)
  pdf.setFont(undefined, 'normal')

  pdf.save(filename)
}
