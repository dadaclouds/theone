import { ActionIcon, Button, Card, Group, Menu, Modal, SegmentedControl, Stack, Table, Text, Textarea } from '@mantine/core';
import { IconDots, IconPlus } from '@tabler/icons-react';
import type { MedicationRequest } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useState } from 'react';
import { PrescribeForm } from '../../components/clinical/PrescribeForm';
import { EmptyState, StatusBadge } from '../../components/common';
import { notifyError, notifySuccess } from '../../components/notify';
import { conceptText, formatDate } from '../../lib/fhir';
import { useChart } from './PatientContext';

export function MedicationsTab() {
  const medplum = useMedplum();
  const { medications, allergies, patientRef, refresh } = useChart();
  const [filter, setFilter] = useState('active');
  const [prescribing, setPrescribing] = useState(false);
  const [stopping, setStopping] = useState<MedicationRequest>();
  const [reason, setReason] = useState('');

  const active = medications.filter((m) => m.status === 'active');
  const shown = filter === 'active' ? active : medications.filter((m) => m.status !== 'entered-in-error');

  const discontinue = async (): Promise<void> => {
    if (!stopping) return;
    try {
      await medplum.updateResource<MedicationRequest>({
        ...stopping,
        status: 'stopped',
        statusReason: reason.trim() ? { text: reason.trim() } : undefined,
      });
      notifySuccess('Medication discontinued');
      setStopping(undefined);
      setReason('');
      refresh();
    } catch (err) {
      notifyError(err);
    }
  };

  const renew = async (m: MedicationRequest): Promise<void> => {
    try {
      const { id: _id, meta: _meta, ...rest } = m;
      void _id;
      void _meta;
      const now = new Date();
      const days = m.dispenseRequest?.expectedSupplyDuration?.value ?? 30;
      const end = new Date(now);
      end.setDate(end.getDate() + days);
      await medplum.createResource<MedicationRequest>({
        ...rest,
        status: 'active',
        authoredOn: now.toISOString(),
        priorPrescription: { reference: `MedicationRequest/${m.id}` },
        dispenseRequest: { ...m.dispenseRequest, validityPeriod: { start: now.toISOString(), end: end.toISOString() } },
      });
      await medplum.updateResource<MedicationRequest>({ ...m, status: 'completed' });
      notifySuccess('Prescription renewed');
      refresh();
    } catch (err) {
      notifyError(err);
    }
  };

  return (
    <Card withBorder>
      <Group justify="space-between" mb="sm">
        <SegmentedControl value={filter} onChange={setFilter} data={[{ value: 'active', label: `Active (${active.length})` }, { value: 'all', label: 'All history' }]} />
        <Button leftSection={<IconPlus size={16} />} onClick={() => setPrescribing(true)}>
          Prescribe
        </Button>
      </Group>
      {shown.length === 0 ? (
        <EmptyState>No medications</EmptyState>
      ) : (
        <Table.ScrollContainer minWidth={700}>
          <Table verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Medication</Table.Th>
                <Table.Th>Sig</Table.Th>
                <Table.Th>Qty / Refills</Table.Th>
                <Table.Th>Prescribed</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th w={40} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {shown.map((m) => (
                <Table.Tr key={m.id}>
                  <Table.Td>
                    <Text size="sm" fw={500}>{conceptText(m.medicationCodeableConcept)}</Text>
                    {m.requester?.display && <Text size="xs" c="dimmed">by {m.requester.display}</Text>}
                  </Table.Td>
                  <Table.Td><Text size="sm">{m.dosageInstruction?.[0]?.text}</Text></Table.Td>
                  <Table.Td>{m.dispenseRequest?.quantity?.value ?? '–'} / {m.dispenseRequest?.numberOfRepeatsAllowed ?? 0}</Table.Td>
                  <Table.Td>{formatDate(m.authoredOn)}</Table.Td>
                  <Table.Td>
                    <StatusBadge status={m.status} />
                    {m.statusReason?.text && <Text size="xs" c="dimmed">{m.statusReason.text}</Text>}
                  </Table.Td>
                  <Table.Td>
                    {m.status === 'active' && (
                      <Menu position="bottom-end">
                        <Menu.Target>
                          <ActionIcon variant="subtle" aria-label="Medication actions"><IconDots size={16} /></ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Item onClick={() => renew(m)}>Renew</Menu.Item>
                          <Menu.Item color="red" onClick={() => setStopping(m)}>Discontinue</Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
      <Modal opened={prescribing} onClose={() => setPrescribing(false)} title="New prescription" size="lg">
        {prescribing && (
          <PrescribeForm
            patient={patientRef}
            allergies={allergies}
            activeMedications={active}
            onSaved={() => {
              setPrescribing(false);
              notifySuccess('Prescription created');
              refresh();
            }}
          />
        )}
      </Modal>
      <Modal opened={!!stopping} onClose={() => setStopping(undefined)} title={`Discontinue ${conceptText(stopping?.medicationCodeableConcept)}`}>
        <Stack>
          <Textarea label="Reason" placeholder="e.g. Side effects, therapy complete" value={reason} onChange={(e) => setReason(e.currentTarget.value)} />
          <Group justify="flex-end">
            <Button color="red" onClick={discontinue}>Discontinue</Button>
          </Group>
        </Stack>
      </Modal>
    </Card>
  );
}
