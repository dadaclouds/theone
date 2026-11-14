import type { AllergyIntolerance, Condition, Coverage, MedicationRequest, Patient, Reference } from '@medplum/fhirtypes';
import { createContext, useContext } from 'react';

export interface ChartData {
  readonly patient: Patient & { id: string };
  readonly patientRef: Reference<Patient>;
  readonly allergies: AllergyIntolerance[];
  readonly problems: Condition[];
  readonly medications: MedicationRequest[];
  readonly coverage?: Coverage;
  /** Re-fetches the chart header data (allergies, problems, meds, coverage). */
  readonly refresh: () => void;
}

export const ChartContext = createContext<ChartData | undefined>(undefined);

export function useChart(): ChartData {
  const ctx = useContext(ChartContext);
  if (!ctx) {
    throw new Error('useChart must be used inside a patient chart');
  }
  return ctx;
}
