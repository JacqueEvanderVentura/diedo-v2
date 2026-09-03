export function mapIncidentFromApi(incident, previous = null) {
  const previousPreviewById = new Map(
    (previous?.attachments || []).map((attachment) => [
      attachment.id,
      attachment.previewObjectUrl || null,
    ])
  )
  const attachments = (incident.attachments || []).map((attachment) => ({
    id: attachment.id,
    name: attachment.originalFilename,
    contentType: attachment.contentType,
    sizeBytes: Number(attachment.sizeBytes) || 0,
    checksum: attachment.checksumSha256,
    previewUrl: attachment.previewUrl,
    previewObjectUrl: previousPreviewById.get(attachment.id) || null,
    createdAt: attachment.createdAt,
  }))

  return {
    id: incident.id,
    code: incident.code,
    title: incident.title,
    description: incident.description || '',
    type: incident.type,
    priority: incident.priority,
    status: incident.status,
    branchId: incident.branchId,
    activoId: incident.activoId || null,
    employee: incident.employee || null,
    employeeId: incident.employee?.id || null,
    employeeIncidentKind: incident.employeeIncidentKind || null,
    reporter: incident.reporter || null,
    intervenientes: incident.intervenientes || [],
    attachments,
    images: attachments.map((attachment) => attachment.previewObjectUrl).filter(Boolean),
    activity: (incident.activity || []).map((entry) => ({
      id: entry.id,
      type: entry.type,
      authorId: entry.authorId || null,
      author: entry.author,
      message: entry.message,
      createdAt: entry.createdAt,
    })),
    version: incident.version,
    createdAt: incident.createdAt,
    updatedAt: incident.updatedAt,
    apiSynced: true,
  }
}

export function incidentToApiPayload(form) {
  if (!form.title?.trim()) throw new Error('Ingresa el título de la incidencia.')
  if (!form.branchId) throw new Error('Selecciona una sucursal.')
  return {
    title: form.title.trim(),
    description: form.description?.trim() || '',
    type: form.type || 'activo',
    priority: form.priority || 'media',
    branchId: form.branchId,
    activoId: form.type === 'activo' && form.activoId ? form.activoId : null,
    employeeId: form.type === 'personal' && form.employeeId ? form.employeeId : null,
    employeeIncidentKind:
      form.type === 'personal' && form.employeeIncidentKind
        ? form.employeeIncidentKind
        : null,
    participantIds: (form.intervenientes || []).map((participant) => participant.id),
  }
}

export function mapIncidentStatsFromApi(stats) {
  return {
    total: Number(stats.total) || 0,
    abiertas: Number(stats.abiertas) || 0,
    enProceso: Number(stats.enProceso) || 0,
    criticas: Number(stats.criticas) || 0,
  }
}
