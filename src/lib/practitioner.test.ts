import type { Practitioner } from '@medplum/fhirtypes';
import { applyProfileForm, isValidNpi, NPI_SYSTEM, practitionerDisplay, practitionerToForm, validateProfileForm } from './practitioner';

describe('practitioner profile', () => {
  const base: Practitioner = {
    resourceType: 'Practitioner',
    id: 'p1',
    meta: { versionId: '3' },
    name: [{ prefix: ['Dr.'], given: ['Maya'], family: 'Chen' }],
    telecom: [
      { system: 'email', use: 'old', value: 'old@example.com' },
      { system: 'email', use: 'work', value: 'dr.chen@example.com' },
      { system: 'fax', value: '555-0000' },
    ],
    identifier: [{ system: 'urn:other', value: 'x' }],
    qualification: [{ code: { text: 'Board certified' } }],
  };

  test('round trip preserves unmanaged fields', () => {
    const form = { ...practitionerToForm(base), suffix: 'MD', phone: '(503) 555-0101', npi: '1234567893' };
    const out = applyProfileForm(base, form);
    expect(out.id).toBe('p1');
    expect(out.meta?.versionId).toBe('3');
    expect(out.qualification).toEqual(base.qualification);
    expect(out.name?.[0]).toMatchObject({ prefix: ['Dr.'], given: ['Maya'], family: 'Chen', suffix: ['MD'] });
    expect(out.telecom).toEqual(
      expect.arrayContaining([
        { system: 'phone', use: 'work', value: '(503) 555-0101' },
        { system: 'email', use: 'work', value: 'dr.chen@example.com' },
        { system: 'email', use: 'old', value: 'old@example.com' },
        { system: 'fax', value: '555-0000' },
      ])
    );
    expect(out.identifier).toEqual([{ system: 'urn:other', value: 'x' }, { system: NPI_SYSTEM, value: '1234567893' }]);
    expect(practitionerToForm(out)).toEqual(form);
  });

  test('clearing optional fields removes them', () => {
    const out = applyProfileForm(base, { ...practitionerToForm(base), prefix: '', email: '' });
    expect(out.name?.[0]?.prefix).toBeUndefined();
    expect(out.telecom?.some((t) => t.system === 'email' && t.use === 'work')).toBe(false);
  });

  test('display string', () => {
    expect(practitionerDisplay({ ...practitionerToForm(base), suffix: 'MD' })).toBe('Dr. Maya Chen, MD');
    expect(practitionerDisplay(practitionerToForm(base))).toBe('Dr. Maya Chen');
  });

  test('NPI check digit', () => {
    expect(isValidNpi('1234567893')).toBe(true); // CMS published example
    expect(isValidNpi('1234567890')).toBe(false);
    expect(isValidNpi('12345')).toBe(false);
  });

  test('validation', () => {
    expect(validateProfileForm({ ...practitionerToForm(base), given: '', npi: '1' })).toEqual({
      given: 'First name is required',
      npi: 'NPI must be 10 digits with a valid check digit',
    });
  });
});
