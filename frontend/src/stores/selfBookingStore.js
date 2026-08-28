import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useAgendaStore } from '@/stores/agendaStore'
import { usePosStore } from '@/stores/posStore'
import { normalizeDocumentId, buildBookingUrl, buildProfileUrl, buildConfirmationEmail } from '@/modules/agenda/lib/selfBooking'

const genId = (p) => `${p}-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`
const now = () => new Date().toISOString()

const SEED_PROFILES = [
  {
    id: 'prof-1',
    docType: 'cedula',
    documentId: '00112345678',
    name: 'María Fernández',
    email: 'maria.fernandez@email.com',
    phone: '809-555-0142',
    address: 'Los Prados, Santo Domingo',
    wantsInvoice: true,
    wantsContact: false,
    customerId: 'c1',
    createdAt: '2026-01-10T10:00:00.000Z',
  },
  {
    id: 'prof-2',
    docType: 'cedula',
    documentId: '40298765432',
    name: 'José Ramírez',
    email: 'jose.ramirez@email.com',
    phone: '809-555-0198',
    address: '',
    wantsInvoice: false,
    wantsContact: true,
    customerId: 'c2',
    createdAt: '2026-01-12T10:00:00.000Z',
  },
]

function normalizeProfile(data) {
  return {
    docType: data.docType || 'cedula',
    documentId: normalizeDocumentId(data.documentId),
    name: data.name || '',
    email: data.email || '',
    phone: data.phone || '',
    address: data.address || '',
    wantsInvoice: !!data.wantsInvoice,
    wantsContact: !!data.wantsContact,
    customerId: data.customerId || null,
  }
}

export const useSelfBookingStore = create(
  persist(
    (set, get) => ({
      profiles: SEED_PROFILES,
      claims: [],
      emails: [],

      lookupByDocument: (documentId) => {
        const key = normalizeDocumentId(documentId)
        return get().profiles.find((p) => p.documentId === key) || null
      },

      upsertProfile: (data) => {
        const normalized = normalizeProfile(data)
        const existing = get().lookupByDocument(normalized.documentId)
        if (existing) {
          const updated = { ...existing, ...normalized, updatedAt: now() }
          set((s) => ({
            profiles: s.profiles.map((p) => (p.id === existing.id ? updated : p)),
          }))
          return updated
        }
        const profile = { id: genId('prof'), createdAt: now(), ...normalized }
        set((s) => ({ profiles: [profile, ...s.profiles] }))
        return profile
      },

      ensureCustomer: (profile) => {
        const pos = usePosStore.getState()
        if (profile.customerId) {
          const found = pos.customers.find((c) => c.id === profile.customerId)
          if (found) return found
        }
        const byPhone = profile.phone && pos.customers.find((c) => c.phone === profile.phone)
        if (byPhone) {
          get().linkProfileToCustomer(profile.id, byPhone.id)
          return byPhone
        }
        const customer = {
          id: genId('cust'),
          name: profile.name,
          phone: profile.phone || null,
          email: profile.email || null,
          points: 0,
          documentId: profile.documentId,
        }
        pos.addCustomer(customer)
        get().linkProfileToCustomer(profile.id, customer.id)
        return customer
      },

      linkProfileToCustomer: (profileId, customerId) =>
        set((s) => ({
          profiles: s.profiles.map((p) => (p.id === profileId ? { ...p, customerId } : p)),
        })),

      bookAppointment: ({ profile, branchId, service, date, time, employeeId, duration }) => {
        const customer = get().ensureCustomer(profile)
        const agenda = useAgendaStore.getState()
        const appointment = {
          date,
          time,
          duration: duration || 30,
          employeeId,
          branchId,
          customerId: customer.id,
          customerName: profile.name,
          customerPhone: profile.phone || '',
          serviceId: service.id,
          serviceName: service.name,
          price: service.price,
          status: 'pendiente',
          source: 'self',
          firstTime: !get().profiles.find((p) => p.id === profile.id)?.customerId,
        }
        agenda.addAppointment(appointment)
        get().queueEmail({
          profileId: profile.id,
          to: profile.email || profile.phone,
          kind: 'confirmation',
          subject: 'Cita confirmada — Charm',
          body: `Hola ${profile.name}, tu cita para ${service.name} el ${date} a las ${time} fue registrada.`,
        })
        return appointment
      },

      addClaim: ({ profileId, documentId, appointmentId, type, message }) => {
        const claim = {
          id: genId('claim'),
          profileId,
          documentId: normalizeDocumentId(documentId),
          appointmentId: appointmentId || null,
          type: type || 'general',
          message: message.trim(),
          status: 'abierto',
          createdAt: now(),
        }
        set((s) => ({ claims: [claim, ...s.claims] }))
        return claim
      },

      getClaimsForProfile: (profileId) => get().claims.filter((c) => c.profileId === profileId),

      queueEmail: ({ profileId, to, subject, body, kind = 'outbound' }) => {
        const email = {
          id: genId('eml'),
          profileId,
          to,
          subject,
          body,
          kind,
          sentAt: now(),
        }
        set((s) => ({ emails: [email, ...s.emails] }))
        return email
      },

      sendBookingLinkEmail: ({ profile, branchId, branchName }) => {
        const bookingUrl = buildBookingUrl(branchId)
        const profileUrl = buildProfileUrl(profile.documentId)
        const content = buildConfirmationEmail({ profile, branchName, bookingUrl, profileUrl })
        return get().queueEmail({
          profileId: profile.id,
          to: profile.email || profile.phone,
          kind: 'booking-link',
          subject: content.subject,
          body: content.body,
        })
      },
    }),
    {
      name: 'diedo-self-booking',
      version: 1,
      migrate: (persisted) => persisted ?? {},
      partialize: (s) => ({ profiles: s.profiles, claims: s.claims, emails: s.emails }),
    }
  )
)

export const SELF_DOC_STORAGE_KEY = 'diedo-self-doc'

export function rememberDocument(documentId) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(SELF_DOC_STORAGE_KEY, normalizeDocumentId(documentId))
  }
}

export function recallDocument() {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(SELF_DOC_STORAGE_KEY) || ''
}
