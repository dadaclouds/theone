import type { Goal, Patient, QuestionnaireResponse, ServiceRequest } from '@medplum/fhirtypes';
import { levelOfCare, scoreScreening, SCREENING_DOMAINS } from './assessment';
import { CM_SYSTEMS, EXT } from './constants';
import type { FocosVisit } from './focos';
import { authorizationToFocos, formatAuthorizationNumber, unitUsage, visitGoalObservations, visitToEncounter } from './mapping';

const patient: Patient = {
  resourceType: 'Patient', id: 'p1', name: [{ given: ['Alex'], family: 'Rivera' }],
  identifier: [{ system: CM_SYSTEMS.MEDICAID_ID, value: 'SD1234567' }],
};
const goal: Goal = {
  resourceType: 'Goal', id: 'g1', lifecycleStatus: 'active', subject: { reference: 'Patient/p1' },
  description: { text: 'Prepare a simple meal' },
  target: [{ measure: { text: '% of steps completed independently' }, detailQuantity: { value: 80, unit: '%' } }],
};
const sr: ServiceRequest = {
  resourceType: 'ServiceRequest', id: 'sr1', status: 'active', intent: 'order', subject: { reference: 'Patient/p1', display: 'Alex Rivera' },
  code: { coding: [{ system: CM_SYSTEMS.HCPCS, code: 'T2021', display: 'Day habilitation' }], text: 'Day habilitation' },
  quantityQuantity: { value: 480 }, occurrencePeriod: { start: '2026-11-01', end: '2027-10-31' },
  identifier: [{ system: CM_SYSTEMS.AUTHORIZATION_NUMBER, value: 'SD-2026-00042' }],
  performer: [{ display: 'Prairie Supports' }], supportingInfo: [{ reference: 'Goal/g1' }],
};

describe('screening', () => {
  const response = (codes: string[], dx: boolean): QuestionnaireResponse => ({
    resourceType: 'QuestionnaireResponse', status: 'completed',
    item: [
      { linkId: 'domains', item: SCREENING_DOMAINS.map((d, i) => ({ linkId: d.linkId, answer: [{ valueCoding: { code: codes[i] } }] })) },
      { linkId: 'diagnosis-confirmed', answer: [{ valueBoolean: dx }] },
    ],
  });
  test('scores nested group items', () => {
    const r = scoreScreening(response(['2', '1', '0', '3', '2', '2'], true));
    expect(r).toMatchObject({ total: 10, maxTotal: 18, answered: 6, diagnosisConfirmed: true, tier: 'Tier 2 - Moderate support' });
  });
  test('diagnosis required for eligibility', () => {
    expect(scoreScreening(response(['3', '3', '3', '3', '3', '3'], false)).tier).toBe('Not eligible');
  });
  test('tier boundaries', () => {
    expect([3, 4, 8, 9, 13, 14].map((t) => levelOfCare(t, true))).toEqual([
      'Not eligible', 'Tier 1 - Limited support', 'Tier 1 - Limited support', 'Tier 2 - Moderate support', 'Tier 2 - Moderate support', 'Tier 3 - Extensive support',
    ]);
  });
});

describe('FOCOS mapping', () => {
  test('authorization payload', () => {
    expect(authorizationToFocos(sr, patient, [goal])).toEqual({
      externalRef: 'ServiceRequest/sr1', authorizationNumber: 'SD-2026-00042',
      participant: { medicaidId: 'SD1234567', firstName: 'Alex', lastName: 'Rivera' },
      serviceCode: 'T2021', serviceDescription: 'Day habilitation', authorizedUnits: 480,
      startDate: '2026-11-01', endDate: '2027-10-31', provider: { name: 'Prairie Supports' },
      goals: [{ id: 'g1', description: 'Prepare a simple meal', measure: '% of steps completed independently', unit: '%' }],
      status: 'Active',
    });
  });
  test('refuses incomplete authorizations', () => {
    expect(() => authorizationToFocos({ ...sr, identifier: [] }, patient, [])).toThrow('authorization number');
    expect(() => authorizationToFocos(sr, { ...patient, identifier: [] }, [])).toThrow('Medicaid ID');
  });
  const visit: FocosVisit = {
    id: 'VISIT-1', authorizationId: 'AUTH-1', authorizationNumber: 'SD-2026-00042', externalRef: 'ServiceRequest/sr1',
    medicaidId: 'SD1234567', serviceCode: 'T2021', renderingProvider: 'Jordan Lee',
    actualStart: '2026-11-10T14:00:00Z', actualEnd: '2026-11-10T15:05:00Z', minutes: 65, units: 4,
    verificationMethod: 'EVV GPS', gps: { lat: 43.5, lng: -96.7 }, participantSignature: true, notes: 'Made a sandwich',
    goalData: [{ goalId: 'g1', value: 60 }, { goalId: 'unknown', value: 1 }], status: 'Completed', recordedAt: '2026-11-10T15:06:00Z',
  };
  test('visit becomes an Encounter based on the authorization', () => {
    const e = visitToEncounter(visit, { reference: 'Patient/p1' }, sr);
    expect(e.identifier).toEqual([{ system: CM_SYSTEMS.FOCOS_VISIT, value: 'VISIT-1' }]);
    expect(e.basedOn).toEqual([{ reference: 'ServiceRequest/sr1' }]);
    expect(e.length?.value).toBe(65);
    expect(e.extension).toEqual(expect.arrayContaining([{ url: EXT.EVV_UNITS, valueInteger: 4 }, { url: EXT.EVV_GPS, valueString: '43.5,-96.7' }]));
  });
  test('goal data becomes goal-linked observations; unknown goals skipped', () => {
    const obs = visitGoalObservations(visit, { reference: 'Patient/p1' }, 'enc1', [goal]);
    expect(obs).toHaveLength(1);
    expect(obs[0]).toMatchObject({ focus: [{ reference: 'Goal/g1' }], valueQuantity: { value: 60, unit: '%' }, identifier: [{ value: 'VISIT-1:g1' }] });
  });
  test('unit usage and authorization numbers', () => {
    expect(unitUsage(100, 85)).toEqual({ ratio: 0.85, remaining: 15 });
    expect(unitUsage(0, 5)).toEqual({ ratio: 0, remaining: 0 });
    expect(formatAuthorizationNumber(2026, 42)).toBe('SD-2026-00042');
  });
});
