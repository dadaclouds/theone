import { Anchor, Badge, Card, Grid, Group, SimpleGrid, Skeleton, Stack, Table, Text, ThemeIcon } from '@mantine/core';
import { IconCalendar, IconChecklist, IconFileText, IconInbox } from '@tabler/icons-react';
import { getReferenceString } from '@medplum/core';
import type { Appointment, DocumentReference, Encounter, Patient, Task } from '@medplum/fhirtypes';
import { useMedplum, useMedplumProfile } from '@medplum/react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { EmptyState, PageHeader, SectionCard, StatusBadge } from '../components/common';
import { SYSTEMS, TASK_CODES } from '../lib/constants';
import { dayBounds, formatDateTime, formatTime, patientName, profileDisplay } from '../lib/fhir';
import { useAsync } from '../lib/hooks';
import { toQuery } from '../lib/search';

const OPEN_TASK = 'requested,received,accepted,in-progress,ready';

export function DashboardPage() {
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const navigate = useNavigate();
  const me = profile ? getReferenceString(profile as Patient) : '';

  const { data, loading } = useAsync(async () => {
    const [start, end] = dayBounds(new Date());
    const [appointments, tasks, reviews, drafts] = await Promise.all([
      medplum.searchResources('Appointment', toQuery({ date: [`ge${start}`, `lt${end}`], _sort: 'date', _count: '50' }), { cache: 'no-cache' }),
      medplum.searchResources('Task', { status: OPEN_TASK, owner: me, 'code:not': `${SYSTEMS.TASK_TYPE}|${TASK_CODES.REVIEW_RESULT}`, _sort: '-_lastUpdated', _count: '50' }, { cache: 'no-cache' }),
      medplum.search('Task', { status: OPEN_TASK, code: `${SYSTEMS.TASK_TYPE}|${TASK_CODES.REVIEW_RESULT}`, _summary: 'count' }, { cache: 'no-cache' }),
      medplum.searchResources('DocumentReference', { author: me, category: 'clinical-note', _sort: '-_lastUpdated', _count: '100' }, { cache: 'no-cache' }),
    ]);
    const inProgress = await medplum.searchResources('Encounter', { status: 'in-progress', _count: '10', _sort: '-date' }, { cache: 'no-cache' });
    return { appointments, tasks, reviewCount: reviews.total ?? 0, drafts: drafts.filter((d) => d.docStatus === 'preliminary').slice(0, 10), inProgress };
  }, [medplum, me]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <Stack>
      <PageHeader title={`${greeting}, ${profileDisplay(profile) ?? ''}`} subtitle={new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} />
      <SimpleGrid cols={{ base: 2, md: 4 }}>
        <Stat icon={<IconCalendar size={20} />} color="blue" label="Appointments today" value={data?.appointments.length} onClick={() => navigate('/schedule')} />
        <Stat icon={<IconInbox size={20} />} color="red" label="Results to review" value={data?.reviewCount} onClick={() => navigate('/inbox')} />
        <Stat icon={<IconChecklist size={20} />} color="orange" label="My open tasks" value={data?.tasks.length} onClick={() => navigate('/tasks')} />
        <Stat icon={<IconFileText size={20} />} color="grape" label="Unsigned notes" value={data?.drafts.length} />
      </SimpleGrid>
      <Grid>
        <Grid.Col span={{ base: 12, lg: 7 }}>
          <SectionCard title="Today's schedule" actions={<Anchor size="sm" onClick={() => navigate('/schedule')}>Open schedule</Anchor>}>
            {loading && !data ? <Skeleton h={120} /> : <TodaySchedule appointments={data?.appointments ?? []} />}
          </SectionCard>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 5 }}>
          <Stack>
            <SectionCard title="Visits in progress">
              {(data?.inProgress ?? []).length === 0 ? (
                <EmptyState>No open visits</EmptyState>
              ) : (
                <Stack gap={6}>
                  {data?.inProgress.map((e) => <EncounterLink key={e.id} encounter={e} />)}
                </Stack>
              )}
            </SectionCard>
            <SectionCard title="My open tasks" actions={<Anchor size="sm" onClick={() => navigate('/tasks')}>All tasks</Anchor>}>
              {(data?.tasks ?? []).length === 0 ? (
                <EmptyState>Nothing outstanding</EmptyState>
              ) : (
                <Stack gap={6}>
                  {data?.tasks.slice(0, 8).map((t) => <TaskLine key={t.id} task={t} />)}
                </Stack>
              )}
            </SectionCard>
            <SectionCard title="Unsigned notes">
              {(data?.drafts ?? []).length === 0 ? (
                <EmptyState>All notes signed</EmptyState>
              ) : (
                <Stack gap={6}>
                  {data?.drafts.map((d) => <DraftLink key={d.id} doc={d} />)}
                </Stack>
              )}
            </SectionCard>
          </Stack>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}

