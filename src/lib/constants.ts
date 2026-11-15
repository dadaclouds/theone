import { CM_CODES, CM_SYSTEMS } from './casemgmt/constants';

// Code systems and identifiers used throughout the EHR.
export const SYSTEMS = {
  LOINC: 'http://loinc.org',
  SNOMED: 'http://snomed.info/sct',
  ICD10: 'http://hl7.org/fhir/sid/icd-10-cm',
  RXNORM: 'http://www.nlm.nih.gov/research/umls/rxnorm',
  CVX: 'http://hl7.org/fhir/sid/cvx',
  CPT: 'http://www.ama-assn.org/go/cpt',
  UCUM: 'http://unitsofmeasure.org',
  OBS_CATEGORY: 'http://terminology.hl7.org/CodeSystem/observation-category',
  CONDITION_CATEGORY: 'http://terminology.hl7.org/CodeSystem/condition-category',
  CONDITION_CLINICAL: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
  CONDITION_VER: 'http://terminology.hl7.org/CodeSystem/condition-ver-status',
  ALLERGY_CLINICAL: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
  ALLERGY_VER: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification',
  ACT_CODE: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
  INTERPRETATION: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation',
  CLAIM_TYPE: 'http://terminology.hl7.org/CodeSystem/claim-type',
  PROCESS_PRIORITY: 'http://terminology.hl7.org/CodeSystem/processpriority',
  COVERAGE_TYPE: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
  SUBSCRIBER_REL: 'http://terminology.hl7.org/CodeSystem/subscriber-relationship',
  DOC_CATEGORY: 'http://hl7.org/fhir/us/core/CodeSystem/us-core-documentreference-category',
  PROVENANCE_PARTICIPANT: 'http://terminology.hl7.org/CodeSystem/provenance-participant-type',
  SIGNATURE_TYPE: 'urn:iso-astm:E1762-95:2013',
  /** Local identifier system for medical record numbers. */
  MRN: 'https://medplum-ehr.local/fhir/mrn',
  /** Local code system for EHR workflow task types. */
  TASK_TYPE: 'https://medplum-ehr.local/fhir/task-type',
  US_CORE_RACE: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-race',
};

export const TASK_CODES = {
  REVIEW_RESULT: 'review-result',
  REFILL_REQUEST: 'refill-request',
  FOLLOW_UP: 'follow-up',
  GENERAL: 'general',
} as const;

/** Task codes with their own queues (results inbox, Division approvals), excluded from the Tasks page. */
export const WORK_QUEUE_EXCLUDED = [
  `${SYSTEMS.TASK_TYPE}|${TASK_CODES.REVIEW_RESULT}`,
  `${CM_SYSTEMS.CASE_MGMT}|${CM_CODES.AUTH_APPROVAL}`,
];

export const NOTE_LOINC = { code: '11506-3', display: 'Progress note' };
export const ADDENDUM_LOINC = { code: '55107-7', display: 'Addendum Document' };
