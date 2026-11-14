import type { Appointment, Patient, Practitioner, Reference } from '@medplum/fhirtypes';

export function appointmentPatient(a: Appointment): Reference<Patient> | undefined {
  return a.participant.find((p) => p.actor?.reference?.startsWith('Patient/'))?.actor as Reference<Patient> | undefined;
}

export function appointmentPractitioner(a: Appointment): Reference<Practitioner> | undefined {
  return a.participant.find((p) => p.actor?.reference?.startsWith('Practitioner/'))?.actor as Reference<Practitioner> | undefined;
}

/** Valid next statuses for the front-desk workflow. */
export function nextStatuses(status: Appointment['status']): Appointment['status'][] {
  switch (status) {
    case 'proposed':
    case 'pending':
      return ['booked', 'cancelled'];
    case 'booked':
      return ['arrived', 'noshow', 'cancelled'];
    case 'arrived':
    case 'checked-in':
      return ['fulfilled', 'cancelled'];
    default:
      return [];
  }
}
