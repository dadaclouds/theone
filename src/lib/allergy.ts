import type { AllergyIntolerance, CodeableConcept } from '@medplum/fhirtypes';
import { ALLERGENS, MEDICATIONS, NO_KNOWN_ALLERGY } from './catalog';
import { conceptText } from './fhir';

/** Drug-class cross-reactivity groups used for simple allergy screening. */
const CLASS_GROUPS: string[][] = [
  ['penicillin', 'amoxicillin', 'ampicillin', 'augmentin', 'clavulanate', 'piperacillin', 'dicloxacillin'],
  ['cephalosporin', 'cefdinir', 'cephalexin', 'ceftriaxone', 'cefuroxime', 'keflex'],
  ['sulfonamide', 'sulfa', 'sulfamethoxazole', 'bactrim'],
  ['nsaid', 'ibuprofen', 'naproxen', 'aspirin', 'ketorolac', 'meloxicam', 'diclofenac'],
  ['macrolide', 'erythromycin', 'azithromycin', 'clarithromycin'],
  ['opioid', 'codeine', 'morphine', 'oxycodone', 'hydrocodone', 'tramadol'],
  ['fluoroquinolone', 'ciprofloxacin', 'levofloxacin', 'moxifloxacin'],
];

function termsFor(text: string): Set<string> {
  const lower = text.toLowerCase();
  const terms = new Set<string>(lower.split(/[^a-z0-9]+/).filter((t) => t.length > 3));
  // Expand with catalog keywords so "Penicillin" also matches "pcn"/"amoxicillin" etc.
  for (const item of [...ALLERGENS, ...MEDICATIONS]) {
    if (lower.includes(item.display.toLowerCase().split(' ')[0])) {
      (item.keywords ?? '').split(/\s+/).filter((k) => k.length > 3).forEach((k) => terms.add(k));
    }
  }
  for (const group of CLASS_GROUPS) {
    if (group.some((g) => lower.includes(g))) {
      group.forEach((g) => terms.add(g));
    }
  }
  return terms;
}

export interface AllergyAlert {
  readonly allergy: AllergyIntolerance;
  readonly reason: string;
}

/**
 * Screens a medication against the patient's active allergies using name and drug-class matching.
 * This is a safety net, not a substitute for a commercial drug-allergy interaction database.
 */
export function checkMedicationAllergies(medication: CodeableConcept, allergies: AllergyIntolerance[]): AllergyAlert[] {
  const medText = conceptText(medication);
  if (!medText) {
    return [];
  }
  const medTerms = termsFor(medText);
  const alerts: AllergyAlert[] = [];
  for (const allergy of allergies) {
    if (!isActiveAllergy(allergy) || isNoKnownAllergy(allergy)) {
      continue;
    }
    const allergenText = conceptText(allergy.code);
    const allergenTerms = termsFor(allergenText);
    const overlap = [...allergenTerms].find((t) => medTerms.has(t));
    if (overlap) {
      alerts.push({ allergy, reason: `${medText} may cross-react with documented allergy to ${allergenText} (${overlap}).` });
    }
  }
  return alerts;
}

export function isActiveAllergy(allergy: AllergyIntolerance): boolean {
  const status = allergy.clinicalStatus?.coding?.[0]?.code;
  const ver = allergy.verificationStatus?.coding?.[0]?.code;
  return (status === undefined || status === 'active') && ver !== 'entered-in-error' && ver !== 'refuted';
}

export function isNoKnownAllergy(allergy: AllergyIntolerance): boolean {
  return !!allergy.code?.coding?.some((c) => c.code === NO_KNOWN_ALLERGY.code);
}
