import { ActionIcon, Anchor, Badge, Button, Group, Modal, MultiSelect, Select, Stack, Text, Tooltip } from '@mantine/core';
import { IconListCheck, IconPlus, IconTrash } from '@tabler/icons-react';
import type { Condition, Encounter, Patient, Reference } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useState } from 'react';
import { AppointmentForm } from '../../components/clinical/AppointmentForm';
import { ImmunizationForm } from '../../components/clinical/ImmunizationForm';
import { LabOrderForm } from '../../components/clinical/LabOrderForm';
import { PrescribeForm } from '../../components/clinical/PrescribeForm';
import { ProblemForm } from '../../components/clinical/ProblemForm';
import { VitalsForm } from '../../components/clinical/VitalsForm';
import { EmptyState, SectionCard, StatusBadge } from '../../components/common';
import { notifyError, notifySuccess } from '../../components/notify';
import { claimTotal, feeFor, type ChargeLine } from '../../lib/billing';
import { CPT_CODES } from '../../lib/catalog';
import { SYSTEMS } from '../../lib/constants';
import { codeFrom, conceptText, formatDateTime } from '../../lib/fhir';
import { useAsync } from '../../lib/hooks';
import { VITALS, vitalsFlowsheet, type VitalKey } from '../../lib/vitals';
import type { SoapNote } from '../../lib/notes';

type ModalKind = 'vitals' | 'dx' | 'rx' | 'lab' | 'imm' | 'followup' | undefined;

interface Props {
  readonly patient: Patient;
  readonly patientRef: Reference<Patient>;
  readonly encounter: Encounter;
  readonly encounterRef: Reference<Encounter>;
  readonly diagnoses: Condition[];
  readonly signed: boolean;
  readonly charges: ChargeLine[];
  readonly onChargesChange: (lines: ChargeLine[]) => void;
  readonly onDiagnosesChanged: () => void;
  readonly onInsertText: (section: keyof SoapNote, text: string) => void;
}

const EM_CODES = CPT_CODES.filter((c) => c.code.startsWith('992') || c.code.startsWith('993'));
const ADDON_CODES = CPT_CODES.filter((c) => !EM_CODES.includes(c));

