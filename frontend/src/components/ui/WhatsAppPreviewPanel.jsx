import { MessageCircle } from 'lucide-react'

export function WhatsAppPreviewPanel({ message, emptyHint = 'Escribe el mensaje para ver la vista previa.' }) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-100 bg-slate-50 p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
        <MessageCircle className="h-4 w-4 shrink-0 text-emerald-600" />
        Vista previa de WhatsApp
      </div>
      {!message ? (
        <p className="text-sm text-slate-400">{emptyHint}</p>
      ) : (
        <div className="rounded-2xl border border-emerald-100 bg-[#e7fce8] p-3 sm:p-4 shadow-sm">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-emerald-800/80">Mensaje</p>
          <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-slate-800">
            {message}
          </pre>
        </div>
      )}
    </div>
  )
}
