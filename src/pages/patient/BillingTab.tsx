import { Card, Group, Stack, Table, Text } from '@mantine/core';
import { useMedplum } from '@medplum/react';
import { EmptyState, SectionCard, StatusBadge } from '../../components/common';
import { claimTotal } from '../../lib/billing';
import { formatDate } from '../../lib/fhir';
import { useAsync } from '../../lib/hooks';
import { useChart } from './PatientContext';

export function BillingTab() {
  const medplum = useMedplum();
  const { patientRef, coverage } = useChart();
  const { data = [] } = useAsync(
    () => medplum.searchResources('Claim', { patient: patientRef.reference as string, _sort: '-created', _count: '100' }, { cache: 'no-cache' }),
    [medplum, patientRef.reference]
  );
  const total = data.filter((c) => c.status !== 'cancelled').reduce((s, c) => s + claimTotal(c), 0);

  return (
    <Stack>
      <SectionCard title="Coverage">
        {coverage ? (
          <Group gap="xl">
            <div><Text size="xs" c="dimmed">Payer</Text><Text fw={500}>{coverage.payor?.[0]?.display}</Text></div>
            <div><Text size="xs" c="dimmed">Member ID</Text><Text fw={500}>{coverage.subscriberId ?? '–'}</Text></div>
            <div><Text size="xs" c="dimmed">Group</Text><Text fw={500}>{coverage.class?.[0]?.value ?? '–'}</Text></div>
            <div><Text size="xs" c="dimmed">Status</Text><StatusBadge status={coverage.status} /></div>
          </Group>
        ) : (
          <Text size="sm" c="dimmed">Self-pay (no insurance on file). Add insurance via Edit demographics.</Text>
        )}
      </SectionCard>
      <Card withBorder>
        <Group justify="space-between" mb="sm">
          <Text fw={600}>Claims</Text>
          <Text size="sm" c="dimmed">Total billed: ${total.toFixed(2)}</Text>
        </Group>
        {data.length === 0 ? (
          <EmptyState>No claims. Claims are generated when a visit is signed.</EmptyState>
        ) : (
          <Table.ScrollContainer minWidth={600}>
            <Table verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Date</Table.Th>
                  <Table.Th>Services</Table.Th>
                  <Table.Th>Diagnoses</Table.Th>
                  <Table.Th>Amount</Table.Th>
                  <Table.Th>Status</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data.map((c) => (
                  <Table.Tr key={c.id}>
                    <Table.Td>{formatDate(c.item?.[0]?.servicedDate ?? c.created)}</Table.Td>
                    <Table.Td>{c.item?.map((i) => i.productOrService.coding?.[0]?.code).join(', ')}</Table.Td>
                    <Table.Td>{c.diagnosis?.map((d) => d.diagnosisCodeableConcept?.coding?.[0]?.code ?? d.diagnosisCodeableConcept?.text).join(', ')}</Table.Td>
                    <Table.Td>${claimTotal(c).toFixed(2)}</Table.Td>
                    <Table.Td><StatusBadge status={c.status} /></Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Card>
    </Stack>
  );
}
