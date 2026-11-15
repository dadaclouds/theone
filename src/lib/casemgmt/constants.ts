// Case-management constants for the FOCOS demo.
//
// IMPORTANT: identifier systems and local code systems below are placeholders owned by this
// application. Service codes are standard HCPCS codes commonly used for HCBS waiver services, but
// the codes, unit sizes and waiver names South Dakota actually uses must be confirmed with DHS.

/** Local namespace for identifiers and code systems owned by this application. */
export const NS = 'https://focos-case-management.local/fhir';

export const CM_SYSTEMS = {
  /** Placeholder system for South Dakota Medicaid IDs (confirm the official system URI with DHS). */
  MEDICAID_ID: `${NS}/sid/sd-medicaid-id`,
  FOCOS_AUTHORIZATION: `${NS}/sid/focos-authorization`,
  FOCOS_VISIT: `${NS}/sid/focos-visit`,
  AUTHORIZATION_NUMBER: `${NS}/sid/authorization-number`,
  GOAL_OBSERVATION: `${NS}/sid/goal-observation`,
  CASE_MGMT: `${NS}/CodeSystem/case-management`,
  HCPCS: 'urn:oid:2.16.840.1.113883.6.285',
  ACT_CODE: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
} as const;

export const EXT = {
  EVV_GPS: `${NS}/StructureDefinition/evv-gps`,
  EVV_NOTES: `${NS}/StructureDefinition/evv-notes`,
  EVV_UNITS: `${NS}/StructureDefinition/evv-units`,
  EVV_SIGNATURE: `${NS}/StructureDefinition/evv-participant-signature`,
} as const;

/** Local codes used to categorize case-management resources. */
export const CM_CODES = {
  ISP: 'isp',
  PLANNED_SERVICE: 'planned-service',
  AUTH_APPROVAL: 'authorization-approval',
  AUTH_CAP_ALERT: 'authorization-cap-alert',
  SCREENING_SCORE: 'functional-needs-score',
  LEVEL_OF_CARE: 'level-of-care',
} as const;

export const cmCoding = (code: string, display: string) => ({ system: CM_SYSTEMS.CASE_MGMT, code, display });

export interface WaiverProgram {
  readonly code: string;
  readonly display: string;
}

/** South Dakota I/DD waiver programs (confirm names and scope with DHS). */
export const WAIVERS: WaiverProgram[] = [
  { code: 'sd-choices', display: 'CHOICES Waiver' },
  { code: 'sd-fs360', display: 'Family Support 360 Waiver' },
];

export interface HcbsService {
  readonly code: string;
  readonly display: string;
  readonly unitMinutes: number;
}

/** HCPCS codes commonly billed for HCBS waiver services, in 15-minute units (confirm SD's codes). */
export const HCBS_SERVICES: HcbsService[] = [
  { code: 'T2021', display: 'Day habilitation', unitMinutes: 15 },
  { code: 'T2017', display: 'Residential habilitation', unitMinutes: 15 },
  { code: 'T2019', display: 'Supported employment', unitMinutes: 15 },
  { code: 'S5125', display: 'Attendant care', unitMinutes: 15 },
  { code: 'H2015', display: 'Community support', unitMinutes: 15 },
];

/** Share of authorized units at which case managers are alerted (RFI: warn ahead of caps). */
export const UNIT_ALERT_THRESHOLD = 0.8;
