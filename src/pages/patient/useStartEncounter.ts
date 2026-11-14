import type { Appointment, Practitioner, Reference } from '@medplum/fhirtypes';
import { useMedplum, useMedplumProfile } from '@medplum/react';
import { useNavigate } from 'react-router';
import { notifyError } from '../../components/notify';
import { createEncounter } from '../../lib/encounters';
import { profileDisplay } from '../../lib/fhir';
import { useChart } from './PatientContext';

export const VISIT_TYPES = ['Office visit', 'Follow-up', 'Annual physical', 'Sick visit', 'Telehealth', 'Procedure'];

export function useStartEncounter(): (options?: { appointment?: Appointment; type?: string }) => Promise<void> {
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const navigate = useNavigate();
  const { patient, patientRef } = useChart();

  return async (options = {}) => {
    try {
      const practitioner =
        profile?.resourceType === 'Practitioner'
          ? ({ reference: `Practitioner/${profile.id}`, display: profileDisplay(profile) } as Reference<Practitioner>)
          : undefined;
      const encounter = await createEncounter(medplum, { patient: patientRef, practitioner, ...options });
      navigate(`/patients/${patient.id}/encounters/${encounter.id}`);
    } catch (err) {
      notifyError(err);
    }
  };
}
