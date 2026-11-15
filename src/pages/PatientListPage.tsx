import { Button, Card, Group, Pagination, Skeleton, Table, Text, TextInput } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconPlus, IconSearch } from '@tabler/icons-react';
import type { Bundle, Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { EmptyState, PageHeader } from '../components/common';
import { formatDate, patientAge, patientMrn, patientName } from '../lib/fhir';
import { useAsync } from '../lib/hooks';
import { buildPatientQuery } from '../lib/search';

const PAGE_SIZE = 20;

export function PatientListPage() {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [debounced] = useDebouncedValue(query, 250);
  const [page, setPage] = useState(1);

  const { data, loading } = useAsync<Bundle<Patient>>(
    () =>
      medplum.search(
        'Patient',
        {
          ...(debounced.trim() ? buildPatientQuery(debounced) : {}),
          _sort: 'family,given',
          _count: String(PAGE_SIZE),
          _offset: String((page - 1) * PAGE_SIZE),
          _total: 'accurate',
        },
        { cache: 'no-cache' }
      ),
    [medplum, debounced, page]
  );

  const patients = data?.entry?.map((e) => e.resource as Patient) ?? [];
  const total = data?.total ?? 0;

  return (
    <>
      <PageHeader
        title="Participants"
        subtitle={`${total} participant${total === 1 ? '' : 's'}`}
        actions={
          <Button leftSection={<IconPlus size={16} />} onClick={() => navigate('/patients/new')}>
            Register participant
          </Button>
        }
      />
      <Card withBorder padding={0}>
        <Group p="sm">
          <TextInput
            style={{ flex: 1 }}
            leftSection={<IconSearch size={16} />}
            placeholder="Filter by name, MRN, Medicaid ID or date of birth"
            value={query}
            onChange={(e) => {
              setQuery(e.currentTarget.value);
              setPage(1);
            }}
            aria-label="Filter participants"
          />
        </Group>
        <Table.ScrollContainer minWidth={700}>
          <Table highlightOnHover verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Date of birth</Table.Th>
                <Table.Th>Sex</Table.Th>
                <Table.Th>MRN</Table.Th>
                <Table.Th>Phone</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {loading && !data
                ? Array.from({ length: 5 }).map((_, i) => (
                    <Table.Tr key={i}>
                      <Table.Td colSpan={5}>
                        <Skeleton h={20} />
                      </Table.Td>
                    </Table.Tr>
                  ))
                : patients.map((p) => (
                    <Table.Tr key={p.id} className="clickable-row" onClick={() => navigate(`/patients/${p.id}`)}>
                      <Table.Td fw={500}>{patientName(p)}</Table.Td>
                      <Table.Td>
                        {formatDate(p.birthDate)}{' '}
                        <Text span c="dimmed" size="xs">
                          {patientAge(p)}
                        </Text>
                      </Table.Td>
                      <Table.Td tt="capitalize">{p.gender}</Table.Td>
                      <Table.Td>{patientMrn(p)}</Table.Td>
                      <Table.Td>{p.telecom?.find((t) => t.system === 'phone')?.value}</Table.Td>
                    </Table.Tr>
                  ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {!loading && patients.length === 0 && <EmptyState>No participants found</EmptyState>}
        {total > PAGE_SIZE && (
          <Group justify="center" p="sm">
            <Pagination total={Math.ceil(total / PAGE_SIZE)} value={page} onChange={setPage} />
          </Group>
        )}
      </Card>
    </>
  );
}
