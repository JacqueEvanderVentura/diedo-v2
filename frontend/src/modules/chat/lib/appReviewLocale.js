import { useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

const STORAGE_KEY = 'helios_app_review_lang'

export function isAppReviewEnglish(searchParams) {
  const fromQuery = searchParams?.get?.('lang')
  if (fromQuery === 'en') return true
  if (fromQuery && fromQuery !== 'en') return false
  if (typeof window === 'undefined') return false
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) === 'en'
  } catch {
    return false
  }
}

export function useAppReviewEnglish() {
  const [searchParams] = useSearchParams()
  const en = useMemo(() => isAppReviewEnglish(searchParams), [searchParams])

  useEffect(() => {
    const fromQuery = searchParams.get('lang')
    if (fromQuery !== 'en') return
    try {
      window.sessionStorage.setItem(STORAGE_KEY, 'en')
    } catch {
      /* ignore */
    }
  }, [searchParams])

  return en
}

const CHANNELS_ES = {
  appReviewBanner: null,
  intro:
    'Conecta Instagram o WhatsApp Cloud y asígnalos a sucursales. Escribes y recibes en WhatsApp (app Business o el número Cloud), no en Messenger. Facebook Login solo se usa una vez para autorizar Cloud API; los tokens quedan en el servidor.',
  permissionHint:
    'Se requiere el permiso workspace.update para conectar cuentas.',
  loading: 'Cargando cuentas…',
  connect: 'Conectar',
  connecting: 'Abriendo Meta…',
  connected: 'Conectado',
  disconnected: 'No conectado',
  error: 'Error',
  branches: 'Sucursales',
  disconnect: 'Desconectar',
  branchCount: (n) => `${n} sucursal(es)`,
  noBranches: 'Sin sucursales asignadas',
  assignBranchesTitle: 'Asignar sucursales',
  assignBranchesBody: (name) => `Elige qué sucursales verán los mensajes de ${name}.`,
  noBranchesLoaded: 'No hay sucursales cargadas.',
  cancel: 'Cancelar',
  save: 'Guardar',
  oauthSelectTitle: 'Elige la cuenta Meta',
  oauthSelectIntro: (label) => `Meta devolvió varias cuentas para ${label}.`,
  portfolioLabel: 'Portafolio',
  phoneLabel: 'Tel.',
  idLabel: 'ID',
  popupHint: 'Completa el permiso de Meta en la ventana nueva. Esta pantalla se actualizará sola.',
  instagram: {
    label: 'Instagram',
    description: 'Mensajes directos de cuentas profesionales (Graph Messaging).',
  },
  whatsapp: {
    label: 'WhatsApp',
    description:
      'WhatsApp Cloud API. El permiso se pide en Facebook Business, no en WhatsApp.',
  },
}

const CHANNELS_EN = {
  appReviewBanner: 'App Review mode: English UI for Meta screen recording.',
  intro:
    'Connect Instagram or WhatsApp Cloud and assign them to branches. Facebook Login is only used to authorize Cloud API; tokens stay on the server.',
  permissionHint: 'workspace.update permission is required to connect accounts.',
  loading: 'Loading accounts…',
  connect: 'Connect',
  connecting: 'Opening Meta…',
  connected: 'Connected',
  disconnected: 'Not connected',
  error: 'Error',
  branches: 'Branches',
  disconnect: 'Disconnect',
  branchCount: (n) => `${n} branch(es)`,
  noBranches: 'No branches assigned',
  assignBranchesTitle: 'Assign branches',
  assignBranchesBody: (name) => `Choose which branches see messages from ${name}.`,
  noBranchesLoaded: 'No branches loaded.',
  cancel: 'Cancel',
  save: 'Save',
  oauthSelectTitle: 'Choose WhatsApp number',
  oauthSelectIntro:
    'Helios uses business_management to list your Meta Business portfolios and the WhatsApp numbers they own. Select the number for this workspace.',
  portfolioLabel: 'Business portfolio',
  phoneLabel: 'Phone',
  idLabel: 'ID',
  popupHint: 'Complete Meta permission in the new window. This page will refresh automatically.',
  instagram: {
    label: 'Instagram',
    description: 'Direct messages from professional accounts (Graph Messaging).',
  },
  whatsapp: {
    label: 'WhatsApp',
    description: 'WhatsApp Cloud API. Permissions are granted via Facebook Login for Business.',
  },
}

