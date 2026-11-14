import { Button, Card, Group, Menu, Modal, Table, Text } from '@mantine/core';
import { IconCalendarPlus } from '@tabler/icons-react';
import type { Appointment } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useSearchParams } from 'react-router';
import { AppointmentForm } from '../../components/clinical/AppointmentForm';
import { EmptyState, StatusBadge } from '../../components/common';
import { notifyError, notifySuccess } from '../../components/notify';
import { appointmentPractitioner, nextStatuses } from '../../lib/appointments';
import { formatDateTime } from '../../lib/fhir';
import { useAsync } from '../../lib/hooks';
import { useChart } from './PatientContext';
import { useStartEncounter } from './useStartEncounter';

export function AppointmentsTab() {
  const medplum = useMedplum();
  const { patientRef } = useChart();
  const startEncounter = useStartEncounter();
  const [params, setParams] = useSearchParams();
  const adding = params.get('new') === '1';
  const { data = [], reload } = useAsync(
    () => medplum.searchResources('Appointment', { patient: patientRef.reference as string, _sort: '-date', _count: '100' }, { cache: 'no-cache' }),
    [medplum, patientRef.reference]
  );

  const setStatus = async (a: Appointment, status: Appointment['status']): Promise<void> => {
    try {
      await medplum.updateResource<Appointment>({ ...a, status, cancelationReason: status === 'cancelled' ? { text: 'Cancelled by clinic' } : undefined });
      notifySuccess(`Appointment ${status}`);
      reload();
    } catch (err) {
      notifyError(err);
    }
  };

  return (
    <Card withBorder>
      <Group justify="space-between" mb="sm">
        <Text size="sm" c="dimmed">{data.length} appointment(s)</Text>
        <Button leftSection={<IconCalendarPlus size={16} />} onClick={() => setParams({ new: '1' })}>
          Schedule appointment
        </Button>
      </Group>
      {data.length === 0 ? (
        <EmptyState>No appointments</EmptyState>
      ) : (
        <Table.ScrollContainer minWidth={600}>
          <Table verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>When</Table.Th>
                <Table.Th>Type</Table.Th>
                <Table.Th>Reason</Table.Th>
                <Table.Th>Provider</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.map((a) => (
                <Table.Tr key={a.id}>
                  <Table.Td>{formatDateTime(a.start)}</Table.Td>
                  <Table.Td fw={500}>{a.appointmentType?.text}</Table.Td>
                  <Table.Td>{a.description}</Table.Td>
                  <Table.Td>{appointmentPractitioner(a)?.display}</Table.Td>
                  <Table.Td><StatusBadge status={a.status} /></Table.Td>
                  <Table.Td>
                    <Group gap={4} justify="flex-end" wrap="nowrap">
                      {(a.status === 'booked' || a.status === 'arrived') && (
                        <Button size="xs" variant="light" onClick={() => startEncounter({ appointment: a })}>Start visit</Button>
                      )}
                      {nextStatuses(a.status).length > 0 && (
                        <Menu position="bottom-end">
                          <Menu.Target><Button size="xs" variant="subtle">Status</Button></Menu.Target>
                          <Menu.Dropdown>
                            {nextStatuses(a.status).map((s) => (
                              <Menu.Item key={s} onClick={() => setStatus(a, s)}>{s}</Menu.Item>
                            ))}
                          </Menu.Dropdown>
                        </Menu>
                      )}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
      <Modal opened={adding} onClose={() => setParams({})} title="Schedule appointment" size="lg">
        {adding && (
          <AppointmentForm
            patient={patientRef}
            onSaved={() => {
              setParams({});
              notifySuccess('Appointment booked');
              reload();
            }}
          />
        )}
      </Modal>
    </Card>
  );
}
