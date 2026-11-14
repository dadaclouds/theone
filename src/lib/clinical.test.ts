import type { AllergyIntolerance, Condition } from '@medplum/fhirtypes';
import { checkMedicationAllergies } from './allergy';
import { buildClaim } from './billing';
import { ALLERGENS, MEDICATIONS, PROBLEMS } from './catalog';
import { SYSTEMS } from './constants';
import { conceptFromCatalog, decodeBase64, encodeBase64, generateMrn } from './fhir';
import { buildResultObservations, flagFor } from './labs';
import { markdownToSoap, soapToMarkdown } from './notes';
import { buildPatientQuery, toQuery } from './search';
import { buildVitalObservations, calculateBmi, vitalsFlowsheet } from './vitals';

const patient = { reference: 'Patient/123', display: 'Test Patient' };
const item = <T extends { code: string }>(list: T[], code: string): T => list.find((i) => i.code === code) as T;

const allergy = (code: string, status = 'active', ver = 'confirmed'): AllergyIntolerance => ({
  resourceType: 'AllergyIntolerance',
  id: code,
  patient,
  code: conceptFromCatalog(item(ALLERGENS, code)),
  clinicalStatus: { coding: [{ code: status }] },
  verificationStatus: { coding: [{ code: ver }] },
});

describe('allergy screening', () => {
  test('penicillin allergy flags amoxicillin and augmentin', () => {
    const pcn = [allergy('91936005')];
    expect(checkMedicationAllergies(conceptFromCatalog(item(MEDICATIONS, '308136')), pcn)).toHaveLength(1);
    expect(checkMedicationAllergies(conceptFromCatalog(item(MEDICATIONS, '617296')), pcn)).toHaveLength(1);
  });
  test('sulfa allergy flags Bactrim but not lisinopril', () => {
    const sulfa = [allergy('91939003')];
    expect(checkMedicationAllergies(conceptFromCatalog(item(MEDICATIONS, '198335')), sulfa)).toHaveLength(1);
    expect(checkMedicationAllergies(conceptFromCatalog(item(MEDICATIONS, '314076')), sulfa)).toHaveLength(0);
  });
  test('NSAID class cross-reactivity and free text', () => {
    expect(checkMedicationAllergies({ text: 'Naproxen 500mg' }, [allergy('293619005')])).toHaveLength(1);
  });
  test('ignores inactive or refuted allergies', () => {
    const med = conceptFromCatalog(item(MEDICATIONS, '308136'));
    expect(checkMedicationAllergies(med, [allergy('91936005', 'inactive')])).toHaveLength(0);
    expect(checkMedicationAllergies(med, [allergy('91936005', 'active', 'refuted')])).toHaveLength(0);
  });
});

describe('vitals', () => {
  test('BMI from imperial units', () => {
    expect(calculateBmi(150, 66)).toBe(24.2);
    expect(calculateBmi(undefined, 66)).toBeUndefined();
  });
  test('BP recorded as a panel and round-trips through the flowsheet', () => {
    const obs = buildVitalObservations({ systolic: 150, diastolic: 95, heartRate: 70, weight: 200, height: 70 }, patient, { effective: '2026-01-01T10:00:00Z' });
    const bp = obs.find((o) => o.code.coding?.[0]?.code === '85354-9');
    expect(bp?.component).toHaveLength(2);
    expect(bp?.component?.[0]?.interpretation?.[0]?.coding?.[0]?.code).toBe('H');
    expect(obs.some((o) => o.code.coding?.[0]?.code === '39156-5')).toBe(true); // BMI auto-calculated
    const [row] = vitalsFlowsheet(obs);
    expect(row.values).toMatchObject({ systolic: 150, diastolic: 95, heartRate: 70, weight: 200, bmi: 28.7 });
  });
});

describe('notes', () => {
  test('SOAP markdown round trip', () => {
    const note = { subjective: 'Cough\nfor 3 days', objective: 'Lungs clear', assessment: 'URI', plan: 'Fluids' };
    expect(markdownToSoap(soapToMarkdown(note))).toEqual(note);
  });
  test('unicode-safe base64', () => {
    expect(decodeBase64(encodeBase64('Temp 38.5 °C — señor 患者'))).toBe('Temp 38.5 °C — señor 患者');
  });
});

describe('labs', () => {
  test('flags and skips blank results', () => {
    expect(flagFor(14.2, 4.5, 11)).toBe('H');
    expect(flagFor(3, 4.5, 11)).toBe('L');
    const obs = buildResultObservations(
      [
        { code: '6690-2', display: 'WBC', unit: '10*3/uL', low: 4.5, high: 11, value: '14.2' },
        { code: '718-7', display: 'Hgb', unit: 'g/dL', low: 12, high: 17.5, value: '' },
        { code: '94500-6', display: 'SARS-CoV-2', unit: '', value: 'Not detected' },
      ],
      patient,
      undefined,
      '2026-01-01T00:00:00Z'
    );
    expect(obs).toHaveLength(2);
    expect(obs[0].interpretation?.[0]?.coding?.[0]?.code).toBe('H');
    expect(obs[1].valueString).toBe('Not detected');
  });
});

describe('billing', () => {
  test('claim carries ICD-10 diagnoses and CPT fees', () => {
    const dx: Condition = { resourceType: 'Condition', id: 'c1', subject: patient, code: conceptFromCatalog(item(PROBLEMS, 'J02.9')) };
    const claim = buildClaim({
      patient,
      provider: { reference: 'Practitioner/1' },
      encounter: { reference: 'Encounter/1' },
      coverage: { reference: 'Coverage/1' },
      diagnoses: [dx],
      lines: [{ cpt: '99213', units: 1 }, { cpt: '87880', units: 1 }],
      serviceDate: '2026-01-01',
    });
    expect(claim.diagnosis?.[0]?.diagnosisCodeableConcept?.coding?.[0]).toMatchObject({ system: SYSTEMS.ICD10, code: 'J02.9' });
    expect(claim.total?.value).toBe(123);
    expect(claim.insurance[0].focal).toBe(true);
  });
});

describe('search helpers', () => {
  test('patient query interpretation', () => {
    expect(buildPatientQuery('10000001')).toEqual({ identifier: `${SYSTEMS.MRN}|10000001` });
    expect(buildPatientQuery('3/12/1964')).toEqual({ birthdate: '1964-03-12' });
    expect(buildPatientQuery('Hernandez')).toEqual({ name: 'Hernandez' });
  });
  test('repeatable params', () => {
    expect(toQuery({ date: ['ge1', 'lt2'], x: undefined, y: 'z' })).toEqual([['date', 'ge1'], ['date', 'lt2'], ['y', 'z']]);
  });
  test('MRN is 8 digits', () => {
    expect(generateMrn(() => 0)).toBe('10000000');
    expect(generateMrn(() => 0.999999999)).toMatch(/^\d{8}$/);
  });
});
