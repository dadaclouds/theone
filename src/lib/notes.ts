import type { DocumentReference, Encounter, Patient, Practitioner, Reference } from '@medplum/fhirtypes';
import { NOTE_LOINC, SYSTEMS } from './constants';
import { decodeBase64, encodeBase64 } from './fhir';

export interface SoapNote {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
}

export const EMPTY_NOTE: SoapNote = { subjective: '', objective: '', assessment: '', plan: '' };

export const SOAP_SECTIONS: { key: keyof SoapNote; title: string; placeholder: string }[] = [
  { key: 'subjective', title: 'Subjective', placeholder: 'Chief complaint, HPI, ROS, pertinent history…' },
  { key: 'objective', title: 'Objective', placeholder: 'Exam findings, vitals, data reviewed…' },
  { key: 'assessment', title: 'Assessment', placeholder: 'Clinical impression and differential…' },
  { key: 'plan', title: 'Plan', placeholder: 'Orders, medications, education, follow-up…' },
];

export interface NoteTemplate {
  readonly name: string;
  readonly note: SoapNote;
}

export const NOTE_TEMPLATES: NoteTemplate[] = [
  {
    name: 'Acute visit',
    note: {
      subjective: 'CC: \nHPI: Onset , duration , severity /10. Associated symptoms: . Relieving/aggravating factors: .\nROS: Negative except as noted in HPI.',
      objective: 'General: Alert, no acute distress.\nHEENT: \nLungs: Clear to auscultation bilaterally.\nCV: Regular rate and rhythm, no murmurs.\nAbdomen: Soft, non-tender.',
      assessment: '',
      plan: 'Supportive care discussed. Return precautions given. Follow up if not improving in 1 week.',
    },
  },
  {
    name: 'Chronic disease follow-up',
    note: {
      subjective: 'Here for follow-up of chronic conditions. Medication adherence: . Side effects: none reported.\nInterval history: ',
      objective: 'General: Well appearing.\nCV: RRR, no edema.\nLungs: CTAB.',
      assessment: '',
      plan: 'Continue current medications. Labs ordered as below. Follow up in 3 months.',
    },
  },
  {
    name: 'Annual physical',
    note: {
      subjective: 'Presents for annual preventive exam. Diet: . Exercise: . Tobacco/alcohol: .\nROS: Comprehensive ROS negative.',
      objective: 'General: Well appearing.\nHEENT: Normal.\nNeck: No lymphadenopathy, thyroid normal.\nLungs: CTAB.\nCV: RRR.\nAbdomen: Soft, NT/ND.\nSkin: No concerning lesions.',
      assessment: 'Adult wellness exam.',
      plan: 'Age-appropriate screening reviewed. Immunizations updated. Labs: lipid panel, A1c. Return in 1 year.',
    },
  },
];

/** Serializes a SOAP note to Markdown, which is human readable in any FHIR viewer. */
export function soapToMarkdown(note: SoapNote): string {
  return SOAP_SECTIONS.map((s) => `## ${s.title}\n\n${note[s.key].trim()}\n`).join('\n');
}

/** Parses Markdown produced by `soapToMarkdown`. Unknown content is preserved in Subjective. */
export function markdownToSoap(markdown: string): SoapNote {
  const note: SoapNote = { ...EMPTY_NOTE };
  const regex = /^## (Subjective|Objective|Assessment|Plan)\s*$/gim;
  const matches = [...markdown.matchAll(regex)];
  if (matches.length === 0) {
    note.subjective = markdown.trim();
    return note;
  }
  matches.forEach((m, i) => {
    const key = m[1].toLowerCase() as keyof SoapNote;
    const start = (m.index ?? 0) + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : markdown.length;
    note[key] = markdown.slice(start, end).trim();
  });
  return note;
}

export function readNoteText(doc: DocumentReference | undefined): string {
  const data = doc?.content?.[0]?.attachment?.data;
  return data ? decodeBase64(data) : '';
}

export function buildNoteDocument(params: {
  patient: Reference<Patient>;
  encounter?: Reference<Encounter>;
  author?: Reference<Practitioner>;
  note: SoapNote;
  title?: string;
  existing?: DocumentReference;
}): DocumentReference {
  const markdown = soapToMarkdown(params.note);
  return {
    ...(params.existing ?? {}),
    resourceType: 'DocumentReference',
    status: 'current',
    docStatus: params.existing?.docStatus ?? 'preliminary',
    type: { coding: [{ system: SYSTEMS.LOINC, ...NOTE_LOINC }], text: NOTE_LOINC.display },
    category: [{ coding: [{ system: SYSTEMS.DOC_CATEGORY, code: 'clinical-note', display: 'Clinical Note' }] }],
    subject: params.patient,
    author: params.author ? [params.author] : params.existing?.author,
    date: new Date().toISOString(),
    description: params.title ?? params.existing?.description ?? 'Progress note',
    context: params.encounter ? { encounter: [params.encounter] } : params.existing?.context,
    content: [
      {
        attachment: {
          contentType: 'text/markdown',
          data: encodeBase64(markdown),
          title: 'note.md',
          creation: new Date().toISOString(),
        },
      },
    ],
  };
}

export function isNoteEmpty(note: SoapNote): boolean {
  return SOAP_SECTIONS.every((s) => !note[s.key].trim());
}
