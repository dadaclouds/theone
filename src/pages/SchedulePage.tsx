import { ActionIcon, Button, Card, Group, Menu, Modal, Select, Stack, Table, Text, TextInput } from '@mantine/core';
import { IconCalendarPlus, IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import type { Appointment, Practitioner, Reference } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { AppointmentForm } from '../components/clinical/AppointmentForm';
import { EmptyState, PageHeader, StatusBadge } from '../components/common';
import { notifyError, notifySuccess } from '../components/notify';
import { appointmentPatient, appointmentPractitioner, nextStatuses } from '../lib/appointments';
import { createEncounter } from '../lib/encounters';
import { dayBounds, formatTime, profileDisplay, toLocalDateString } from '../lib/fhir';
import { useAsync } from '../lib/hooks';
import { toQuery } from '../lib/search';

export function SchedulePage() {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const [day, setDay] = useState(() => new Date());
  const [provider, setProvider] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const { data: practitioners = [] } = useAsync(() => medplum.searchResources('Practitioner', { _count: '100' }), [medplum]);
  const { data: appointments = [], reload } = useAsync(() => {
    const [start, end] = dayBounds(day);
    return medplum.searchResources(
      'Appointment',
      toQuery({ date: [`ge${start}`, `lt${end}`], _sort: 'date', _count: '200', practitioner: provider ? `Practitioner/${provider}` : undefined }),
      { cache: 'no-cache' }
    );
  }, [medplum, day.toDateString(), provider]);

  const shift = (days: number) => setDay((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days));
  const active = appointments.filter((a) => a.status !== 'cancelled');

  const setStatus = async (a: Appointment, status: Appointment['status']): Promise<void> => {
    try {
      await medplum.updateResource<Appointment>({ ...a, status });
      notifySuccess(`Marked ${status}`);
      reload();
    } catch (err) {
      notifyError(err);
    }
  };

  const startVisit = async (a: Appointment): Promise<void> => {
    try {
      const patient = appointmentPatient(a);
      if (!patient) return;
      const existing = await medplum.searchOne('Encounter', { appointment: `Appointment/${a.id}` }, { cache: 'no-cache' });
      const encounter =
        existing ?? (await createEncounter(medplum, { patient, practitioner: appointmentPractitioner(a) as Reference<Practitioner>, appointment: a }));
      navigate(`/patients/${patient.reference?.split('/')[1]}/encounters/${encounter.id}`);
    } catch (err) {
      notifyError(err);
    }
  };

  return (
    <>
      <PageHeader
        title="Schedule"
        subtitle={`${active.length} appointment(s) · ${day.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}`}
        actions={<Button leftSection={<IconCalendarPlus size={16} />} onClick={() => setAdding(true)}>New appointment</Button>}
      />
      <Card withBorder>
        <Group justify="space-between" mb="md" wrap="wrap">
          <Group gap="xs">
            <ActionIcon variant="default" onClick={() => shift(-1)} aria-label="Previous day"><IconChevronLeft size={16} /></ActionIcon>
            <Button variant="default" size="xs" onClick={() => setDay(new Date())}>Today</Button>
            <ActionIcon variant="default" onClick={() => shift(1)} aria-label="Next day"><IconChevronRight size={16} /></ActionIcon>
            <TextInput type="date" size="xs" value={toLocalDateString(day)} onChange={(e) => e.currentTarget.value && setDay(new Date(`${e.currentTarget.value}T00:00`))} aria-label="Date" />
          </Group>
          <Select
            size="xs"
            placeholder="All providers"
            clearable
            data={practitioners.map((p) => ({ value: p.id as string, label: profileDisplay(p) ?? '' }))}
            value={provider}
            onChange={setProvider}
            w={220}
          />
        </Group>
        {appointments.length === 0 ? (
          <EmptyState>No appointments on this day</EmptyState>
        ) : (
          <Table.ScrollContainer minWidth={760}>
            <Table verticalSpacing="sm" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Time</Table.Th>
                  <Table.Th>Patient</Table.Th>
                  <Table.Th>Type</Table.Th>
                  <Table.Th>Reason</Table.Th>
                  <Table.Th>Provider</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {appointments.map((a) => {
                  const patient = appointmentPatient(a);
                  return (
                    <Table.Tr key={a.id} style={{ opacity: a.status === 'cancelled' ? 0.5 : 1 }}>
                      <Table.Td>
                        <Text size="sm" fw={600}>{formatTime(a.start)}</Text>
                        <Text size="xs" c="dimmed">{a.minutesDuration ?? ''} min</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" fw={500} style={{ cursor: 'pointer' }} c="blue" onClick={() => navigate(`/patients/${patient?.reference?.split('/')[1]}`)}>
                          {patient?.display}
                        </Text>
                      </Table.Td>
                      <Table.Td>{a.appointmentType?.text}</Table.Td>
                      <Table.Td>{a.description}</Table.Td>
                      <Table.Td>{appointmentPractitioner(a)?.display}</Table.Td>
                      <Table.Td><StatusBadge status={a.status} /></Table.Td>
                      <Table.Td>
                        <Group gap={4} justify="flex-end" wrap="nowrap">
                          {a.status === 'booked' && <Button size="xs" variant="light" color="teal" onClick={() => setStatus(a, 'arrived')}>Check in</Button>}
                          {(a.status === 'booked' || a.status === 'arrived') && <Button size="xs" variant="light" onClick={() => startVisit(a)}>Start visit</Button>}
                          {nextStatuses(a.status).length > 0 && (
                            <Menu position="bottom-end">
                              <Menu.Target><Button size="xs" variant="subtle">More</Button></Menu.Target>
                              <Menu.Dropdown>
                                {nextStatuses(a.status).map((s) => <Menu.Item key={s} onClick={() => setStatus(a, s)}>Mark {s}</Menu.Item>)}
                              </Menu.Dropdown>
                            </Menu>
                          )}
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Card>
      <Modal opened={adding} onClose={() => setAdding(false)} title="New appointment" size="lg">
        {adding && (
          <Stack>
            <AppointmentForm
              defaultStart={day.toDateString() === new Date().toDateString() ? undefined : new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9)}
              onSaved={() => {
                setAdding(false);
                notifySuccess('Appointment booked');
                reload();
              }}
            />
          </Stack>
        )}
      </Modal>
    </>
  );
}
