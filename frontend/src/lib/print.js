/** Silent print via hidden iframe (no new browser tab). */
export function printHtml(html) {
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