export function EncounterSidebar(props: Props) {
  const { patientRef, encounter, encounterRef, diagnoses, signed, charges, onChargesChange, onDiagnosesChanged, onInsertText } = props;
  const medplum = useMedplum();
  const [modal, setModal] = useState<ModalKind>();
  const encRef = `Encounter/${encounter.id}`;

  const { data, reload } = useAsync(async () => {
    const opts = { cache: 'no-cache' as const };
    const [vitals, meds, labs, imms, allergies, activeMeds, problems, claims] = await Promise.all([
      medplum.searchResources('Observation', { encounter: encRef, category: 'vital-signs', _count: '50' }, opts),
      medplum.searchResources('MedicationRequest', { encounter: encRef, _count: '50' }, opts),
      medplum.searchResources('ServiceRequest', { encounter: encRef, _count: '50' }, opts),
      medplum.searchResources('Immunization', { encounter: encRef, _count: '50' }, opts),
      medplum.searchResources('AllergyIntolerance', { patient: patientRef.reference as string, _count: '100' }, opts),
      medplum.searchResources('MedicationRequest', { subject: patientRef.reference as string, status: 'active', _count: '100' }, opts),
      medplum.searchResources('Condition', { subject: patientRef.reference as string, category: 'problem-list-item', _count: '200' }, opts),
      medplum.searchResources('Claim', { encounter: encRef }, opts),
    ]);
    return { vitals: vitalsFlowsheet(vitals)[0], meds, labs, imms, allergies, activeMeds, problems, claims };
  }, [medplum, encRef]);

  const close = (msg?: string) => {
    setModal(undefined);
    if (msg) notifySuccess(msg);
    reload();
  };

  const vitalsText = (): string => {
    const v = data?.vitals?.values;
    if (!v) return '';
    const parts: string[] = [];
    if (v.systolic !== undefined) parts.push(`BP ${v.systolic}/${v.diastolic}`);
    (['heartRate', 'respRate', 'temp', 'spo2', 'weight', 'bmi'] as VitalKey[]).forEach((k) => v[k] !== undefined && parts.push(`${VITALS[k].label} ${v[k]}${VITALS[k].unit === '%' ? '%' : ` ${VITALS[k].unit}`}`));
    return `Vitals: ${parts.join(', ')}`;
  };

  const removeDx = async (c: Condition): Promise<void> => {
    try {
      const { clinicalStatus: _drop, ...rest } = c;
      void _drop;
      await medplum.updateResource<Condition>({ ...rest, verificationStatus: { coding: [{ system: SYSTEMS.CONDITION_VER, code: 'entered-in-error' }] } });
      onDiagnosesChanged();
    } catch (err) {
      notifyError(err);
    }
  };

  const addToProblemList = async (c: Condition): Promise<void> => {
    try {
      const { id: _id, meta: _meta, encounter: _enc, ...rest } = c;
      void _id; void _meta; void _enc;
      await medplum.createResource<Condition>({
        ...rest,
        category: [{ coding: [{ system: SYSTEMS.CONDITION_CATEGORY, code: 'problem-list-item', display: 'Problem List Item' }] }],
      });
      notifySuccess('Added to problem list');
      reload();
    } catch (err) {
      notifyError(err);
    }
  };

  const onProblemList = (c: Condition): boolean =>
    !!data?.problems.some((p) => conceptText(p.code) === conceptText(c.code) && p.clinicalStatus?.coding?.[0]?.code === 'active');

  const em = charges.find((c) => EM_CODES.some((e) => e.code === c.cpt))?.cpt ?? null;
  const addons = charges.filter((c) => !EM_CODES.some((e) => e.code === c.cpt)).map((c) => c.cpt);
  const setCodes = (newEm: string | null, newAddons: string[]): void =>
    onChargesChange([...(newEm ? [{ cpt: newEm, units: 1 }] : []), ...newAddons.map((cpt) => ({ cpt, units: 1 }))]);
  const estimate = charges.reduce((s, c) => s + feeFor(c.cpt) * c.units, 0);

  const addBtn = (kind: ModalKind, label: string) =>
    !signed && (
      <Button size="xs" variant="light" leftSection={<IconPlus size={14} />} onClick={() => setModal(kind)}>
        {label}
      </Button>
    );

  return (
    <Stack gap="sm">
      <SectionCard title="Vitals" actions={addBtn('vitals', 'Record')}>
        {data?.vitals ? (
          <Stack gap={4}>
            <Text size="sm">{vitalsText().replace('Vitals: ', '')}</Text>
            <Group justify="space-between">
              <Text size="xs" c="dimmed">{formatDateTime(data.vitals.date)}</Text>
              {!signed && <Anchor size="xs" onClick={() => onInsertText('objective', vitalsText())}>Insert into note</Anchor>}
            </Group>
          </Stack>
        ) : (
          <EmptyState>Not recorded this visit</EmptyState>
        )}
      </SectionCard>

      <SectionCard title="Diagnoses" actions={addBtn('dx', 'Add')} data-testid="encounter-diagnoses">
        {diagnoses.length === 0 ? (
          <EmptyState>Required before signing</EmptyState>
        ) : (
          <Stack gap={6}>
            {diagnoses.map((d, i) => (
              <Group key={d.id} justify="space-between" wrap="nowrap">
                <div>
                  <Text size="sm" fw={500}>{i + 1}. {conceptText(d.code)}</Text>
                  <Text size="xs" c="dimmed">{codeFrom(d.code, SYSTEMS.ICD10) ?? 'uncoded'}</Text>
                </div>
                <Group gap={2} wrap="nowrap">
                  {!onProblemList(d) && (
                    <Tooltip label="Add to problem list">
                      <ActionIcon variant="subtle" onClick={() => addToProblemList(d)} aria-label="Add to problem list"><IconListCheck size={16} /></ActionIcon>
                    </Tooltip>
                  )}
                  {!signed && (
                    <ActionIcon variant="subtle" color="red" onClick={() => removeDx(d)} aria-label="Remove diagnosis"><IconTrash size={16} /></ActionIcon>
                  )}
                </Group>
              </Group>
            ))}
            {!signed && (
              <Anchor size="xs" onClick={() => onInsertText('assessment', diagnoses.map((d, i) => `${i + 1}. ${conceptText(d.code)}${codeFrom(d.code, SYSTEMS.ICD10) ? ` (${codeFrom(d.code, SYSTEMS.ICD10)})` : ''}`).join('\n'))}>
                Insert into assessment
              </Anchor>
            )}
          </Stack>
        )}
      </SectionCard>

      <SectionCard title="Orders" actions={<Group gap={4}>{addBtn('rx', 'Rx')}{addBtn('lab', 'Lab')}</Group>}>
        {(data?.meds.length ?? 0) + (data?.labs.length ?? 0) === 0 ? (
          <EmptyState>No orders this visit</EmptyState>
        ) : (
          <Stack gap={6}>
            {data?.meds.map((m) => (
              <Group key={m.id} justify="space-between" wrap="nowrap">
                <div>
                  <Text component="div" size="sm" fw={500}><Badge size="xs" mr={4}>Rx</Badge>{conceptText(m.medicationCodeableConcept)}</Text>
                  <Text size="xs" c="dimmed">{m.dosageInstruction?.[0]?.text}</Text>
                </div>
                <StatusBadge status={m.status} size="xs" />
              </Group>
            ))}
            {data?.labs.map((l) => (
              <Group key={l.id} justify="space-between" wrap="nowrap">
                <Text component="div" size="sm" fw={500}><Badge size="xs" color="grape" mr={4}>Lab</Badge>{conceptText(l.code)}</Text>
                <StatusBadge status={l.status} size="xs" />
              </Group>
            ))}
            {!signed && (
              <Anchor
                size="xs"
                onClick={() =>
                  onInsertText(
                    'plan',
                    [
                      ...(data?.meds ?? []).map((m) => `- Rx: ${conceptText(m.medicationCodeableConcept)} — ${m.dosageInstruction?.[0]?.text ?? ''}`),
                      ...(data?.labs ?? []).map((l) => `- Lab: ${conceptText(l.code)}`),
                    ].join('\n')
                  )
                }
              >
                Insert into plan
              </Anchor>
            )}
          </Stack>
        )}
      </SectionCard>

      <SectionCard title="Immunizations" actions={addBtn('imm', 'Give')}>
        {(data?.imms ?? []).length === 0 ? (
          <EmptyState>None this visit</EmptyState>
        ) : (
          <Stack gap={4}>
            {data?.imms.map((i) => <Text key={i.id} size="sm">{conceptText(i.vaccineCode)} {i.lotNumber ? `· lot ${i.lotNumber}` : ''}</Text>)}
          </Stack>
        )}
      </SectionCard>

      <SectionCard title="Coding & billing" data-testid="encounter-billing">
        {signed ? (
          (data?.claims ?? []).length === 0 ? (
            <EmptyState>No charges captured</EmptyState>
          ) : (
            data?.claims.map((c) => (
              <Stack key={c.id} gap={2}>
                <Group justify="space-between">
                  <Text size="sm">{c.item?.map((i) => i.productOrService.coding?.[0]?.code).join(', ')}</Text>
                  <StatusBadge status={c.status} size="xs" />
                </Group>
                <Text size="xs" c="dimmed">Claim total ${claimTotal(c).toFixed(2)}</Text>
              </Stack>
            ))
          )
        ) : (
          <Stack gap="xs">
            <Select label="E/M level" placeholder="Select visit level" data={EM_CODES.map((c) => ({ value: c.code, label: `${c.code} – ${c.display}` }))} value={em} onChange={(v) => setCodes(v, addons)} clearable comboboxProps={{ withinPortal: true }} />
            <MultiSelect label="Procedures" data={ADDON_CODES.map((c) => ({ value: c.code, label: `${c.code} – ${c.display}` }))} value={addons} onChange={(v) => setCodes(em, v)} comboboxProps={{ withinPortal: true }} />
            <Text size="xs" c="dimmed">Estimated charges ${estimate.toFixed(2)} · claim is created on signing</Text>
          </Stack>
        )}
      </SectionCard>

      <SectionCard title="Follow-up" actions={<Button size="xs" variant="light" leftSection={<IconPlus size={14} />} onClick={() => setModal('followup')}>Schedule</Button>}>
        <Text size="sm" c="dimmed">Book the next appointment before the patient leaves.</Text>
      </SectionCard>

      <Modal opened={modal === 'vitals'} onClose={() => setModal(undefined)} title="Record vitals" size="lg">
        {modal === 'vitals' && <VitalsForm patient={patientRef} encounter={encounterRef} onSaved={() => close('Vitals saved')} />}
      </Modal>
      <Modal opened={modal === 'dx'} onClose={() => setModal(undefined)} title="Add diagnosis" size="lg">
        {modal === 'dx' && (
          <ProblemForm
            patient={patientRef}
            encounter={encounterRef}
            category="encounter-diagnosis"
            onSaved={() => {
              setModal(undefined);
              onDiagnosesChanged();
              reload();
            }}
          />
        )}
      </Modal>
      <Modal opened={modal === 'rx'} onClose={() => setModal(undefined)} title="Prescribe" size="lg">
        {modal === 'rx' && data && (
          <PrescribeForm patient={patientRef} encounter={encounterRef} allergies={data.allergies} activeMedications={data.activeMeds} onSaved={() => close('Prescription created')} />
        )}
      </Modal>
      <Modal opened={modal === 'lab'} onClose={() => setModal(undefined)} title="Order labs" size="lg">
        {modal === 'lab' && <LabOrderForm patient={patientRef} encounter={encounterRef} diagnoses={diagnoses} onSaved={() => close('Labs ordered')} />}
      </Modal>
      <Modal opened={modal === 'imm'} onClose={() => setModal(undefined)} title="Administer immunization" size="lg">
        {modal === 'imm' && <ImmunizationForm patient={patientRef} encounter={encounterRef} onSaved={() => close('Immunization recorded')} />}
      </Modal>
      <Modal opened={modal === 'followup'} onClose={() => setModal(undefined)} title="Schedule follow-up" size="lg">
        {modal === 'followup' && <AppointmentForm patient={patientRef} defaultStart={inWeeks(4)} onSaved={() => close('Follow-up booked')} />}
      </Modal>
    </Stack>
  );
}

function inWeeks(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n * 7);
  d.setHours(9, 0, 0, 0);
  return d;
}
