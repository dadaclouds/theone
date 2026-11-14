import { calculateAgeString, formatHumanName, getReferenceString } from '@medplum/core';
import type {
  CodeableConcept,
  Coding,
  HumanName,
  Patient,
  Practitioner,
  Reference,
  Resource,
} from '@medplum/fhirtypes';
import type { CatalogItem } from './catalog';
import { SYSTEMS } from './constants';

export type ProfileLike = Practitioner | Patient | Resource;

/** Builds a CodeableConcept from a catalog item, including any secondary coding. */
export function conceptFromCatalog(item: CatalogItem): CodeableConcept {
  const coding: Coding[] = [{ system: item.system, code: item.code, display: item.display }];
  if (item.alt) {
    coding.push({ system: item.alt.system, code: item.alt.code, display: item.display });
  }
  return { coding, text: item.display };
}

/** Builds a free-text CodeableConcept (used when the clinician types something not in the catalog). */
export function conceptFromText(text: string): CodeableConcept {
  return { text: text.trim() };
}

/** Human readable label for a CodeableConcept. */
export function conceptText(concept: CodeableConcept | undefined): string {
  if (!concept) {
    return '';
  }
  return concept.text ?? concept.coding?.find((c) => c.display)?.display ?? concept.coding?.[0]?.code ?? '';
}

/** Returns the first code from the given system, if present. */
export function codeFrom(concept: CodeableConcept | undefined, system: string): string | undefined {
  return concept?.coding?.find((c) => c.system === system)?.code;
}

export function simpleCoding(system: string, code: string, display?: string): CodeableConcept {
  return { coding: [{ system, code, display }], text: display };
}

export function patientName(patient: Patient | undefined): string {
  const name = patient?.name?.[0];
  return name ? formatHumanName(name as HumanName) : 'Unknown patient';
}

export function patientMrn(patient: Patient | undefined): string | undefined {
  return patient?.identifier?.find((i) => i.system === SYSTEMS.MRN)?.value;
}

export function patientAge(patient: Patient | undefined): string {
  return patient?.birthDate ? (calculateAgeString(patient.birthDate) ?? '') : '';
}

/** Short demographic summary e.g. "45Y · F · MRN 1234". */
export function patientSummaryLine(patient: Patient | undefined): string {
  const parts: string[] = [];
  const age = patientAge(patient);
  if (age) {
    parts.push(age.replace(/^0+/, ''));
  }
  if (patient?.gender) {
    parts.push(patient.gender.charAt(0).toUpperCase());
  }
  if (patient?.birthDate) {
    parts.push(`DOB ${formatDate(patient.birthDate)}`);
  }
  const mrn = patientMrn(patient);
  if (mrn) {
    parts.push(`MRN ${mrn}`);
  }
  return parts.join(' · ');
}

/** Generates a random 8 digit MRN. Collisions are checked by the caller. */
export function generateMrn(random: () => number = Math.random): string {
  return String(Math.floor(10_000_000 + random() * 90_000_000));
}

export function refTo<T extends Resource>(resource: T | undefined, display?: string): Reference<T> | undefined {
  if (!resource) {
    return undefined;
  }
  return { reference: getReferenceString(resource as T & { id: string }), display } as Reference<T>;
}

export function profileDisplay(profile: ProfileLike | undefined): string | undefined {
  if (profile && (profile.resourceType === 'Practitioner' || profile.resourceType === 'Patient')) {
    const n = profile.name?.[0];
    return n ? formatHumanName(n as HumanName) : undefined;
  }
  return undefined;
}

/** Formats an ISO date or dateTime for display in the user's locale. Date-only strings are not shifted by timezone. */
export function formatDate(value: string | undefined): string {
  if (!value) {
    return '';
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number) as [number, number, number];
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(value: string | undefined): string {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatTime(value: string | undefined): string {
  if (!value) {
    return '';
  }
  return new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** Local YYYY-MM-DD for a Date (not UTC). */
export function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Value for an <input type="datetime-local"> from an ISO string. */
export function toDateTimeLocalInput(iso: string | undefined): string {
  const d = iso ? new Date(iso) : new Date();
  return `${toLocalDateString(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** ISO string from an <input type="datetime-local"> value. */
export function fromDateTimeLocalInput(value: string): string {
  return new Date(value).toISOString();
}

/** Start and end (exclusive) of the local day containing `date`, as ISO strings. */
export function dayBounds(date: Date): [string, string] {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return [start.toISOString(), end.toISOString()];
}

/** UTF-8 safe base64 encode / decode (for inline note attachments). */
export function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

export function decodeBase64(data: string): string {
  const binary = atob(data);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Pulls a readable message out of anything thrown by MedplumClient. */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === 'object' && err && 'issue' in err) {
    const issues = (err as { issue?: { details?: { text?: string }; diagnostics?: string }[] }).issue;
    return issues?.map((i) => i.details?.text ?? i.diagnostics).join('; ') || 'Unknown error';
  }
  return String(err);
}
