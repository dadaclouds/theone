import { Button, Group, MultiSelect, Select, Stack, Textarea } from '@mantine/core';
import type { AllergyIntolerance, CodeableConcept, Patient, Reference } from '@medplum/fhirtypes';
import { useMedplum, useMedplumProfile } from '@medplum/react';
import { useState } from 'react';
import { ALLERGENS, REACTIONS, type CatalogItem } from '../../lib/catalog';
import { SYSTEMS } from '../../lib/constants';
import { conceptFromCatalog, profileDisplay } from '../../lib/fhir';
import { CodeInput } from '../CodeInput';
import { notifyError } from '../notify';

interface AllergyFormProps {
  readonly patient: Reference<Patient>;
  readonly existing?: AllergyIntolerance;
  readonly onSaved: (allergy: AllergyIntolerance) => void;
}

export function AllergyForm({ patient, existing, onSaved }: AllergyFormProps) {
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const [code, setCode] = useState<CodeableConcept | undefined>(existing?.code);
  const [item, setItem] = useState<CatalogItem>();
  const [category, setCategory] = useState<string>(existing?.category?.[0] ?? 'medication');
  const [criticality, setCriticality] = useState<string>(existing?.criticality ?? 'low');
  const [severity, setSeverity] = useState<string>(existing?.reaction?.[0]?.severity ?? 'mild');
  const [reactions, setReactions] = useState<string[]>(
    existing?.reaction?.[0]?.manifestation?.map((m) => m.coding?.[0]?.code ?? '').filter(Boolean) ?? []
  );
  const [note, setNote] = useState(existing?.note?.[0]?.text ?? '');
  const [saving, setSaving] = useState(false);

  const inferCategory = (i: CatalogItem | undefined): void => {
    setItem(i);
    if (!i?.keywords) {
      return;
    }
    if (i.keywords.includes('food')) setCategory('food');
    else if (i.keywords.includes('environmental') || i.keywords.includes('rubber')) setCategory('environment');
    else if (i.keywords.includes('insect')) setCategory('biologic');
    else setCategory('medication');
  };

  const save = async (): Promise<void> => {
    if (!code) {
      return;
    }
    setSaving(true);
    try {
      const manifestation = reactions
        .map((r) => REACTIONS.find((x) => x.code === r))
        .filter((r): r is CatalogItem => !!r)
        .map(conceptFromCatalog);
      const resource: AllergyIntolerance = {
        ...(existing ?? {}),
        resourceType: 'AllergyIntolerance',
        patient,
        code,
        clinicalStatus: { coding: [{ system: SYSTEMS.ALLERGY_CLINICAL, code: 'active' }] },
        verificationStatus: { coding: [{ system: SYSTEMS.ALLERGY_VER, code: 'confirmed' }] },
        type: 'allergy',
        category: [category as 'medication'],
        criticality: criticality as AllergyIntolerance['criticality'],
        recordedDate: existing?.recordedDate ?? new Date().toISOString(),
        recorder: profile ? { reference: `${profile.resourceType}/${profile.id}`, display: profileDisplay(profile) } : undefined,
        reaction: manifestation.length ? [{ manifestation, severity: severity as 'mild' }] : undefined,
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
        label="Allergen"
        placeholder="e.g. Penicillin, Peanut, Latex"
        catalog={ALLERGENS}
        defaultValue={existing?.code}
        onChange={(c, i) => {
          setCode(c);
          if (i !== item) inferCategory(i);
        }}
        required
        data-autofocus
      />
      <Group grow>
        <Select label="Category" data={['medication', 'food', 'environment', 'biologic']} value={category} onChange={(v) => setCategory(v ?? 'medication')} />
        <Select label="Criticality" data={[{ value: 'low', label: 'Low' }, { value: 'high', label: 'High' }, { value: 'unable-to-assess', label: 'Unable to assess' }]} value={criticality} onChange={(v) => setCriticality(v ?? 'low')} />
      </Group>
      <Group grow align="flex-start">
        <MultiSelect label="Reactions" data={REACTIONS.map((r) => ({ value: r.code, label: r.display }))} value={reactions} onChange={setReactions} searchable comboboxProps={{ withinPortal: true }} />
        <Select label="Severity" data={['mild', 'moderate', 'severe']} value={severity} onChange={(v) => setSeverity(v ?? 'mild')} />
      </Group>
      <Textarea label="Note" autosize minRows={2} value={note} onChange={(e) => setNote(e.currentTarget.value)} />
      <Group justify="flex-end">
        <Button onClick={save} loading={saving} disabled={!code}>
          Save allergy
        </Button>
      </Group>
    </Stack>
  );
}
