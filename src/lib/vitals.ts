import type { Observation, Patient, Reference, Encounter, Practitioner } from '@medplum/fhirtypes';
import { SYSTEMS } from './constants';

export interface VitalDefinition {
  readonly key: VitalKey;
  readonly label: string;
  readonly loinc: string;
  readonly display: string;
  readonly unit: string;
  readonly ucum: string;
  readonly normalLow?: number;
  readonly normalHigh?: number;
  readonly decimals: number;
}

export type VitalKey = 'systolic' | 'diastolic' | 'heartRate' | 'respRate' | 'temp' | 'spo2' | 'weight' | 'height' | 'bmi' | 'pain';

export const BP_PANEL = { code: '85354-9', display: 'Blood pressure panel with all children optional' };

export const VITALS: Record<VitalKey, VitalDefinition> = {
  systolic: { key: 'systolic', label: 'Systolic BP', loinc: '8480-6', display: 'Systolic blood pressure', unit: 'mmHg', ucum: 'mm[Hg]', normalLow: 90, normalHigh: 129, decimals: 0 },
  diastolic: { key: 'diastolic', label: 'Diastolic BP', loinc: '8462-4', display: 'Diastolic blood pressure', unit: 'mmHg', ucum: 'mm[Hg]', normalLow: 60, normalHigh: 79, decimals: 0 },
  heartRate: { key: 'heartRate', label: 'Heart rate', loinc: '8867-4', display: 'Heart rate', unit: 'bpm', ucum: '/min', normalLow: 60, normalHigh: 100, decimals: 0 },
  respRate: { key: 'respRate', label: 'Resp. rate', loinc: '9279-1', display: 'Respiratory rate', unit: 'br/min', ucum: '/min', normalLow: 12, normalHigh: 20, decimals: 0 },
  temp: { key: 'temp', label: 'Temperature', loinc: '8310-5', display: 'Body temperature', unit: '°F', ucum: '[degF]', normalLow: 97, normalHigh: 100.3, decimals: 1 },
  spo2: { key: 'spo2', label: 'SpO₂', loinc: '59408-5', display: 'Oxygen saturation in Arterial blood by Pulse oximetry', unit: '%', ucum: '%', normalLow: 95, normalHigh: 100, decimals: 0 },
  weight: { key: 'weight', label: 'Weight', loinc: '29463-7', display: 'Body weight', unit: 'lb', ucum: '[lb_av]', decimals: 1 },
  height: { key: 'height', label: 'Height', loinc: '8302-2', display: 'Body height', unit: 'in', ucum: '[in_i]', decimals: 1 },
  bmi: { key: 'bmi', label: 'BMI', loinc: '39156-5', display: 'Body mass index (BMI) [Ratio]', unit: 'kg/m²', ucum: 'kg/m2', normalLow: 18.5, normalHigh: 24.9, decimals: 1 },
  pain: { key: 'pain', label: 'Pain (0-10)', loinc: '72514-3', display: 'Pain severity - 0-10 verbal numeric rating [Score] - Reported', unit: '/10', ucum: '{score}', normalHigh: 3, decimals: 0 },
};

export type VitalValues = Partial<Record<VitalKey, number>>;

/** BMI from weight in pounds and height in inches. */
export function calculateBmi(weightLb: number | undefined, heightIn: number | undefined): number | undefined {
  if (!weightLb || !heightIn || weightLb <= 0 || heightIn <= 0) {
    return undefined;
  }
  return Math.round((703 * weightLb * 10) / (heightIn * heightIn)) / 10;
}

export function interpret(def: VitalDefinition, value: number): 'L' | 'H' | 'N' {
  if (def.normalLow !== undefined && value < def.normalLow) {
    return 'L';
  }
  if (def.normalHigh !== undefined && value > def.normalHigh) {
    return 'H';
  }
  return 'N';
}

const vitalCategory = [
  { coding: [{ system: SYSTEMS.OBS_CATEGORY, code: 'vital-signs', display: 'Vital Signs' }] },
];

