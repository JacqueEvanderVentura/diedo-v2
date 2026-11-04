import { create } from 'zustand'

import {
  appendTickerRowsCapped,
  computeTickerLimit,
} from '@/modules/configuracion/lib/importProgressTicker'

const initialState = {
  status: 'idle',
  kind: null,
  progress: null,
  tickerRows: [],
  agendaTickerCap: 0,
  report: null,
  headline: null,
  errorMessage: null,
  bannerDismissed: false,
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
    set({
      status: 'running',
      kind,
      progress: null,
      tickerRows: [],
      agendaTickerCap: 0,
      report: null,
      headline: null,
      errorMessage: null,
      bannerDismissed: false,
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
    const { progress } = get()
    const finalProgress = progress
      ? { ...progress, processed: progress.total }
      : {
          processed: report?.processed ?? report?.totalInFile ?? 0,
          total: report?.totalInFile ?? 0,
          batchIndex: 1,
          batchCount: 1,
          tickerSample: [],
        }
    set({
      status: 'done',
      progress: finalProgress,
      tickerRows: [],
      agendaTickerCap: 0,
      report,
      headline,
      errorMessage: null,
      bannerDismissed: false,
    })
  },

  failJob: (errorMessage) => {
    set({
      status: 'error',
      progress: null,
      tickerRows: [],
      agendaTickerCap: 0,
      errorMessage: errorMessage || 'No se pudo importar el archivo.',
      bannerDismissed: false,
    })
  },

  dismissBanner: () => {
    set({ bannerDismissed: true })
  },

  cancelJob: () => {
    set({ ...initialState })
  },

  clearJob: () => {
    set({ ...initialState })
  },
}))

export function importJobRunningKind(state) {
  return state.status === 'running' ? state.kind : null
}

export { computeTickerLimit }
