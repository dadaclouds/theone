import { Button, Checkbox, Group, Select, Stack, Textarea } from '@mantine/core';
import type { Condition, Encounter, Patient, Practitioner, Reference, ServiceRequest } from '@medplum/fhirtypes';
import { useMedplum, useMedplumProfile } from '@medplum/react';
import { useState } from 'react';
import { LAB_TESTS } from '../../lib/catalog';
import { SYSTEMS } from '../../lib/constants';
import { conceptFromCatalog, conceptText, profileDisplay } from '../../lib/fhir';
import { notifyError } from '../notify';

interface LabOrderFormProps {
  readonly patient: Reference<Patient>;
  readonly encounter?: Reference<Encounter>;
  readonly diagnoses?: Condition[];
  readonly onSaved: (requests: ServiceRequest[]) => void;
}

export function LabOrderForm({ patient, encounter, diagnoses = [], onSaved }: LabOrderFormProps) {
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const [selected, setSelected] = useState<string[]>([]);
  const [priority, setPriority] = useState<string>('routine');
  const [reasons, setReasons] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      const requester = profile
        ? ({ reference: `${profile.resourceType}/${profile.id}`, display: profileDisplay(profile) } as Reference<Practitioner>)
        : undefined;
      const reasonConditions = diagnoses.filter((d) => reasons.includes(d.id as string));
      const created: ServiceRequest[] = [];
      for (const code of selected) {
        const test = LAB_TESTS.find((t) => t.code === code);
        if (!test) continue;
        created.push(
          await medplum.createResource<ServiceRequest>({
            resourceType: 'ServiceRequest',
            status: 'active',
            intent: 'order',
            priority: priority as ServiceRequest['priority'],
            category: [{ coding: [{ system: SYSTEMS.SNOMED, code: '108252007', display: 'Laboratory procedure' }], text: 'Laboratory' }],
            code: conceptFromCatalog(test),
            subject: patient,
            encounter,
            authoredOn: new Date().toISOString(),
            requester,
            reasonCode: reasonConditions.length ? reasonConditions.map((c) => c.code ?? { text: conceptText(c.code) }) : undefined,
            reasonReference: reasonConditions.length ? reasonConditions.map((c) => ({ reference: `Condition/${c.id}`, display: conceptText(c.code) })) : undefined,
            note: note.trim() ? [{ text: note.trim() }] : undefined,
          })
        );
      }
      onSaved(created);
    } catch (err) {
      notifyError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack>
      <Checkbox.Group label="Tests" value={selected} onChange={setSelected}>
        <Stack gap={6} mt={6}>
          {LAB_TESTS.map((t) => (
            <Checkbox key={t.code} value={t.code} label={`${t.display} (LOINC ${t.code})`} />
          ))}
        </Stack>
      </Checkbox.Group>
      <Select label="Priority" data={['routine', 'urgent', 'asap', 'stat']} value={priority} onChange={(v) => setPriority(v ?? 'routine')} />
      {diagnoses.length > 0 && (
        <Checkbox.Group label="Indication (diagnoses)" value={reasons} onChange={setReasons}>
          <Stack gap={6} mt={6}>
            {diagnoses.map((d) => (
              <Checkbox key={d.id} value={d.id as string} label={conceptText(d.code)} />
            ))}
          </Stack>
        </Checkbox.Group>
      )}
      <Textarea label="Note to lab" autosize minRows={1} value={note} onChange={(e) => setNote(e.currentTarget.value)} />
      <Group justify="flex-end">
        <Button onClick={save} loading={saving} disabled={selected.length === 0}>
          Place {selected.length || ''} order{selected.length === 1 ? '' : 's'}
        </Button>
      </Group>
    </Stack>
  );
}
