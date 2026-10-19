import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ephemeralJsonStorage, ephemeralStorage } from '@/services/storagePolicy'
import { useCustomersStore } from '@/stores/customersStore'
import {
  normalizeDocumentId,
  buildBookingUrl,
  buildProfileUrl,
  buildConfirmationEmail,
} from '@/modules/agenda/lib/selfBooking'
import { publicBookingApi } from '@/services/publicBookingApi'

const genId = (p) => `${p}-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`
const now = () => new Date().toISOString()

function normalizeProfile(data) {
  return {
    docType: data.docType || 'cedula',
    documentId: normalizeDocumentId(data.documentId, data.docType),
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
      profiles: [],
      claims: [],
      emails: [],

      lookupByDocument: (documentId, docType = 'cedula') => {
        const key = normalizeDocumentId(documentId, docType)
        return get().profiles.find((p) => p.documentId === key) || null
      },

      upsertProfile: (data) => {
        const normalized = normalizeProfile(data)
        const existing = get().lookupByDocument(normalized.documentId, normalized.docType)
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

      ensureCustomer: async (profile) => {
        const customerStore = useCustomersStore.getState()
        if (profile.customerId) {
          const found = customerStore.customers.find((c) => c.id === profile.customerId)
          if (found) return found
        }
        const byPhone = profile.phone && customerStore.customers.find((c) => c.phone === profile.phone)
        if (byPhone) {
          get().linkProfileToCustomer(profile.id, byPhone.id)
          return byPhone
        }
        const customer = await customerStore.addCustomer({
          name: profile.name,
          phone: profile.phone || null,
          email: profile.email || null,
          points: 0,
          documentId: profile.documentId,
        })
        get().linkProfileToCustomer(profile.id, customer.id)
        return customer
      },

      linkProfileToCustomer: (profileId, customerId) =>
        set((s) => ({
          profiles: s.profiles.map((p) => (p.id === profileId ? { ...p, customerId } : p)),
        })),

      bookAppointment: async ({ profile, branchId, service, date, time, employeeId, duration, idempotencyKey }) => {
        const response = await publicBookingApi.book(branchId, {
          documentType: profile.docType || 'cedula',
          documentId: profile.documentId,
          displayName: profile.name,
          email: profile.email || null,
          phone: profile.phone || null,
          address: profile.address || null,
          wantsInvoice: profile.wantsInvoice,
          wantsContact: profile.wantsContact,
          serviceId: service.id,
          employeeId,
          date,
          time,
          duration: duration || 30,
        }, idempotencyKey)
        return response.appointment
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

      identifyRemote: async (branchId, docType, documentId) => {
        const result = await publicBookingApi.identify(branchId, {
          documentType: docType,
          documentId,
        })
        if (!result.customerId && result.isNew) return null
        return {
          docType: result.documentType,
          documentId: normalizeDocumentId(result.documentId, result.documentType),
          name: result.displayName || '',
          email: result.email || '',
          phone: result.phone || '',
          address: result.address || '',
          wantsInvoice: result.wantsInvoice,
          wantsContact: result.wantsContact,
          customerId: result.customerId,
        }
      },

      fetchRemoteSlots: async ({ branchId, date, employeeId, duration }) => {
        const result = await publicBookingApi.listSlots(branchId, {
          date,
          employeeId,
          duration,
        })
        return result.slots || []
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
      storage: ephemeralJsonStorage,
      version: 1,
      migrate: (persisted) => persisted ?? {},
      partialize: (s) => ({ profiles: s.profiles, claims: s.claims, emails: s.emails }),
    }
  )
)

export const SELF_DOC_STORAGE_KEY = 'diedo-self-doc'

export function rememberDocument(documentId) {
  ephemeralStorage.setItem(SELF_DOC_STORAGE_KEY, normalizeDocumentId(documentId))
}

export function recallDocument() {
  return ephemeralStorage.getItem(SELF_DOC_STORAGE_KEY) || ''
}