export function chatChannelsCopy(en) {
  return en ? CHANNELS_EN : CHANNELS_ES
}

const INBOX_ES = {
  appReviewBanner: null,
  headerSubtitle:
    'Bandeja unificada por sucursal. Las cuentas compartidas muestran los mismos hilos en cada sucursal asignada.',
  refresh: 'Actualizar',
  channels: 'Canales',
  retry: 'Reintentar',
  offline: 'Inicia sesión en línea para ver el inbox de chat.',
  noActiveBranch: 'No hay sucursal activa. Elige una sucursal en el selector del ERP.',
  loadError: 'No se pudieron cargar las conversaciones.',
  searchPlaceholder: 'Buscar conversación…',
  allChannels: 'Todos los canales',
  channelWhatsapp: 'WhatsApp',
  channelInstagram: 'Instagram',
  loadingThreads: 'Cargando hilos…',
  emptyListTitle: 'Sin conversaciones',
  emptyListDesc:
    'No hay mensajes para esta sucursal y filtro. Conecta canales en Configuración o espera mensajes entrantes.',
  selectConversationTitle: 'Selecciona una conversación',
  selectConversationDesc: 'Elige un hilo a la izquierda para ver el historial y responder.',
  loadingMessages: 'Cargando mensajes…',
  emptyThreadTitle: 'Sin mensajes',
  emptyThreadDesc: 'Aún no hay mensajes en este hilo.',
  windowOpen: 'Ventana de 24 h abierta',
  windowClosed:
    'Fuera de ventana de 24 h. En WhatsApp haría falta plantilla (próximamente).',
  sendPlaceholder: 'Escribe un mensaje…',
  sendPlaceholderClosed: 'No puedes responder fuera de la ventana de 24 h',
  noSendPermissionPrefix: 'Necesitas el permiso',
  noSendPermissionSuffix: 'para responder.',
  channelsLink: 'Revisa la conexión de canales',
  channelsLinkSuffix: 'si esperabas poder responder.',
}

const INBOX_EN = {
  appReviewBanner: 'App Review mode: English UI for Meta screen recording.',
  headerSubtitle:
    'Unified inbox per branch. Shared accounts show the same threads in every assigned branch.',
  refresh: 'Refresh',
  channels: 'Channels',
  retry: 'Retry',
  offline: 'Sign in online to view the chat inbox.',
  noActiveBranch: 'No active branch. Pick a branch in the ERP selector.',
  loadError: 'Could not load conversations.',
  searchPlaceholder: 'Search conversations…',
  allChannels: 'All channels',
  channelWhatsapp: 'WhatsApp',
  channelInstagram: 'Instagram',
  loadingThreads: 'Loading threads…',
  emptyListTitle: 'No conversations',
  emptyListDesc:
    'No messages for this branch and filter. Connect channels in Settings or wait for inbound messages.',
  selectConversationTitle: 'Select a conversation',
  selectConversationDesc: 'Choose a thread on the left to read and reply.',
  loadingMessages: 'Loading messages…',
  emptyThreadTitle: 'No messages',
  emptyThreadDesc: 'There are no messages in this thread yet.',
  windowOpen: '24-hour messaging window open',
  windowClosed: 'Outside the 24-hour window. WhatsApp templates are not supported yet.',
  sendPlaceholder: 'Type a message…',
  sendPlaceholderClosed: 'You cannot reply outside the 24-hour window',
  noSendPermissionPrefix: 'You need the',
  noSendPermissionSuffix: 'permission to reply.',
  channelsLink: 'Review channel connections',
  channelsLinkSuffix: 'if you expected to reply.',
}

export function chatInboxCopy(en) {
  return en ? INBOX_EN : INBOX_ES
}