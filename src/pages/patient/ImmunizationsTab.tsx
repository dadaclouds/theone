import { Button, Card, Group, Modal, Table, Text } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useMedplum } from '@medplum/react';
import { useState } from 'react';
import { ImmunizationForm } from '../../components/clinical/ImmunizationForm';
import { EmptyState, StatusBadge } from '../../components/common';
import { notifySuccess } from '../../components/notify';
import { SYSTEMS } from '../../lib/constants';
import { codeFrom, conceptText, formatDate } from '../../lib/fhir';
import { useAsync } from '../../lib/hooks';
import { useChart } from './PatientContext';

export function ImmunizationsTab() {
  const medplum = useMedplum();
  const { patientRef } = useChart();
  const [adding, setAdding] = useState(false);
  const { data = [], reload } = useAsync(
    () => medplum.searchResources('Immunization', { patient: patientRef.reference as string, _sort: '-date', _count: '200' }, { cache: 'no-cache' }),
    [medplum, patientRef.reference]
  );

  return (
    <Card withBorder>
      <Group justify="space-between" mb="sm">
        <Text size="sm" c="dimmed">{data.length} immunization record(s)</Text>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setAdding(true)}>
          Record immunization
        </Button>
      </Group>
      {data.length === 0 ? (
        <EmptyState>No immunizations recorded</EmptyState>
      ) : (
        <Table.ScrollContainer minWidth={600}>
          <Table verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Vaccine</Table.Th>
                <Table.Th>CVX</Table.Th>
                <Table.Th>Date</Table.Th>
                <Table.Th>Lot / Site</Table.Th>
                <Table.Th>Source</Table.Th>
                <Table.Th>Status</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.map((i) => (
                <Table.Tr key={i.id}>
                  <Table.Td fw={500}>{conceptText(i.vaccineCode)}</Table.Td>
                  <Table.Td>{codeFrom(i.vaccineCode, SYSTEMS.CVX)}</Table.Td>
                  <Table.Td>{formatDate(i.occurrenceDateTime)}</Table.Td>
                  <Table.Td>{[i.lotNumber, i.site?.text].filter(Boolean).join(' · ')}</Table.Td>
                  <Table.Td>{i.primarySource === false ? 'Historical' : 'Administered'}</Table.Td>
                  <Table.Td><StatusBadge status={i.status} /></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
      <Modal opened={adding} onClose={() => setAdding(false)} title="Record immunization" size="lg">
        {adding && (
          <ImmunizationForm
            patient={patientRef}
            onSaved={() => {
              setAdding(false);
              notifySuccess('Immunization recorded');
              reload();
            }}
          />
        )}
      </Modal>
    </Card>
  );
}
