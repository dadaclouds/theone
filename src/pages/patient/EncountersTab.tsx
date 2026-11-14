import { Button, Card, Group, Menu, Table, Text } from '@mantine/core';
import { IconChevronDown, IconPlayerPlay } from '@tabler/icons-react';
import { useMedplum } from '@medplum/react';
import { useNavigate } from 'react-router';
import { EmptyState, StatusBadge } from '../../components/common';
import { formatDateTime } from '../../lib/fhir';
import { useAsync } from '../../lib/hooks';
import { useChart } from './PatientContext';
import { useStartEncounter, VISIT_TYPES } from './useStartEncounter';

export function EncountersTab() {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const { patient, patientRef } = useChart();
  const start = useStartEncounter();
  const { data = [] } = useAsync(
    () => medplum.searchResources('Encounter', { subject: patientRef.reference as string, _sort: '-date', _count: '100' }, { cache: 'no-cache' }),
    [medplum, patientRef.reference]
  );

  return (
    <Card withBorder>
      <Group justify="space-between" mb="sm">
        <Text size="sm" c="dimmed">{data.length} encounter(s)</Text>
        <Menu position="bottom-end">
          <Menu.Target>
            <Button leftSection={<IconPlayerPlay size={16} />} rightSection={<IconChevronDown size={14} />}>
              New encounter
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            {[...VISIT_TYPES, 'Telephone encounter'].map((t) => (
              <Menu.Item key={t} onClick={() => start({ type: t })}>{t}</Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
      </Group>
      {data.length === 0 ? (
        <EmptyState>No encounters yet</EmptyState>
      ) : (
        <Table.ScrollContainer minWidth={600}>
          <Table highlightOnHover verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Date</Table.Th>
                <Table.Th>Type</Table.Th>
                <Table.Th>Reason</Table.Th>
                <Table.Th>Provider</Table.Th>
                <Table.Th>Status</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.map((e) => (
                <Table.Tr key={e.id} className="clickable-row" onClick={() => navigate(`/patients/${patient.id}/encounters/${e.id}`)}>
                  <Table.Td>{formatDateTime(e.period?.start)}</Table.Td>
                  <Table.Td fw={500}>{e.type?.[0]?.text}</Table.Td>
                  <Table.Td>{e.reasonCode?.map((r) => r.text).join(', ')}</Table.Td>
                  <Table.Td>{e.participant?.[0]?.individual?.display}</Table.Td>
                  <Table.Td><StatusBadge status={e.status} /></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Card>
  );
}
