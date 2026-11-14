import { Alert, Button, Checkbox, Group, NumberInput, Select, Stack, Textarea, TextInput } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import type { AllergyIntolerance, CodeableConcept, Encounter, MedicationRequest, Patient, Practitioner, Reference } from '@medplum/fhirtypes';
import { useMedplum, useMedplumProfile } from '@medplum/react';
import { useMemo, useState } from 'react';
import { checkMedicationAllergies } from '../../lib/allergy';
import { MEDICATIONS } from '../../lib/catalog';
import { conceptText, profileDisplay } from '../../lib/fhir';
import { CodeInput } from '../CodeInput';
import { notifyError } from '../notify';

const FREQUENCIES: { value: string; label: string; frequency: number; period: number; periodUnit: 'd' | 'h' | 'wk'; asNeeded?: boolean }[] = [
  { value: 'QD', label: 'Once daily', frequency: 1, period: 1, periodUnit: 'd' },
  { value: 'BID', label: 'Twice daily', frequency: 2, period: 1, periodUnit: 'd' },
  { value: 'TID', label: 'Three times daily', frequency: 3, period: 1, periodUnit: 'd' },
  { value: 'QID', label: 'Four times daily', frequency: 4, period: 1, periodUnit: 'd' },
  { value: 'QHS', label: 'At bedtime', frequency: 1, period: 1, periodUnit: 'd' },
  { value: 'Q4-6H PRN', label: 'Every 4-6 hours as needed', frequency: 1, period: 4, periodUnit: 'h', asNeeded: true },
  { value: 'QWK', label: 'Once weekly', frequency: 1, period: 1, periodUnit: 'wk' },
];

interface PrescribeFormProps {
  readonly patient: Reference<Patient>;
  readonly encounter?: Reference<Encounter>;
  readonly allergies: AllergyIntolerance[];
  readonly activeMedications: MedicationRequest[];
  readonly onSaved: (request: MedicationRequest) => void;
}

export function PrescribeForm({ patient, encounter, allergies, activeMedications, onSaved }: PrescribeFormProps) {
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const [medication, setMedication] = useState<CodeableConcept>();
  const [dose, setDose] = useState('1 tablet');
  const [route, setRoute] = useState('oral');
  const [frequency, setFrequency] = useState('QD');
  const [days, setDays] = useState<number | string>(30);
  const [quantity, setQuantity] = useState<number | string>(30);
  const [refills, setRefills] = useState<number | string>(0);
  const [instructions, setInstructions] = useState('');
  const [override, setOverride] = useState(false);
  const [saving, setSaving] = useState(false);

  const alerts = useMemo(() => (medication ? checkMedicationAllergies(medication, allergies) : []), [medication, allergies]);
  const duplicate = useMemo(() => {
    const name = conceptText(medication).toLowerCase().split(' ')[0];
    return name ? activeMedications.find((m) => conceptText(m.medicationCodeableConcept).toLowerCase().startsWith(name)) : undefined;
  }, [medication, activeMedications]);

  const freq = FREQUENCIES.find((f) => f.value === frequency) ?? FREQUENCIES[0];
  const sig = `${dose} ${route} ${freq.label.toLowerCase()}${instructions.trim() ? `. ${instructions.trim()}` : ''}`;

  const save = async (): Promise<void> => {
    if (!medication) {
      return;
    }
    setSaving(true);
    try {
      const now = new Date();
      const end = new Date(now);
      end.setDate(end.getDate() + Number(days || 0));
      const request = await medplum.createResource<MedicationRequest>({
        resourceType: 'MedicationRequest',
        status: 'active',
        intent: 'order',
        medicationCodeableConcept: medication,
        subject: patient,
        encounter,
        authoredOn: now.toISOString(),
        requester: profile ? ({ reference: `${profile.resourceType}/${profile.id}`, display: profileDisplay(profile) } as Reference<Practitioner>) : undefined,
        dosageInstruction: [
          {
            text: sig,
            route: { text: route },
            asNeededBoolean: freq.asNeeded,
            timing: { code: { text: freq.value }, repeat: { frequency: freq.frequency, period: freq.period, periodUnit: freq.periodUnit } },
          },
        ],
        dispenseRequest: {
          numberOfRepeatsAllowed: Number(refills || 0),
          quantity: { value: Number(quantity || 0), unit: 'each' },
          expectedSupplyDuration: { value: Number(days || 0), unit: 'days', system: 'http://unitsofmeasure.org', code: 'd' },
          validityPeriod: { start: now.toISOString(), end: end.toISOString() },
        },
        note: alerts.length && override ? [{ text: `Allergy alert overridden: ${alerts.map((a) => a.reason).join(' ')}` }] : undefined,
      });
      onSaved(request);
    } catch (err) {
      notifyError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack>
      <CodeInput label="Medication" placeholder="Search RxNorm or type a medication" catalog={MEDICATIONS} onChange={setMedication} required data-autofocus />
      {alerts.length > 0 && (
        <Alert color="red" icon={<IconAlertTriangle />} title="Allergy alert" data-testid="allergy-alert">
          {alerts.map((a) => (
            <div key={a.allergy.id}>{a.reason}</div>
          ))}
          <Checkbox mt="xs" label="Override — clinically appropriate, patient counseled" checked={override} onChange={(e) => setOverride(e.currentTarget.checked)} />
        </Alert>
      )}
      {duplicate && (
        <Alert color="yellow" title="Possible duplicate therapy">
          Patient already has an active order for {conceptText(duplicate.medicationCodeableConcept)}.
        </Alert>
      )}
      <Group grow>
        <TextInput label="Dose" value={dose} onChange={(e) => setDose(e.currentTarget.value)} />
        <Select label="Route" data={['oral', 'topical', 'inhaled', 'intranasal', 'subcutaneous', 'intramuscular', 'ophthalmic', 'otic']} value={route} onChange={(v) => setRoute(v ?? 'oral')} />
        <Select label="Frequency" data={FREQUENCIES.map((f) => ({ value: f.value, label: f.label }))} value={frequency} onChange={(v) => setFrequency(v ?? 'QD')} />
      </Group>
      <Group grow>
        <NumberInput label="Days supply" min={1} value={days} onChange={setDays} />
        <NumberInput label="Quantity" min={1} value={quantity} onChange={setQuantity} />
        <NumberInput label="Refills" min={0} max={11} value={refills} onChange={setRefills} />
      </Group>
      <Textarea label="Additional instructions" autosize minRows={1} value={instructions} onChange={(e) => setInstructions(e.currentTarget.value)} />
      <TextInput label="Sig preview" value={sig} readOnly variant="filled" />
      <Group justify="flex-end">
        <Button onClick={save} loading={saving} disabled={!medication || (alerts.length > 0 && !override)}>
          Prescribe
        </Button>
      </Group>
    </Stack>
  );
}
