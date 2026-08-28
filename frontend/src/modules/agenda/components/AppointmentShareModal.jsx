import { Modal } from '@/components/ui/Modal'
import { AppointmentShareCard } from './AppointmentShareCard'
import { AppointmentShareActions } from './AppointmentShareActions'

export function AppointmentShareModal({ open, onClose, appointment }) {
  return (
    <Modal open={open} onClose={onClose} title="Compartir cita" testId="appointment-share-modal">
      <div className="flex flex-col items-center gap-4">
        <AppointmentShareCard appointment={appointment} />
        <AppointmentShareActions appointment={appointment} />
      </div>
    </Modal>
  )
}
