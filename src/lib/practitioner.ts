import { formatHumanName } from '@medplum/core';
import type { HumanName, Practitioner } from '@medplum/fhirtypes';

export const NPI_SYSTEM = 'http://hl7.org/fhir/sid/us-npi';

export interface ProfileFormValues {
  prefix: string;
  given: string;
  family: string;
  /** Credentials shown after the name, e.g. "MD" or "RN, BSN". */
  suffix: string;
  phone: string;
  /** Contact email shown on the profile (not the sign-in email). */
  email: string;
  npi: string;
}

const split = (s: string): string[] | undefined => {
  const parts = s.split(/[\s,]+/).map((p) => p.trim()).filter(Boolean);
  return parts.length ? parts : undefined;
};

export function practitionerToForm(p: Practitioner | undefined): ProfileFormValues {
  const name = p?.name?.find((n) => n.use === 'official') ?? p?.name?.[0];
  return {
    prefix: name?.prefix?.join(' ') ?? '',
    given: name?.given?.join(' ') ?? '',
    family: name?.family ?? '',
    suffix: name?.suffix?.join(', ') ?? '',
    phone: p?.telecom?.find((t) => t.system === 'phone' && t.use !== 'old')?.value ?? '',
    email: p?.telecom?.find((t) => t.system === 'email' && t.use !== 'old')?.value ?? '',
    npi: p?.identifier?.find((i) => i.system === NPI_SYSTEM)?.value ?? '',
  };
}

/** Applies form values to a Practitioner, preserving every field the form does not manage. */
export function applyProfileForm(p: Practitioner, v: ProfileFormValues): Practitioner {
  const existingNames = p.name ?? [];
  const idx = Math.max(0, existingNames.findIndex((n) => n.use === 'official'));
  const name: HumanName = {
    ...existingNames[idx],
    use: existingNames[idx]?.use ?? 'official',
    prefix: split(v.prefix),
    given: split(v.given),
    family: v.family.trim() || undefined,
    suffix: v.suffix.split(',').map((s) => s.trim()).filter(Boolean).length
      ? v.suffix.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined,
    text: undefined,
  };
  const names = existingNames.length ? existingNames.map((n, i) => (i === idx ? name : n)) : [name];

  const otherTelecom = (p.telecom ?? []).filter((t) => {
    const current = t.use !== 'old';
    return !(current && (t.system === 'phone' || t.system === 'email'));
  });
  const telecom = [
    ...(v.phone.trim() ? [{ system: 'phone' as const, use: 'work' as const, value: v.phone.trim() }] : []),
    ...(v.email.trim() ? [{ system: 'email' as const, use: 'work' as const, value: v.email.trim().toLowerCase() }] : []),
    ...otherTelecom,
  ];

  const identifier = [
    ...(p.identifier ?? []).filter((i) => i.system !== NPI_SYSTEM),
    ...(v.npi.trim() ? [{ system: NPI_SYSTEM, value: v.npi.trim() }] : []),
  ];

  return {
    ...p,
    name: names,
    telecom: telecom.length ? telecom : undefined,
    identifier: identifier.length ? identifier : undefined,
  };
}

/** Display string used on references, e.g. "Dr. Maya Chen, MD". */
export function practitionerDisplay(v: ProfileFormValues): string {
  return formatHumanName(
    { prefix: split(v.prefix), given: split(v.given), family: v.family.trim(), suffix: split(v.suffix.replace(/,/g, ' ')) },
    { prefix: true, suffix: true }
  ).replace(/ (\S+)$/, (m) => (v.suffix.trim() ? `,${m}` : m));
}

/**
 * Validates a US National Provider Identifier: 10 digits with a Luhn check digit computed
 * over the "80840" health-industry prefix (CMS NPI standard).
 */
export function isValidNpi(npi: string): boolean {
  if (!/^\d{10}$/.test(npi)) {
    return false;
  }
  const digits = `80840${npi}`.split('').map(Number);
  let sum = 0;
  for (let i = digits.length - 1, double = false; i >= 0; i--, double = !double) {
    let d = digits[i] as number;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

export function validateProfileForm(v: ProfileFormValues): Partial<Record<keyof ProfileFormValues, string>> {
  const errors: Partial<Record<keyof ProfileFormValues, string>> = {};
  if (!v.given.trim()) errors.given = 'First name is required';
  if (!v.family.trim()) errors.family = 'Last name is required';
  if (v.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) errors.email = 'Enter a valid email address';
  if (v.npi.trim() && !isValidNpi(v.npi.trim())) errors.npi = 'NPI must be 10 digits with a valid check digit';
  return errors;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
