import { create } from 'zustand'

import {
  appendTickerRowsCapped,
  computeTickerLimit,
} from '@/modules/configuracion/lib/importProgressTicker'

const DONE_DISMISS_MS = 8000

let dismissTimer = null

function clearDismissTimer() {
  if (dismissTimer) {
    clearTimeout(dismissTimer)
    dismissTimer = null
  }
}

function scheduleDismiss(get) {
  clearDismissTimer()
  dismissTimer = setTimeout(() => {
    get().clearJob()
    dismissTimer = null
  }, DONE_DISMISS_MS)
}

const initialState = {
  status: 'idle',
  kind: null,
  progress: null,
  tickerRows: [],
  agendaTickerCap: 0,
  report: null,
  headline: null,
  errorMessage: null,
}

export const IMPORT_KIND_LABELS = {
  pipeline: 'Importando embudo',
  customers: 'Importando clientes',
  activities: 'Importando actividades',
  agenda: 'Importando citas',
}

export const useImportJobStore = create((set, get) => ({
  ...initialState,

  startJob: (kind) => {
    clearDismissTimer()
    set({
      status: 'running',
      kind,
      progress: null,
      tickerRows: [],
      agendaTickerCap: 0,
      report: null,
      headline: null,
      errorMessage: null,
    })
  },

  setAgendaTickerCap: (cap) => set({ agendaTickerCap: cap }),

  patchProgress: (update) => {
    const { agendaTickerCap } = get()
    set({ progress: update })
    if (update.tickerSample?.length && agendaTickerCap > 0) {
      set((state) => ({
        tickerRows: appendTickerRowsCapped(
          state.tickerRows,
          update.tickerSample,
          agendaTickerCap,
        ),
      }))
    }
  },

  finishJob: ({ report, headline }) => {
    set({
      status: 'done',
      progress: null,
      tickerRows: [],
      agendaTickerCap: 0,
      report,
      headline,
      errorMessage: null,
    })
    scheduleDismiss(get)
  },

  failJob: (errorMessage) => {
    set({
      status: 'error',
      progress: null,
      tickerRows: [],
      agendaTickerCap: 0,
      errorMessage: errorMessage || 'No se pudo importar el archivo.',
    })
    scheduleDismiss(get)
  },

  cancelJob: () => {
    clearDismissTimer()
    set({ ...initialState })
  },

  clearJob: () => {
    clearDismissTimer()
    set({ ...initialState })
  },
}))

export function importJobRunningKind(state) {
  return state.status === 'running' ? state.kind : null
}

export { computeTickerLimit }
