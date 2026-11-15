import type { Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import { NS } from './constants';

/**
 * ILLUSTRATIVE screening instrument for the demo. It is NOT a South Dakota or validated
 * instrument: replace it with the assessments DHS actually uses (some are licensed).
 * Because it is a FHIR Questionnaire, DHS can change items and scoring without code changes.
 */
export const SCREENING_URL = `${NS}/Questionnaire/functional-needs-screening-demo`;

const LEVELS = [
  { code: '0', display: 'Independent' },
  { code: '1', display: 'Needs prompting or occasional help' },
  { code: '2', display: 'Needs regular hands-on help' },
  { code: '3', display: 'Needs full support' },
];

export const SCREENING_DOMAINS = [
  { linkId: 'self-care', text: 'Self-care (bathing, dressing, eating)' },
  { linkId: 'communication', text: 'Communication' },
  { linkId: 'mobility', text: 'Mobility' },
  { linkId: 'behavior', text: 'Behavior support needs' },
  { linkId: 'health', text: 'Health and medical support' },
  { linkId: 'community', text: 'Community living (money, transportation, safety)' },
];

export const SCREENING_QUESTIONNAIRE: Questionnaire = {
  resourceType: 'Questionnaire',
  url: SCREENING_URL,
  version: '0.1-demo',
  name: 'FunctionalNeedsScreeningDemo',
  title: 'Functional Needs Screening (illustrative demo instrument)',
  status: 'active',
  subjectType: ['Patient'],
  description: 'Illustrative screening used to demonstrate configurable assessments and scoring. Not a validated or South Dakota instrument.',
  item: [
    {
      linkId: 'domains',
      type: 'group',
      text: 'Rate the support the person needs in each area',
      item: SCREENING_DOMAINS.map((d) => ({
        linkId: d.linkId,
        text: d.text,
        type: 'choice' as const,
        required: true,
        answerOption: LEVELS.map((l) => ({ valueCoding: { system: `${SCREENING_URL}/levels`, code: l.code, display: l.display } })),
      })),
    },
    { linkId: 'diagnosis-confirmed', text: 'Qualifying developmental disability diagnosis documented?', type: 'boolean', required: true },
    { linkId: 'notes', text: 'Assessor notes', type: 'text' },
  ],
};

export interface ScreeningResult {
  readonly total: number;
  readonly maxTotal: number;
  readonly answered: number;
  readonly diagnosisConfirmed: boolean;
  readonly tier: LevelOfCare;
}

export type LevelOfCare = 'Not eligible' | 'Tier 1 - Limited support' | 'Tier 2 - Moderate support' | 'Tier 3 - Extensive support';

/** Illustrative thresholds for the demo instrument (DHS would configure real cut-offs). */
export function levelOfCare(total: number, diagnosisConfirmed: boolean): LevelOfCare {
  if (!diagnosisConfirmed || total < 4) return 'Not eligible';
  if (total <= 8) return 'Tier 1 - Limited support';
  if (total <= 13) return 'Tier 2 - Moderate support';
  return 'Tier 3 - Extensive support';
}

function flatten(items: QuestionnaireResponse['item'] = []): NonNullable<QuestionnaireResponse['item']> {
  return items.flatMap((i) => [i, ...flatten(i.item)]);
}

export function scoreScreening(response: QuestionnaireResponse): ScreeningResult {
  const items = flatten(response.item);
  const domainIds = new Set(SCREENING_DOMAINS.map((d) => d.linkId));
  let total = 0;
  let answered = 0;
  for (const item of items) {
    if (!domainIds.has(item.linkId)) continue;
    const code = item.answer?.[0]?.valueCoding?.code;
    if (code !== undefined) {
      total += Number(code);
      answered++;
    }
  }
  const diagnosisConfirmed = items.find((i) => i.linkId === 'diagnosis-confirmed')?.answer?.[0]?.valueBoolean === true;
  return { total, maxTotal: SCREENING_DOMAINS.length * 3, answered, diagnosisConfirmed, tier: levelOfCare(total, diagnosisConfirmed) };
}
