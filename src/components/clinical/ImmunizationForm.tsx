import { Button, Group, Select, Stack, TextInput } from '@mantine/core';
import type { CodeableConcept, Encounter, Immunization, Patient, Reference } from '@medplum/fhirtypes';
import { useMedplum, useMedplumProfile } from '@medplum/react';
import { useState } from 'react';
import { VACCINES } from '../../lib/catalog';
import { profileDisplay, toLocalDateString } from '../../lib/fhir';
import { CodeInput } from '../CodeInput';
import { notifyError } from '../notify';

export function ImmunizationForm({
  patient,
  encounter,
  onSaved,
}: {
  readonly patient: Reference<Patient>;
  readonly encounter?: Reference<Encounter>;
  readonly onSaved: (imm: Immunization) => void;
}) {
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const [vaccine, setVaccine] = useState<CodeableConcept>();
  const [date, setDate] = useState(toLocalDateString(new Date()));
  const [lot, setLot] = useState('');
  const [site, setSite] = useState<string | null>('Left deltoid');
  const [source, setSource] = useState<string>('administered');
  const [saving, setSaving] = useState(false);

  const save = async (): Promise<void> => {
    if (!vaccine) return;
    setSaving(true);
    try {
      const saved = await medplum.createResource<Immunization>({
        resourceType: 'Immunization',
        status: 'completed',
        vaccineCode: vaccine,
        patient,
        encounter,
        occurrenceDateTime: date,
        primarySource: source === 'administered',
        reportOrigin: source === 'administered' ? undefined : { text: 'Patient / outside record' },
        lotNumber: lot || undefined,
        site: site ? { text: site } : undefined,
        performer:
          source === 'administered' && profile
            ? [{ actor: { reference: `${profile.resourceType}/${profile.id}`, display: profileDisplay(profile) } }]
            : undefined,
      });
      onSaved(saved);
    } catch (err) {
      notifyError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack>
      <CodeInput label="Vaccine" placeholder="Search CVX vaccines" catalog={VACCINES} onChange={setVaccine} required data-autofocus />
      <Group grow>
        <TextInput label="Date given" type="date" value={date} onChange={(e) => setDate(e.currentTarget.value)} />
        <Select label="Source" data={[{ value: 'administered', label: 'Administered here' }, { value: 'historical', label: 'Historical record' }]} value={source} onChange={(v) => setSource(v ?? 'administered')} />
      </Group>
      <Group grow>
        <TextInput label="Lot number" value={lot} onChange={(e) => setLot(e.currentTarget.value)} />
        <Select label="Site" data={['Left deltoid', 'Right deltoid', 'Left thigh', 'Right thigh', 'Oral', 'Intranasal']} value={site} onChange={setSite} clearable />
      </Group>
      <Group justify="flex-end">
        <Button onClick={save} loading={saving} disabled={!vaccine}>
          Record immunization
        </Button>
      </Group>
    </Stack>
  );
}
