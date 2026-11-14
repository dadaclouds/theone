import { Accordion, Badge, Button, Group, Modal, Stack, Table, Text } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import type { DiagnosticReport, Observation, ServiceRequest } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useState } from 'react';
import { LabOrderForm } from '../../components/clinical/LabOrderForm';
import { LabResultForm } from '../../components/clinical/LabResultForm';
import { EmptyState, SectionCard, StatusBadge } from '../../components/common';
import { notifyError, notifySuccess } from '../../components/notify';
import { conceptText, formatDate, formatDateTime } from '../../lib/fhir';
import { useAsync } from '../../lib/hooks';
import { isAbnormal, observationFlag } from '../../lib/labs';
import { useChart } from './PatientContext';

export function LabsTab() {
  const medplum = useMedplum();
  const { patientRef, problems } = useChart();
  const [ordering, setOrdering] = useState(false);
  const [resulting, setResulting] = useState<ServiceRequest>();
  const ref = patientRef.reference as string;

  const { data, reload } = useAsync(async () => {
    const opts = { cache: 'no-cache' as const };
    const [orders, bundle] = await Promise.all([
      medplum.searchResources('ServiceRequest', { subject: ref, status: 'active,draft,on-hold', _sort: '-authored', _count: '100' }, opts),
      medplum.search('DiagnosticReport', { subject: ref, _sort: '-date', _count: '100', _include: 'DiagnosticReport:result' }, opts),
    ]);
    const entries = (bundle.entry ?? []).map((e) => e.resource as DiagnosticReport | Observation | undefined);
    const reports = entries.filter((r): r is DiagnosticReport => r?.resourceType === 'DiagnosticReport');
    const observations = new Map<string, Observation>();
    entries.forEach((r) => r?.resourceType === 'Observation' && observations.set(`Observation/${r.id}`, r));
    return { orders, reports, observations };
  }, [medplum, ref]);

  const cancel = async (order: ServiceRequest): Promise<void> => {
    try {
      await medplum.updateResource<ServiceRequest>({ ...order, status: 'revoked' });
      notifySuccess('Order cancelled');
      reload();
    } catch (err) {
      notifyError(err);
    }
  };

  return (
    <Stack>
      <SectionCard
        title="Pending orders"
        actions={
          <Button leftSection={<IconPlus size={16} />} onClick={() => setOrdering(true)}>
            Order labs
          </Button>
        }
      >
        {(data?.orders ?? []).length === 0 ? (
          <EmptyState>No pending orders</EmptyState>
        ) : (
          <Table.ScrollContainer minWidth={600}>
            <Table verticalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Test</Table.Th>
                  <Table.Th>Ordered</Table.Th>
                  <Table.Th>Priority</Table.Th>
                  <Table.Th>Ordering provider</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data?.orders.map((o) => (
                  <Table.Tr key={o.id}>
                    <Table.Td fw={500}>{conceptText(o.code)}</Table.Td>
                    <Table.Td>{formatDate(o.authoredOn)}</Table.Td>
                    <Table.Td><StatusBadge status={o.priority} /></Table.Td>
                    <Table.Td>{o.requester?.display}</Table.Td>
                    <Table.Td>
                      <Group gap={4} justify="flex-end" wrap="nowrap">
                        <Button size="xs" variant="light" onClick={() => setResulting(o)}>Enter results</Button>
                        <Button size="xs" variant="subtle" color="red" onClick={() => cancel(o)}>Cancel</Button>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </SectionCard>
      <SectionCard title="Results">
        {(data?.reports ?? []).length === 0 ? (
          <EmptyState>No results on file</EmptyState>
        ) : (
          <Accordion variant="separated" multiple defaultValue={data?.reports.slice(0, 1).map((r) => r.id as string)}>
            {data?.reports.map((r) => {
              const results = (r.result ?? []).map((ref) => data.observations.get(ref.reference as string)).filter((o): o is Observation => !!o);
              const abnormal = results.filter(isAbnormal).length;
              return (
                <Accordion.Item key={r.id} value={r.id as string}>
                  <Accordion.Control>
                    <Group justify="space-between" pr="sm">
                      <Text fw={500}>{conceptText(r.code)}</Text>
                      <Group gap="xs">
                        {abnormal > 0 && <Badge color="red">{abnormal} abnormal</Badge>}
                        <Text size="sm" c="dimmed">{formatDateTime(r.effectiveDateTime ?? r.issued)}</Text>
                      </Group>
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <ResultsTable observations={results} />
                    {r.conclusion && <Text size="sm" mt="xs"><b>Comment:</b> {r.conclusion}</Text>}
                  </Accordion.Panel>
                </Accordion.Item>
              );
            })}
          </Accordion>
        )}
      </SectionCard>
      <Modal opened={ordering} onClose={() => setOrdering(false)} title="Order labs" size="lg">
        {ordering && (
          <LabOrderForm
            patient={patientRef}
            diagnoses={problems.filter((p) => p.clinicalStatus?.coding?.[0]?.code === 'active')}
            onSaved={(r) => {
              setOrdering(false);
              notifySuccess(`${r.length} order(s) placed`);
              reload();
            }}
          />
        )}
      </Modal>
      <Modal opened={!!resulting} onClose={() => setResulting(undefined)} title="Enter results" size="xl">
        {resulting && (
          <LabResultForm
            order={resulting}
            onSaved={() => {
              setResulting(undefined);
              notifySuccess('Results filed and routed for review');
              reload();
            }}
          />
        )}
      </Modal>
    </Stack>
  );
}

export function ResultsTable({ observations }: { observations: Observation[] }) {
  return (
    <Table verticalSpacing={4}>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Analyte</Table.Th>
          <Table.Th>Value</Table.Th>
          <Table.Th>Reference range</Table.Th>
          <Table.Th>Flag</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {observations.map((o) => {
          const range = o.referenceRange?.[0];
          const flag = observationFlag(o);
          return (
            <Table.Tr key={o.id}>
              <Table.Td>{conceptText(o.code)}</Table.Td>
              <Table.Td fw={isAbnormal(o) ? 700 : undefined} c={isAbnormal(o) ? 'red' : undefined}>
                {o.valueQuantity ? `${o.valueQuantity.value} ${o.valueQuantity.unit ?? ''}` : o.valueString}
              </Table.Td>
              <Table.Td c="dimmed">
                {range ? `${range.low?.value ?? ''}${range.low && range.high ? ' – ' : range.high ? '< ' : range.low ? '> ' : ''}${range.high?.value ?? ''}` : ''}
              </Table.Td>
              <Table.Td>{flag && flag !== 'N' && <Badge size="sm" color="red">{flag}</Badge>}</Table.Td>
            </Table.Tr>
          );
        })}
      </Table.Tbody>
    </Table>
  );
}
