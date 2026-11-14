import { Button, Group, NumberInput, SimpleGrid, Stack, Text } from '@mantine/core';
import type { Encounter, Observation, Patient, Practitioner, Reference } from '@medplum/fhirtypes';
import { useMedplum, useMedplumProfile } from '@medplum/react';
import { useState } from 'react';
import { profileDisplay } from '../../lib/fhir';
import { buildVitalObservations, calculateBmi, interpret, VITALS, type VitalKey, type VitalValues } from '../../lib/vitals';
import { notifyError } from '../notify';

const FIELDS: VitalKey[] = ['systolic', 'diastolic', 'heartRate', 'respRate', 'temp', 'spo2', 'weight', 'height', 'pain'];

export function VitalsForm({
  patient,
  encounter,
  onSaved,
}: {
  readonly patient: Reference<Patient>;
  readonly encounter?: Reference<Encounter>;
  readonly onSaved: (observations: Observation[]) => void;
}) {
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const [values, setValues] = useState<VitalValues>({});
  const [saving, setSaving] = useState(false);
  const bmi = calculateBmi(values.weight, values.height);
  const bpIncomplete = (values.systolic === undefined) !== (values.diastolic === undefined);

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      const performer =
        profile?.resourceType === 'Practitioner'
          ? ({ reference: `Practitioner/${profile.id}`, display: profileDisplay(profile) } as Reference<Practitioner>)
          : undefined;
      const observations = buildVitalObservations(values, patient, { encounter, performer });
      const saved = await Promise.all(observations.map((o) => medplum.createResource(o)));
      setValues({});
      onSaved(saved);
    } catch (err) {
      notifyError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack>
      <SimpleGrid cols={{ base: 2, sm: 3 }}>
        {FIELDS.map((key) => {
          const def = VITALS[key];
          const v = values[key];
          const flag = v !== undefined ? interpret(def, v) : 'N';
          return (
            <NumberInput
              key={key}
              label={`${def.label} (${def.unit})`}
              aria-label={def.label}
              decimalScale={def.decimals}
              hideControls
              value={v ?? ''}
              error={flag !== 'N' ? (flag === 'H' ? 'High' : 'Low') : undefined}
              onChange={(val) => setValues((prev) => ({ ...prev, [key]: val === '' ? undefined : Number(val) }))}
            />
          );
        })}
      </SimpleGrid>
      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          {bmi ? `BMI ${bmi} kg/m²` : 'BMI calculated from weight & height'}
          {bpIncomplete ? ' · Enter both systolic and diastolic' : ''}
        </Text>
        <Button onClick={save} loading={saving} disabled={bpIncomplete || Object.values(values).every((v) => v === undefined)}>
          Save vitals
        </Button>
      </Group>
    </Stack>
  );
}
