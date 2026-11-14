import type { MedplumClient } from '@medplum/core';
import type { Appointment, Encounter, Patient, Practitioner, Reference } from '@medplum/fhirtypes';
import { SYSTEMS } from './constants';

/** Creates an in-progress ambulatory (or virtual) Encounter, optionally from an Appointment, and checks the appointment in. */
export async function createEncounter(
  medplum: MedplumClient,
  params: { patient: Reference<Patient>; practitioner?: Reference<Practitioner>; type?: string; appointment?: Appointment }
): Promise<Encounter> {
  const type = params.type ?? params.appointment?.appointmentType?.text ?? 'Office visit';
  const virtual = type === 'Telehealth' || type === 'Telephone encounter';
  const encounter = await medplum.createResource<Encounter>({
    resourceType: 'Encounter',
    status: 'in-progress',
    class: { system: SYSTEMS.ACT_CODE, code: virtual ? 'VR' : 'AMB', display: virtual ? 'virtual' : 'ambulatory' },
    type: [{ text: type }],
    subject: params.patient,
    participant: params.practitioner ? [{ individual: params.practitioner }] : undefined,
    period: { start: new Date().toISOString() },
    appointment: params.appointment ? [{ reference: `Appointment/${params.appointment.id}` }] : undefined,
    reasonCode: params.appointment?.description ? [{ text: params.appointment.description }] : undefined,
  });
  if (params.appointment && params.appointment.status === 'booked') {
    await medplum.updateResource<Appointment>({ ...params.appointment, status: 'arrived' });
  }
  return encounter;
}
