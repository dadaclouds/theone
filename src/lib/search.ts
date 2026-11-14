import { SYSTEMS } from './constants';

/**
 * Interprets free text typed into a patient search box:
 *  - digits only → MRN identifier
 *  - a date (YYYY-MM-DD or MM/DD/YYYY) → birthdate
 *  - otherwise → name
 */
export function buildPatientQuery(text: string): Record<string, string> {
  const q = text.trim();
  if (/^\d{4,}$/.test(q)) {
    return { identifier: `${SYSTEMS.MRN}|${q}` };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(q)) {
    return { birthdate: q };
  }
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(q);
  if (us) {
    return { birthdate: `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}` };
  }
  return { name: q };
}

/** Converts a record (with repeatable keys as arrays) into Medplum's string[][] query form. */
export function toQuery(params: Record<string, string | string[] | undefined>): string[][] {
  const out: string[][] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    for (const item of Array.isArray(v) ? v : [v]) {
      out.push([k, item]);
    }
  }
  return out;
}