function Stat({ icon, label, value, color, onClick }: { icon: ReactNode; label: string; value?: number; color: string; onClick?: () => void }) {
  return (
    <Card withBorder padding="md" radius="md" onClick={onClick} style={{ cursor: onClick ? 'pointer' : undefined }}>
      <Group justify="space-between" wrap="nowrap">
        <div>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
            {label}
          </Text>
          <Text fw={700} size="xl">
            {value ?? '–'}
          </Text>
        </div>
        <ThemeIcon variant="light" color={color} size="lg" radius="md">
          {icon}
        </ThemeIcon>
      </Group>
    </Card>
  );
}

function TodaySchedule({ appointments }: { appointments: Appointment[] }) {
  const navigate = useNavigate();
  if (appointments.length === 0) {
    return <EmptyState>No appointments scheduled today</EmptyState>;
  }
  return (
    <Table.ScrollContainer minWidth={420}>
      <Table highlightOnHover verticalSpacing="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Time</Table.Th>
            <Table.Th>Patient</Table.Th>
            <Table.Th>Visit</Table.Th>
            <Table.Th>Status</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {appointments.map((a) => {
            const patient = a.participant.find((p) => p.actor?.reference?.startsWith('Patient/'))?.actor;
            return (
              <Table.Tr key={a.id} className="clickable-row" onClick={() => patient && navigate(`/${patient.reference?.replace('Patient', 'patients')}`)}>
                <Table.Td>{formatTime(a.start)}</Table.Td>
                <Table.Td fw={500}>{patient?.display}</Table.Td>
                <Table.Td>{a.appointmentType?.text ?? a.description}</Table.Td>
                <Table.Td>
                  <StatusBadge status={a.status} />
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

function EncounterLink({ encounter }: { encounter: Encounter }) {
  const navigate = useNavigate();
  const patientId = encounter.subject?.reference?.split('/')[1];
  return (
    <Group justify="space-between" wrap="nowrap">
      <Anchor size="sm" onClick={() => navigate(`/patients/${patientId}/encounters/${encounter.id}`)}>
        {encounter.subject?.display ?? 'Patient'} — {encounter.type?.[0]?.text ?? 'Visit'}
      </Anchor>
      <Text size="xs" c="dimmed">
        {formatDateTime(encounter.period?.start)}
      </Text>
    </Group>
  );
}

function TaskLine({ task }: { task: Task }) {
  const navigate = useNavigate();
  return (
    <Group justify="space-between" wrap="nowrap">
      <Anchor size="sm" lineClamp={1} onClick={() => navigate('/tasks')}>
        {task.description ?? task.code?.text ?? 'Task'}
      </Anchor>
      <Group gap={4} wrap="nowrap">
        {task.for?.display && (
          <Text size="xs" c="dimmed">
            {task.for.display}
          </Text>
        )}
        {task.priority && task.priority !== 'routine' && <Badge size="xs" color="red">{task.priority}</Badge>}
      </Group>
    </Group>
  );
}

function DraftLink({ doc }: { doc: DocumentReference }) {
  const navigate = useNavigate();
  const patientId = doc.subject?.reference?.split('/')[1];
  const encounterId = doc.context?.encounter?.[0]?.reference?.split('/')[1];
  return (
    <Group justify="space-between" wrap="nowrap">
      <Anchor
        size="sm"
        onClick={() => navigate(encounterId ? `/patients/${patientId}/encounters/${encounterId}` : `/patients/${patientId}/notes`)}
      >
        {doc.subject?.display ?? patientName(undefined)} — {doc.description}
      </Anchor>
      <StatusBadge status={doc.docStatus} size="xs" />
    </Group>
  );
}
