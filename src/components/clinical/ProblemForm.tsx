import { Button, Group, Select, Stack, Textarea, TextInput } from '@mantine/core';
import type { CodeableConcept, Condition, Encounter, Patient, Reference } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useState } from 'react';
import { PROBLEMS } from '../../lib/catalog';
import { SYSTEMS } from '../../lib/constants';
import { CodeInput } from '../CodeInput';
import { notifyError } from '../notify';

interface ProblemFormProps {
  readonly patient: Reference<Patient>;
  readonly encounter?: Reference<Encounter>;
  /** problem-list-item (chart) or encounter-diagnosis (visit). */
  readonly category: 'problem-list-item' | 'encounter-diagnosis';
  readonly existing?: Condition;
  readonly onSaved: (condition: Condition) => void;
}

export function ProblemForm({ patient, encounter, category, existing, onSaved }: ProblemFormProps) {
  const medplum = useMedplum();
  const [code, setCode] = useState<CodeableConcept | undefined>(existing?.code);
  const [status, setStatus] = useState(existing?.clinicalStatus?.coding?.[0]?.code ?? 'active');
  const [onset, setOnset] = useState(existing?.onsetDateTime?.slice(0, 10) ?? '');
  const [note, setNote] = useState(existing?.note?.[0]?.text ?? '');
  const [saving, setSaving] = useState(false);

  const save = async (): Promise<void> => {
    if (!code) {
      return;
    }
    setSaving(true);
    try {
      const resource: Condition = {
        ...(existing ?? {}),
        resourceType: 'Condition',
        subject: patient,
        encounter: encounter ?? existing?.encounter,
        category: [{ coding: [{ system: SYSTEMS.CONDITION_CATEGORY, code: category, display: category === 'problem-list-item' ? 'Problem List Item' : 'Encounter Diagnosis' }] }],
        code,
        clinicalStatus: { coding: [{ system: SYSTEMS.CONDITION_CLINICAL, code: status }] },
        verificationStatus: { coding: [{ system: SYSTEMS.CONDITION_VER, code: 'confirmed' }] },
        onsetDateTime: onset || undefined,
        abatementDateTime: status === 'resolved' ? existing?.abatementDateTime ?? new Date().toISOString() : undefined,
        recordedDate: existing?.recordedDate ?? new Date().toISOString(),
        note: note.trim() ? [{ text: note.trim() }] : undefined,
      };
      const saved = existing ? await medplum.updateResource(resource) : await medplum.createResource(resource);
      onSaved(saved);
    } catch (err) {
      notifyError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack>
      <CodeInput
        label={category === 'problem-list-item' ? 'Problem' : 'Diagnosis'}
        placeholder="Search ICD-10 / SNOMED or type free text"
        catalog={PROBLEMS}
        defaultValue={existing?.code}
        onChange={setCode}
        data-autofocus
        required
      />
      <Group grow>
        <Select
          label="Status"
          data={[
            { value: 'active', label: 'Active' },
            { value: 'recurrence', label: 'Recurrence' },
            { value: 'inactive', label: 'Inactive' },
            { value: 'resolved', label: 'Resolved' },
          ]}
          value={status}
          onChange={(v) => setStatus(v ?? 'active')}
        />
        <TextInput label="Onset date" type="date" value={onset} onChange={(e) => setOnset(e.currentTarget.value)} />
      </Group>
      <Textarea label="Note" autosize minRows={2} value={note} onChange={(e) => setNote(e.currentTarget.value)} />
      <Group justify="flex-end">
        <Button onClick={save} loading={saving} disabled={!code}>
          Save
        </Button>
      </Group>
    </Stack>
  );
}
