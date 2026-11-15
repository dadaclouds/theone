import { Alert, Badge, Button, Card, Group, Modal, NumberInput, SegmentedControl, Stack, Table, Text, Textarea, TextInput } from '@mantine/core';
import type { Goal, Reference, ServiceRequest, Task } from '@medplum/fhirtypes';
import { useMedplum, useMedplumProfile } from '@medplum/react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { EmptyState, PageHeader, StatusBadge } from '../components/common';
import { notifyCountsChanged } from '../components/Shell';
import { notifyError, notifySuccess } from '../components/notify';
import { CM_CODES, CM_SYSTEMS } from '../lib/casemgmt/constants';
import { getFocosClient } from '../lib/casemgmt/focosConfig';
import { identifierValue, serviceCode } from '../lib/casemgmt/mapping';
import { approveAuthorization, denyAuthorization } from '../lib/casemgmt/workflow';
import { formatDate, formatDateTime, profileDisplay } from '../lib/fhir';
import { useAsync } from '../lib/hooks';

interface Row {
  task: Task;
  request: ServiceRequest;
  goals: Goal[];
}

export function ApprovalsPage() {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const [scope, setScope] = useState('pending');
  const [deciding, setDeciding] = useState<{ row: Row; action: 'approve' | 'deny' }>();
  const [lastAction, setLastAction] = useState<'approve' | 'deny'>('approve');

  const { data = [], reload } = useAsync(async () => {
    const tasks = await medplum.searchResources(
      'Task',
      { code: `${CM_SYSTEMS.CASE_MGMT}|${CM_CODES.AUTH_APPROVAL}`, status: scope === 'pending' ? 'requested,in-progress' : 'completed,rejected', _sort: '-_lastUpdated', _count: '100' },
      { cache: 'no-cache' }
    );
    return Promise.all(tasks.map(async (task): Promise<Row> => {
      const request = await medplum.readReference(task.focus as Reference<ServiceRequest>);
      const goals = await Promise.all((request.supportingInfo ?? []).filter((r) => r.reference?.startsWith('Goal/')).map((r) => medplum.readReference(r as Reference<Goal>)));
      return { task, request, goals };
    }));
  }, [medplum, scope]);

  return (
    <>
      <PageHeader
        title="Service authorization approvals"
        subtitle="Division of Developmental Disabilities review queue"
        actions={<SegmentedControl value={scope} onChange={setScope} data={[{ value: 'pending', label: 'Pending' }, { value: 'decided', label: 'Decided' }]} />}
      />
      <Card withBorder>
        {data.length === 0 ? <EmptyState>{scope === 'pending' ? 'No authorizations waiting for review' : 'No decisions yet'}</EmptyState> : (
          <Table.ScrollContainer minWidth={900}>
            <Table verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr><Table.Th>Participant</Table.Th><Table.Th>Service</Table.Th><Table.Th>Units</Table.Th><Table.Th>Plan period</Table.Th><Table.Th>Supports goals</Table.Th><Table.Th>Requested</Table.Th><Table.Th /></Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data.map((row) => (
                  <Table.Tr key={row.task.id} data-testid="approval-row">
                    <Table.Td>
                      <Text size="sm" c="blue" style={{ cursor: 'pointer' }} onClick={() => navigate(`/patients/${row.request.subject.reference?.split('/')[1]}/support-plan`)}>{row.request.subject.display}</Text>
                    </Table.Td>
                    <Table.Td><Text size="sm" fw={500}>{serviceCode(row.request)} · {row.request.code?.text}</Text><Text size="xs" c="dimmed">{row.request.performer?.[0]?.display}</Text></Table.Td>
                    <Table.Td>{row.request.quantityQuantity?.value}</Table.Td>
                    <Table.Td>{formatDate(row.request.occurrencePeriod?.start)} – {formatDate(row.request.occurrencePeriod?.end)}</Table.Td>
                    <Table.Td><Text size="xs">{row.goals.map((g) => g.description.text).join('; ')}</Text></Table.Td>
                    <Table.Td><Text size="xs">{row.task.requester?.display}<br />{formatDateTime(row.task.authoredOn)}</Text></Table.Td>
                    <Table.Td>
                      {scope === 'pending' ? (
                        <Group gap={4} wrap="nowrap">
                          <Button size="xs" color="green" onClick={() => { setLastAction('approve'); setDeciding({ row, action: 'approve' }); }}>Approve</Button>
                          <Button size="xs" variant="subtle" color="red" onClick={() => { setLastAction('deny'); setDeciding({ row, action: 'deny' }); }}>Deny</Button>
                        </Group>
                      ) : (
                        <Stack gap={2} align="flex-end">
                          <StatusBadge status={row.task.status} />
                          {identifierValue(row.request, CM_SYSTEMS.AUTHORIZATION_NUMBER) && <Badge variant="light" size="xs">{identifierValue(row.request, CM_SYSTEMS.AUTHORIZATION_NUMBER)}</Badge>}
                        </Stack>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Card>
      <Modal opened={!!deciding} onClose={() => setDeciding(undefined)} title={lastAction === 'approve' ? 'Approve authorization' : 'Deny authorization'}>
        {deciding && <DecisionForm row={deciding.row} action={deciding.action} onDone={() => { setDeciding(undefined); reload(); notifyCountsChanged(); }} />}
      </Modal>
    </>
  );
}

function DecisionForm({ row, action, onDone }: { row: Row; action: 'approve' | 'deny'; onDone: () => void }) {
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const focos = getFocosClient();
  const [units, setUnits] = useState<number | string>(row.request.quantityQuantity?.value ?? 0);
  const [start, setStart] = useState(row.request.occurrencePeriod?.start?.slice(0, 10) ?? '');
  const [end, setEnd] = useState(row.request.occurrencePeriod?.end?.slice(0, 10) ?? '');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (): Promise<void> => {
    setSaving(true);
    try {
      if (action === 'approve') {
        if (!focos) throw new Error('FOCOS integration is not configured');
        const sr = await approveAuthorization(medplum, focos, row.task, { units: Number(units), start, end, reviewer: profileDisplay(profile) });
        notifySuccess(`Approved ${identifierValue(sr, CM_SYSTEMS.AUTHORIZATION_NUMBER)} and sent to FOCOS`);
      } else {
        await denyAuthorization(medplum, row.task, reason.trim(), profileDisplay(profile));
        notifySuccess('Authorization denied');
      }
      onDone();
    } catch (err) {
      notifyError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack>
      <Text size="sm"><b>{row.request.subject.display}</b> · {serviceCode(row.request)} {row.request.code?.text}</Text>
      {action === 'approve' ? (
        <>
          <NumberInput label="Approved units (15 min)" min={1} value={units} onChange={setUnits} />
          <Group grow>
            <TextInput label="Start" type="date" value={start} onChange={(e) => setStart(e.currentTarget.value)} />
            <TextInput label="End" type="date" value={end} onChange={(e) => setEnd(e.currentTarget.value)} />
          </Group>
          <Alert color="blue">On approval the authorization and its goals are created in FOCOS Connect, ready for scheduling and EVV.</Alert>
        </>
      ) : (
        <Textarea label="Reason" required value={reason} onChange={(e) => setReason(e.currentTarget.value)} />
      )}
      <Group justify="flex-end">
        <Button color={action === 'approve' ? 'green' : 'red'} loading={saving} onClick={submit} disabled={action === 'approve' ? !Number(units) || !start || !end : !reason.trim()}>
          {action === 'approve' ? 'Approve and send to FOCOS' : 'Deny'}
        </Button>
      </Group>
    </Stack>
  );
}
