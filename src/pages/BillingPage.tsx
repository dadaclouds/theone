import { Button, Card, Group, SegmentedControl, SimpleGrid, Table, Text } from '@mantine/core';
import { IconDownload } from '@tabler/icons-react';
import type { Claim } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { EmptyState, PageHeader, StatusBadge } from '../components/common';
import { notifyError, notifySuccess } from '../components/notify';
import { claimTotal } from '../lib/billing';
import { formatDate } from '../lib/fhir';
import { useAsync } from '../lib/hooks';

export function BillingPage() {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const [status, setStatus] = useState('draft');

  const { data: claims = [], reload } = useAsync(
    () => medplum.searchResources('Claim', { ...(status === 'all' ? {} : { status }), _sort: '-created', _count: '500' }, { cache: 'no-cache' }),
    [medplum, status]
  );
  const total = claims.reduce((s, c) => s + claimTotal(c), 0);

  const update = async (c: Claim, next: Claim['status']): Promise<void> => {
    try {
      await medplum.updateResource<Claim>({ ...c, status: next });
      notifySuccess(next === 'active' ? 'Claim submitted' : `Claim ${next}`);
      reload();
    } catch (err) {
      notifyError(err);
    }
  };

  const exportCsv = (): void => {
    const rows = [['Claim ID', 'Service date', 'Patient', 'Provider', 'CPT', 'ICD-10', 'Amount', 'Status']];
    for (const c of claims) {
      rows.push([
        c.id ?? '',
        c.item?.[0]?.servicedDate ?? '',
        c.patient.display ?? '',
        c.provider.display ?? '',
        c.item?.map((i) => i.productOrService.coding?.[0]?.code).join(' ') ?? '',
        c.diagnosis?.map((d) => d.diagnosisCodeableConcept?.coding?.[0]?.code ?? '').join(' ') ?? '',
        claimTotal(c).toFixed(2),
        c.status,
      ]);
    }
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `claims-${status}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        title="Billing"
        subtitle="Claims generated from signed visits"
        actions={<Button variant="default" leftSection={<IconDownload size={16} />} onClick={exportCsv} disabled={claims.length === 0}>Export CSV</Button>}
      />
      <SimpleGrid cols={{ base: 1, sm: 3 }} mb="md">
        <Card withBorder><Text size="xs" c="dimmed" tt="uppercase" fw={600}>Claims</Text><Text fw={700} size="xl">{claims.length}</Text></Card>
        <Card withBorder><Text size="xs" c="dimmed" tt="uppercase" fw={600}>Total charges</Text><Text fw={700} size="xl">${total.toFixed(2)}</Text></Card>
        <Card withBorder><Text size="xs" c="dimmed" tt="uppercase" fw={600}>Average</Text><Text fw={700} size="xl">${claims.length ? (total / claims.length).toFixed(2) : '0.00'}</Text></Card>
      </SimpleGrid>
      <Card withBorder>
        <SegmentedControl mb="sm" value={status} onChange={setStatus} data={[{ value: 'draft', label: 'Ready to submit' }, { value: 'active', label: 'Submitted' }, { value: 'cancelled', label: 'Cancelled' }, { value: 'all', label: 'All' }]} />
        {claims.length === 0 ? (
          <EmptyState>No claims</EmptyState>
        ) : (
          <Table.ScrollContainer minWidth={800}>
            <Table verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Service date</Table.Th>
                  <Table.Th>Patient</Table.Th>
                  <Table.Th>Provider</Table.Th>
                  <Table.Th>CPT</Table.Th>
                  <Table.Th>ICD-10</Table.Th>
                  <Table.Th>Payer</Table.Th>
                  <Table.Th>Amount</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {claims.map((c) => (
                  <Table.Tr key={c.id}>
                    <Table.Td>{formatDate(c.item?.[0]?.servicedDate ?? c.created)}</Table.Td>
                    <Table.Td><Text size="sm" c="blue" style={{ cursor: 'pointer' }} onClick={() => navigate(`/patients/${c.patient.reference?.split('/')[1]}/billing`)}>{c.patient.display}</Text></Table.Td>
                    <Table.Td>{c.provider.display}</Table.Td>
                    <Table.Td>{c.item?.map((i) => i.productOrService.coding?.[0]?.code).join(', ')}</Table.Td>
                    <Table.Td>{c.diagnosis?.map((d) => d.diagnosisCodeableConcept?.coding?.[0]?.code ?? d.diagnosisCodeableConcept?.text).join(', ')}</Table.Td>
                    <Table.Td>{c.insurance?.[0]?.coverage?.display}</Table.Td>
                    <Table.Td fw={500}>${claimTotal(c).toFixed(2)}</Table.Td>
                    <Table.Td><StatusBadge status={c.status} /></Table.Td>
                    <Table.Td>
                      {c.status === 'draft' && (
                        <Group gap={4} wrap="nowrap">
                          <Button size="xs" variant="light" onClick={() => update(c, 'active')}>Submit</Button>
                          <Button size="xs" variant="subtle" color="red" onClick={() => update(c, 'cancelled')}>Void</Button>
                        </Group>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Card>
    </>
  );
}
