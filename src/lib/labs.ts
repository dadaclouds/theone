import type { DiagnosticReport, Observation, Patient, Reference, ServiceRequest } from '@medplum/fhirtypes';
import { LAB_TESTS, type LabTestDefinition } from './catalog';
import { SYSTEMS } from './constants';
import { codeFrom } from './fhir';

export function findLabDefinition(request: ServiceRequest | DiagnosticReport | undefined): LabTestDefinition | undefined {
  const code = codeFrom(request?.code, SYSTEMS.LOINC);
  return LAB_TESTS.find((t) => t.code === code);
}

export type Flag = 'H' | 'L' | 'N' | 'A';

export function flagFor(value: number, low?: number, high?: number): Flag {
  if (low !== undefined && value < low) {
    return 'L';
  }
  if (high !== undefined && value > high) {
    return 'H';
  }
  return 'N';
}

export const FLAG_LABEL: Record<Flag, string> = { H: 'High', L: 'Low', N: 'Normal', A: 'Abnormal' };

export interface ResultEntry {
  readonly code: string;
  readonly display: string;
  readonly unit: string;
  readonly low?: number;
  readonly high?: number;
  /** Numeric value or free-text result (e.g. "Not detected"). */
  readonly value: string;
}

/** Builds result Observations for a lab panel. Blank entries are skipped. */
export function buildResultObservations(
  entries: ResultEntry[],
  subject: Reference<Patient>,
  basedOn: Reference<ServiceRequest> | undefined,
  effective: string
): Observation[] {
  return entries
    .filter((e) => e.value.trim() !== '')
    .map((e) => {
      const numeric = Number(e.value);
      const isNumeric = e.value.trim() !== '' && !Number.isNaN(numeric);
      const flag = isNumeric ? flagFor(numeric, e.low, e.high) : undefined;
      return {
        resourceType: 'Observation',
        status: 'final',
        category: [{ coding: [{ system: SYSTEMS.OBS_CATEGORY, code: 'laboratory', display: 'Laboratory' }] }],
        code: { coding: [{ system: SYSTEMS.LOINC, code: e.code, display: e.display }], text: e.display },
        subject,
        basedOn: basedOn ? [basedOn] : undefined,
        effectiveDateTime: effective,
        issued: new Date().toISOString(),
        ...(isNumeric
          ? { valueQuantity: { value: numeric, unit: e.unit, system: SYSTEMS.UCUM, code: e.unit || undefined } }
          : { valueString: e.value.trim() }),
        interpretation: flag
          ? [{ coding: [{ system: SYSTEMS.INTERPRETATION, code: flag, display: FLAG_LABEL[flag] }] }]
          : undefined,
        referenceRange:
          e.low !== undefined || e.high !== undefined
            ? [
                {
                  low: e.low !== undefined ? { value: e.low, unit: e.unit } : undefined,
                  high: e.high !== undefined ? { value: e.high, unit: e.unit } : undefined,
                },
              ]
            : undefined,
      } satisfies Observation;
    });
}

export function observationFlag(obs: Observation): Flag | undefined {
  const code = obs.interpretation?.[0]?.coding?.[0]?.code;
  return code === 'H' || code === 'L' || code === 'N' || code === 'A' ? code : undefined;
}

export function isAbnormal(obs: Observation): boolean {
  const f = observationFlag(obs);
  return f === 'H' || f === 'L' || f === 'A';
}
