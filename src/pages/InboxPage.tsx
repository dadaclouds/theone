import { Badge, Button, Card, Grid, Group, SegmentedControl, Stack, Text, Textarea, Title, UnstyledButton } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import type { DiagnosticReport, Observation, Task } from '@medplum/fhirtypes';
import { useMedplum, useMedplumProfile } from '@medplum/react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { EmptyState, PageHeader, StatusBadge } from '../components/common';
import { notifyError, notifySuccess } from '../components/notify';
import { SYSTEMS, TASK_CODES } from '../lib/constants';
import { conceptText, formatDateTime, profileDisplay } from '../lib/fhir';
import { useAsync } from '../lib/hooks';
import { isAbnormal } from '../lib/labs';
import { ResultsTable } from './patient/LabsTab';

const OPEN = 'requested,received,accepted,in-progress,ready';

export function InboxPage() {
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const [scope, setScope] = useState('mine');
  const [selectedId, setSelectedId] = useState<string>();

  const { data: tasks = [], reload } = useAsync(
    () =>
      medplum.searchResources(
        'Task',
        {
          code: `${SYSTEMS.TASK_TYPE}|${TASK_CODES.REVIEW_RESULT}`,
          status: OPEN,
          _sort: '-_lastUpdated',
          _count: '100',
          ...(scope === 'mine' && profile ? { owner: `${profile.resourceType}/${profile.id}` } : {}),
        },
        { cache: 'no-cache' }
      ),
    [medplum, scope, profile?.id]
  );
  const sorted = [...tasks].sort((a, b) => (a.priority === 'urgent' ? -1 : 0) - (b.priority === 'urgent' ? -1 : 0));
  const selected = sorted.find((t) => t.id === selectedId) ?? sorted[0];

  return (
    <>
      <PageHeader title="Results inbox" subtitle={`${tasks.length} result(s) awaiting review`} actions={<SegmentedControl value={scope} onChange={setScope} data={[{ value: 'mine', label: 'Mine' }, { value: 'all', label: 'All providers' }]} />} />
      {tasks.length === 0 ? (
        <Card withBorder><EmptyState>Inbox zero — no results waiting for review.</EmptyState></Card>
      ) : (
        <Grid>
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Card withBorder padding="xs">
              <Stack gap={4}>
                {sorted.map((t) => (
                  <UnstyledButton key={t.id} p="xs" onClick={() => setSelectedId(t.id)} style={{ borderRadius: 6, background: t.id === selected?.id ? 'var(--mantine-color-blue-0)' : undefined }}>
                    <Group justify="space-between" wrap="nowrap">
                      <Text size="sm" fw={600}>{t.for?.display}</Text>
                      {t.priority === 'urgent' && <Badge color="red" size="xs">Abnormal</Badge>}
                    </Group>
                    <Text size="sm">{t.focus?.display}</Text>
                    <Text size="xs" c="dimmed">{formatDateTime(t.authoredOn)}</Text>
                  </UnstyledButton>
                ))}
              </Stack>
            </Card>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 8 }}>
            {selected && <ReviewPane key={selected.id} task={selected} reviewerName={profileDisplay(profile)} onDone={() => { setSelectedId(undefined); reload(); }} />}
          </Grid.Col>
        </Grid>
      )}
    </>
  );
}

function ReviewPane({ task, reviewerName, onDone }: { task: Task; reviewerName?: string; onDone: () => void }) {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const [comment, setComment] = useState('');
  const reportId = task.focus?.reference?.split('/')[1];
  const patientId = task.for?.reference?.split('/')[1];

  const { data } = useAsync(async () => {
    if (!reportId) return undefined;
    const report = await medplum.readResource('DiagnosticReport', reportId);
    const results = await Promise.all((report.result ?? []).map((r) => medplum.readReference(r) as Promise<Observation>));
    return { report, results };
  }, [medplum, reportId]);

  const complete = async (): Promise<void> => {
    try {
      await medplum.updateResource<Task>({
        ...task,
        status: 'completed',
        lastModified: new Date().toISOString(),
        note: [...(task.note ?? []), { text: `Reviewed by ${reviewerName ?? 'provider'}${comment.trim() ? `: ${comment.trim()}` : ''}`, time: new Date().toISOString() }],
      });
      if (data?.report && comment.trim()) {
        await medplum.updateResource<DiagnosticReport>({ ...data.report, conclusion: [data.report.conclusion, comment.trim()].filter(Boolean).join('\n') });
      }
      notifySuccess('Marked reviewed');
      onDone();
    } catch (err) {
      notifyError(err);
    }
  };

  const abnormal = data?.results.filter(isAbnormal).length ?? 0;
  return (
    <Card withBorder>
      <Group justify="space-between" mb="sm">
        <div>
          <Title order={4}>{conceptText(data?.report.code) || task.focus?.display}</Title>
          <Text size="sm" c="dimmed">{task.for?.display} · {formatDateTime(data?.report.effectiveDateTime)}</Text>
        </div>
        <Group gap="xs">
          {abnormal > 0 && <Badge color="red">{abnormal} abnormal</Badge>}
          <StatusBadge status={data?.report.status} />
        </Group>
      </Group>
      {data && <ResultsTable observations={data.results} />}
      {data?.report.conclusion && <Text size="sm" mt="xs"><b>Comment:</b> {data.report.conclusion}</Text>}
      <Textarea mt="md" label="Review comment (optional)" autosize minRows={2} value={comment} onChange={(e) => setComment(e.currentTarget.value)} />
      <Group justify="flex-end" mt="sm">
        <Button variant="default" onClick={() => navigate(`/patients/${patientId}/labs`)}>Open chart</Button>
        <Button variant="default" onClick={() => navigate(`/patients/${patientId}/messages`)}>Message patient</Button>
        <Button color="green" leftSection={<IconCheck size={16} />} onClick={complete}>Mark reviewed</Button>
      </Group>
    </Card>
  );
}
