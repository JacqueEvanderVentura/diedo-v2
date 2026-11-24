export function readResumeBookingParams(searchParams) {
  return {
    serviceId: searchParams.get('service') || '',
    employeeId: searchParams.get('employee') || '',
    date: searchParams.get('date') || '',
    time: searchParams.get('time') || '',
  }
}

export function mergeResumeBookingIntoForm(form, resume) {
  if (!resume?.serviceId && !resume?.employeeId && !resume?.date && !resume?.time) return form
  return {
    ...form,
    ...(resume.serviceId ? { serviceId: resume.serviceId } : {}),
    ...(resume.employeeId ? { employeeId: resume.employeeId } : {}),
    ...(resume.date ? { date: resume.date } : {}),
    ...(resume.time ? { time: resume.time } : {}),
  }
}