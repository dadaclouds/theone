import type { Claim, Condition, Coverage, Encounter, Patient, Practitioner, Reference } from '@medplum/fhirtypes';
import { CPT_CODES } from './catalog';
import { SYSTEMS } from './constants';
import { codeFrom, conceptText } from './fhir';

export interface ChargeLine {
  readonly cpt: string;
  readonly units: number;
}

export function feeFor(cpt: string): number {
  return CPT_CODES.find((c) => c.code === cpt)?.fee ?? 0;
}

export function claimTotal(claim: Claim): number {
  return (claim.item ?? []).reduce((sum, i) => sum + (i.net?.value ?? 0), 0);
}

/** Builds a professional Claim (superbill) for an encounter. */
export function buildClaim(params: {
  patient: Reference<Patient>;
  provider: Reference<Practitioner>;
  encounter: Reference<Encounter> & { id?: string };
  coverage: Reference<Coverage>;
  diagnoses: Condition[];
  lines: ChargeLine[];
  serviceDate: string;
}): Claim {
  const diagnosis = params.diagnoses.map((c, i) => ({
    sequence: i + 1,
    diagnosisCodeableConcept: c.code?.coding?.some((cc) => cc.system === SYSTEMS.ICD10)
      ? {
          coding: [{ system: SYSTEMS.ICD10, code: codeFrom(c.code, SYSTEMS.ICD10), display: conceptText(c.code) }],
          text: conceptText(c.code),
        }
      : { text: conceptText(c.code) },
  }));
  const items = params.lines.map((line, i) => {
    const unitPrice = feeFor(line.cpt);
    const def = CPT_CODES.find((c) => c.code === line.cpt);
    return {
      sequence: i + 1,
      diagnosisSequence: diagnosis.length ? diagnosis.map((d) => d.sequence).slice(0, 4) : undefined,
      productOrService: { coding: [{ system: SYSTEMS.CPT, code: line.cpt, display: def?.display }], text: def?.display },
      servicedDate: params.serviceDate,
      quantity: { value: line.units },
      unitPrice: { value: unitPrice, currency: 'USD' as const },
      net: { value: unitPrice * line.units, currency: 'USD' as const },
      encounter: [params.encounter],
    };
  });
  return {
    resourceType: 'Claim',
    status: 'draft',
    type: { coding: [{ system: SYSTEMS.CLAIM_TYPE, code: 'professional', display: 'Professional' }] },
    use: 'claim',
    patient: params.patient,
    created: new Date().toISOString(),
    provider: params.provider,
    priority: { coding: [{ system: SYSTEMS.PROCESS_PRIORITY, code: 'normal' }] },
    insurance: [{ sequence: 1, focal: true, coverage: params.coverage }],
    diagnosis: diagnosis.length ? diagnosis : undefined,
    item: items,
    total: { value: items.reduce((s, i) => s + i.net.value, 0), currency: 'USD' as const },
  };
}

/** Builds a self-pay Coverage, used when a patient has no insurance on file. */
export function buildSelfPayCoverage(patient: Reference<Patient>): Coverage {
  return {
    resourceType: 'Coverage',
    status: 'active',
    type: { coding: [{ system: SYSTEMS.COVERAGE_TYPE, code: 'pay', display: 'pay' }], text: 'Self-pay' },
    beneficiary: patient,
    payor: [patient],
  };
}
