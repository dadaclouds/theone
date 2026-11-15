// Pure mappings between FHIR case-management resources and FOCOS Connect records.
import type { Encounter, Goal, Observation, Patient, Reference, ServiceRequest } from '@medplum/fhirtypes';
import { CM_SYSTEMS, EXT, HCBS_SERVICES } from './constants';
import type { FocosAuthorizationInput, FocosGoal, FocosVisit } from './focos';

export function medicaidId(patient: Patient | undefined): string | undefined {
  return patient?.identifier?.find((i) => i.system === CM_SYSTEMS.MEDICAID_ID)?.value;
}

export function identifierValue(r: { identifier?: { system?: string; value?: string }[] } | undefined, system: string): string | undefined {
  return r?.identifier?.find((i) => i.system === system)?.value;
}

export function serviceCode(sr: ServiceRequest): string | undefined {
  return sr.code?.coding?.find((c) => c.system === CM_SYSTEMS.HCPCS)?.code;
}

/** Goal measure as shown to direct support staff, e.g. "% of steps completed independently". */
export function goalToFocos(goal: Goal): FocosGoal {
  const target = goal.target?.[0];
  return {
    id: goal.id as string,
    description: goal.description.text ?? '',
    measure: target?.measure?.text ?? 'Progress toward goal',
    unit: target?.detailQuantity?.unit,
  };
}

/** Builds the FOCOS authorization payload for an approved authorization (ServiceRequest). */
export function authorizationToFocos(sr: ServiceRequest, patient: Patient, goals: Goal[]): FocosAuthorizationInput {
  const mid = medicaidId(patient);
  const number = identifierValue(sr, CM_SYSTEMS.AUTHORIZATION_NUMBER);
  const code = serviceCode(sr);
  const units = sr.quantityQuantity?.value;
  const start = sr.occurrencePeriod?.start;
  const end = sr.occurrencePeriod?.end;
  const missing = [!mid && 'Medicaid ID', !number && 'authorization number', !code && 'service code', units === undefined && 'units', !start && 'start date', !end && 'end date'].filter(Boolean);
  if (missing.length) {
    throw new Error(`Cannot send authorization to FOCOS: missing ${missing.join(', ')}`);
  }
  return {
    externalRef: `ServiceRequest/${sr.id}`,
    authorizationNumber: number as string,
    participant: { medicaidId: mid as string, firstName: patient.name?.[0]?.given?.join(' ') ?? '', lastName: patient.name?.[0]?.family ?? '' },
    serviceCode: code as string,
    serviceDescription: HCBS_SERVICES.find((s) => s.code === code)?.display ?? sr.code?.text ?? (code as string),
    authorizedUnits: units as number,
    startDate: (start as string).slice(0, 10),
    endDate: (end as string).slice(0, 10),
    provider: sr.performer?.[0]?.display ? { name: sr.performer[0].display } : undefined,
    goals: goals.map(goalToFocos),
    status: sr.status === 'active' ? 'Active' : 'Inactive',
  };
}

/** Maps an EVV-verified FOCOS visit to a FHIR Encounter linked to the authorization. */
export function visitToEncounter(visit: FocosVisit, patient: Reference<Patient>, authorization: ServiceRequest): Encounter {
  return {
    resourceType: 'Encounter',
    identifier: [{ system: CM_SYSTEMS.FOCOS_VISIT, value: visit.id }],
    status: 'finished',
    class: { system: CM_SYSTEMS.ACT_CODE, code: 'HH', display: 'home health' },
    type: [{ coding: authorization.code?.coding, text: authorization.code?.text ?? visit.serviceCode }],
    subject: patient,
    basedOn: [{ reference: `ServiceRequest/${authorization.id}` }],
    participant: [{ individual: { display: visit.renderingProvider } }],
    period: { start: visit.actualStart, end: visit.actualEnd },
    length: { value: visit.minutes, unit: 'min', system: 'http://unitsofmeasure.org', code: 'min' },
    extension: [
      { url: EXT.EVV_UNITS, valueInteger: visit.units },
      { url: EXT.EVV_SIGNATURE, valueBoolean: visit.participantSignature },
      ...(visit.gps ? [{ url: EXT.EVV_GPS, valueString: `${visit.gps.lat},${visit.gps.lng}` }] : []),
      ...(visit.notes ? [{ url: EXT.EVV_NOTES, valueString: visit.notes }] : []),
    ],
  };
}

/** Maps goal data collected during a visit to goal-linked Observations. */
export function visitGoalObservations(visit: FocosVisit, patient: Reference<Patient>, encounterId: string, goals: Goal[]): Observation[] {
  return visit.goalData.flatMap((d) => {
    const goal = goals.find((g) => g.id === d.goalId);
    if (!goal || typeof d.value !== 'number' || Number.isNaN(d.value)) return [];
    const target = goal.target?.[0];
    return [{
      resourceType: 'Observation' as const,
      identifier: [{ system: CM_SYSTEMS.GOAL_OBSERVATION, value: `${visit.id}:${goal.id}` }],
      status: 'final' as const,
      category: [{ text: 'Goal progress' }],
      code: { text: target?.measure?.text ?? goal.description.text ?? 'Goal progress' },
      subject: patient,
      encounter: { reference: `Encounter/${encounterId}` },
      focus: [{ reference: `Goal/${goal.id}`, display: goal.description.text }],
      effectiveDateTime: visit.actualEnd,
      performer: [{ display: visit.renderingProvider }],
      valueQuantity: { value: d.value, unit: target?.detailQuantity?.unit },
    }];
  });
}

export function unitUsage(authorizedUnits: number, usedUnits: number): { ratio: number; remaining: number } {
  if (authorizedUnits <= 0) return { ratio: 0, remaining: 0 };
  return { ratio: usedUnits / authorizedUnits, remaining: authorizedUnits - usedUnits };
}

/** Next authorization number, e.g. SD-2026-00042 (demo format; DHS defines the real one). */
export function formatAuthorizationNumber(year: number, sequence: number): string {
  return `SD-${year}-${String(sequence).padStart(5, '0')}`;
}
