import {
  DOC_TYPES,
  formatDocumentInput,
  normalizeDocumentId,
} from '@/modules/agenda/lib/selfBooking'

export { DOC_TYPES, formatDocumentInput, normalizeDocumentId }

export function validateCustomerDocument(docType, documentId) {
  const key = normalizeDocumentId(documentId, docType)
  if (!key) return 'Ingresa el documento de identidad.'
  if (docType === 'cedula' && key.length !== 11) {
    return 'La cédula debe tener 11 dígitos.'
  }
  if (docType === 'rnc' && key.length !== 9) {
    return 'El RNC debe tener 9 dígitos.'
  }
  if (docType === 'pasaporte' && key.length < 3) {
    return 'Ingresa un pasaporte válido.'
  }
  return ''
}

export function findCustomerByDocument(customers, docType, documentId) {
  const key = normalizeDocumentId(documentId, docType)
  if (!key) return null
  return customers.find(
    (customer) =>
      !customer.isDefault
      && customer.docType === docType
      && normalizeDocumentId(customer.documentId, docType) === key
  ) || null
}