const interpretationConcept = (flag: 'L' | 'H' | 'N') => [
  {
    coding: [
      {
        system: SYSTEMS.INTERPRETATION,
        code: flag,
        display: flag === 'H' ? 'High' : flag === 'L' ? 'Low' : 'Normal',
      },
    ],
  },
];

/**
 * Converts a set of entered vitals into FHIR Observations (US Core style).
 * Blood pressure is recorded as a single panel with systolic/diastolic components.
 */
export function buildVitalObservations(
  values: VitalValues,
  subject: Reference<Patient>,
  options: { encounter?: Reference<Encounter>; performer?: Reference<Practitioner>; effective?: string } = {}
): Observation[] {
  const effectiveDateTime = options.effective ?? new Date().toISOString();
  const base = {
    resourceType: 'Observation' as const,
    status: 'final' as const,
    category: vitalCategory,
    subject,
    encounter: options.encounter,
    performer: options.performer ? [options.performer] : undefined,
    effectiveDateTime,
  };
  const result: Observation[] = [];

  if (values.systolic !== undefined && values.diastolic !== undefined) {
    result.push({
      ...base,
      code: { coding: [{ system: SYSTEMS.LOINC, ...BP_PANEL }], text: 'Blood pressure' },
      component: (['systolic', 'diastolic'] as const).map((k) => ({
        code: { coding: [{ system: SYSTEMS.LOINC, code: VITALS[k].loinc, display: VITALS[k].display }] },
        valueQuantity: { value: values[k], unit: VITALS[k].unit, system: SYSTEMS.UCUM, code: VITALS[k].ucum },
        interpretation: interpretationConcept(interpret(VITALS[k], values[k] as number)),
      })),
    });
  }

  const withBmi: VitalValues = { ...values };
  if (withBmi.bmi === undefined) {
    withBmi.bmi = calculateBmi(values.weight, values.height);
  }

  for (const key of ['heartRate', 'respRate', 'temp', 'spo2', 'weight', 'height', 'bmi', 'pain'] as const) {
    const value = withBmi[key];
    if (value === undefined || Number.isNaN(value)) {
      continue;
    }
    const def = VITALS[key];
    result.push({
      ...base,
      code: { coding: [{ system: SYSTEMS.LOINC, code: def.loinc, display: def.display }], text: def.label },
      valueQuantity: { value, unit: def.unit, system: SYSTEMS.UCUM, code: def.ucum },
      interpretation:
        def.normalLow !== undefined || def.normalHigh !== undefined ? interpretationConcept(interpret(def, value)) : undefined,
    });
  }
  return result;
}

export interface VitalPoint {
  readonly date: string;
  readonly values: VitalValues;
}

/** Groups vital sign observations by effective time into rows suitable for a flowsheet / chart. */
export function vitalsFlowsheet(observations: Observation[]): VitalPoint[] {
  const byLoinc = new Map<string, VitalKey>(Object.values(VITALS).map((d) => [d.loinc, d.key]));
  const rows = new Map<string, VitalValues>();
  for (const obs of observations) {
    const date = obs.effectiveDateTime ?? obs.issued ?? obs.meta?.lastUpdated;
    if (!date) {
      continue;
    }
    const row = rows.get(date) ?? {};
    const code = obs.code.coding?.find((c) => c.system === SYSTEMS.LOINC)?.code;
    if (code === BP_PANEL.code) {
      for (const comp of obs.component ?? []) {
        const key = byLoinc.get(comp.code.coding?.[0]?.code ?? '');
        if (key && comp.valueQuantity?.value !== undefined) {
          row[key] = comp.valueQuantity.value;
        }
      }
    } else if (code) {
      const key = byLoinc.get(code);
      if (key && obs.valueQuantity?.value !== undefined) {
        row[key] = obs.valueQuantity.value;
      }
    }
    rows.set(date, row);
  }
  return [...rows.entries()]
    .map(([date, values]) => ({ date, values }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export const VITAL_LOINC_CODES = [BP_PANEL.code, ...Object.values(VITALS).map((v) => v.loinc)];
