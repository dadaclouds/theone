import { Badge, Button, Card, Group, Menu, Modal, SegmentedControl, Select, Stack, Table, Text, Textarea, TextInput } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import type { Patient, Reference, Task } from '@medplum/fhirtypes';
import { useMedplum, useMedplumProfile } from '@medplum/react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { PatientSearch } from '../components/PatientSearch';
import { EmptyState, PageHeader, StatusBadge } from '../components/common';
import { notifyError, notifySuccess } from '../components/notify';
import { SYSTEMS, TASK_CODES, WORK_QUEUE_EXCLUDED } from '../lib/constants';
import { toQuery } from '../lib/search';
import { formatDate, patientName, profileDisplay } from '../lib/fhir';
import { useAsync } from '../lib/hooks';

const OPEN = 'requested,received,accepted,in-progress,ready';
const TYPES = [
  { value: TASK_CODES.GENERAL, label: 'General' },
  { value: TASK_CODES.FOLLOW_UP, label: 'Follow-up call' },
  { value: TASK_CODES.REFILL_REQUEST, label: 'Refill request' },
];

export function TasksPage() {
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const navigate = useNavigate();
  const [scope, setScope] = useState('open');
  const [creating, setCreating] = useState(false);

  const { data: tasks = [], reload } = useAsync(
    () =>
      medplum.searchResources(
        'Task',
        toQuery({ 'code:not': WORK_QUEUE_EXCLUDED, status: scope === 'open' ? OPEN : 'completed,cancelled', _sort: '-_lastUpdated', _count: '200' }),
        { cache: 'no-cache' }
      ),
    [medplum, scope]
  );

  const setStatus = async (t: Task, status: Task['status']): Promise<void> => {
    try {
      await medplum.updateResource<Task>({
        ...t,
        status,
        lastModified: new Date().toISOString(),
        owner: status === 'in-progress' && !t.owner && profile ? { reference: `${profile.resourceType}/${profile.id}`, display: profileDisplay(profile) } : t.owner,
      });
      notifySuccess(`Task ${status}`);
      reload();
    } catch (err) {
      notifyError(err);
    }
  };

  const overdue = (t: Task): boolean => !!t.restriction?.period?.end && new Date(t.restriction.period.end) < new Date() && OPEN.includes(t.status);

  return (
    <>
      <PageHeader
        title="Tasks"
        subtitle="Care-team work queue"
        actions={
          <>
            <SegmentedControl value={scope} onChange={setScope} data={[{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }]} />
            <Button leftSection={<IconPlus size={16} />} onClick={() => setCreating(true)}>New task</Button>
          </>
        }
      />
      <Card withBorder>
        {tasks.length === 0 ? (
          <EmptyState>No tasks</EmptyState>
        ) : (
          <Table.ScrollContainer minWidth={760}>
            <Table verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Task</Table.Th>
                  <Table.Th>Patient</Table.Th>
                  <Table.Th>Assignee</Table.Th>
                  <Table.Th>Due</Table.Th>
                  <Table.Th>Priority</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {tasks.map((t) => (
                  <Table.Tr key={t.id}>
                    <Table.Td>
                      <Text size="sm" fw={500}>{t.description}</Text>
                      <Text size="xs" c="dimmed">{t.code?.text}</Text>
                    </Table.Td>
                    <Table.Td>
                      {t.for && <Text size="sm" c="blue" style={{ cursor: 'pointer' }} onClick={() => navigate(`/patients/${t.for?.reference?.split('/')[1]}`)}>{t.for.display}</Text>}
                    </Table.Td>
                    <Table.Td>{t.owner?.display ?? <Text size="sm" c="dimmed">Unassigned</Text>}</Table.Td>
                    <Table.Td>
                      {formatDate(t.restriction?.period?.end)} {overdue(t) && <Badge color="red" size="xs">Overdue</Badge>}
                    </Table.Td>
                    <Table.Td><StatusBadge status={t.priority} /></Table.Td>
                    <Table.Td><StatusBadge status={t.status} /></Table.Td>
                    <Table.Td>
                      {OPEN.includes(t.status) && (
                        <Menu position="bottom-end">
                          <Menu.Target><Button size="xs" variant="subtle">Update</Button></Menu.Target>
                          <Menu.Dropdown>
                            {t.status !== 'in-progress' && <Menu.Item onClick={() => setStatus(t, 'in-progress')}>Start (assign to me)</Menu.Item>}
                            <Menu.Item onClick={() => setStatus(t, 'completed')}>Complete</Menu.Item>
                            <Menu.Item color="red" onClick={() => setStatus(t, 'cancelled')}>Cancel</Menu.Item>
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
      </Card>
      <Modal opened={creating} onClose={() => setCreating(false)} title="New task" size="lg">
        {creating && <TaskForm onSaved={() => { setCreating(false); notifySuccess('Task created'); reload(); }} />}
      </Modal>
    </>
  );
}

function TaskForm({ onSaved }: { onSaved: () => void }) {
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const [description, setDescription] = useState('');
  const [type, setType] = useState<string>(TASK_CODES.GENERAL);
  const [patient, setPatient] = useState<Reference<Patient>>();
  const [owner, setOwner] = useState<string | null>(profile?.id ?? null);
  const [priority, setPriority] = useState<string>('routine');
  const [due, setDue] = useState('');
  const [note, setNote] = useState('');
  const { data: practitioners = [] } = useAsync(() => medplum.searchResources('Practitioner', { _count: '100' }), [medplum]);

  const save = async (): Promise<void> => {
    try {
      const ownerResource = practitioners.find((p) => p.id === owner);
      await medplum.createResource<Task>({
        resourceType: 'Task',
        status: 'requested',
        intent: 'order',
        priority: priority as Task['priority'],
        code: { coding: [{ system: SYSTEMS.TASK_TYPE, code: type, display: TYPES.find((t) => t.value === type)?.label }], text: TYPES.find((t) => t.value === type)?.label },
        description,
        for: patient,
        owner: ownerResource ? { reference: `Practitioner/${ownerResource.id}`, display: profileDisplay(ownerResource) } : undefined,
        requester: profile ? { reference: `${profile.resourceType}/${profile.id}`, display: profileDisplay(profile) } : undefined,
        authoredOn: new Date().toISOString(),
        restriction: due ? { period: { end: new Date(`${due}T23:59`).toISOString() } } : undefined,
        note: note.trim() ? [{ text: note.trim() }] : undefined,
      });
      onSaved();
    } catch (err) {
      notifyError(err);
    }
  };

  return (
    <Stack>
      <TextInput label="Description" required value={description} onChange={(e) => setDescription(e.currentTarget.value)} data-autofocus />
      <Group grow>
        <Select label="Type" data={TYPES} value={type} onChange={(v) => setType(v ?? TASK_CODES.GENERAL)} />
        <Select label="Priority" data={['routine', 'urgent', 'asap', 'stat']} value={priority} onChange={(v) => setPriority(v ?? 'routine')} />
      </Group>
      {patient ? (
        <Group justify="space-between"><Text size="sm">Patient: <b>{patient.display}</b></Text><Button size="xs" variant="subtle" onClick={() => setPatient(undefined)}>Clear</Button></Group>
      ) : (
        <PatientSearch label="Patient (optional)" onSelect={(p) => setPatient({ reference: `Patient/${p.id}`, display: patientName(p) })} />
      )}
      <Group grow>
        <Select label="Assign to" data={practitioners.map((p) => ({ value: p.id as string, label: profileDisplay(p) ?? '' }))} value={owner} onChange={setOwner} clearable comboboxProps={{ withinPortal: true }} />
        <TextInput label="Due date" type="date" value={due} onChange={(e) => setDue(e.currentTarget.value)} />
      </Group>
      <Textarea label="Notes" autosize minRows={2} value={note} onChange={(e) => setNote(e.currentTarget.value)} />
      <Group justify="flex-end"><Button onClick={save} disabled={!description.trim()}>Create task</Button></Group>
    </Stack>
  );
}
