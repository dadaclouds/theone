import { ActionIcon, Button, Card, Group, Menu, Modal, SegmentedControl, Table, Text } from '@mantine/core';
import { IconDots, IconPlus } from '@tabler/icons-react';
import type { Condition } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useState } from 'react';
import { ProblemForm } from '../../components/clinical/ProblemForm';
import { EmptyState, StatusBadge } from '../../components/common';
import { notifyError, notifySuccess } from '../../components/notify';
import { SYSTEMS } from '../../lib/constants';
import { codeFrom, conceptText, formatDate } from '../../lib/fhir';
import { useChart } from './PatientContext';

export function ProblemsTab() {
  const medplum = useMedplum();
  const { problems, patientRef, refresh } = useChart();
  const [filter, setFilter] = useState('active');
  const [editing, setEditing] = useState<Condition | 'new'>();

  const status = (c: Condition): string => c.clinicalStatus?.coding?.[0]?.code ?? 'unknown';
  const isError = (c: Condition): boolean => c.verificationStatus?.coding?.[0]?.code === 'entered-in-error';
  const shown = problems.filter((p) => !isError(p) && (filter === 'all' || (filter === 'active' ? ['active', 'recurrence', 'relapse'].includes(status(p)) : !['active', 'recurrence', 'relapse'].includes(status(p)))));

  const setStatus = async (c: Condition, code: string): Promise<void> => {
    try {
      await medplum.updateResource<Condition>({
        ...c,
        clinicalStatus: { coding: [{ system: SYSTEMS.CONDITION_CLINICAL, code }] },
        abatementDateTime: code === 'resolved' ? new Date().toISOString() : undefined,
      });
      notifySuccess(`Marked ${code}`);
      refresh();
    } catch (err) {
      notifyError(err);
    }
  };

  const markError = async (c: Condition): Promise<void> => {
    try {
      const { clinicalStatus: _omit, ...rest } = c;
      void _omit;
      await medplum.updateResource<Condition>({ ...rest, verificationStatus: { coding: [{ system: SYSTEMS.CONDITION_VER, code: 'entered-in-error' }] } });
      refresh();
    } catch (err) {
      notifyError(err);
    }
  };

  return (
    <Card withBorder>
      <Group justify="space-between" mb="sm">
        <SegmentedControl value={filter} onChange={setFilter} data={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Resolved / inactive' }, { value: 'all', label: 'All' }]} />
        <Button leftSection={<IconPlus size={16} />} onClick={() => setEditing('new')}>
          Add problem
        </Button>
      </Group>
      {shown.length === 0 ? (
        <EmptyState>No problems</EmptyState>
      ) : (
        <Table.ScrollContainer minWidth={600}>
          <Table verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Problem</Table.Th>
                <Table.Th>ICD-10</Table.Th>
                <Table.Th>Onset</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th w={40} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {shown.map((c) => (
                <Table.Tr key={c.id}>
                  <Table.Td>
                    <Text size="sm" fw={500}>{conceptText(c.code)}</Text>
                    {c.note?.[0]?.text && <Text size="xs" c="dimmed">{c.note[0].text}</Text>}
                  </Table.Td>
                  <Table.Td>{codeFrom(c.code, SYSTEMS.ICD10)}</Table.Td>
                  <Table.Td>{formatDate(c.onsetDateTime)}</Table.Td>
                  <Table.Td><StatusBadge status={status(c)} /></Table.Td>
                  <Table.Td>
                    <Menu position="bottom-end">
                      <Menu.Target>
                        <ActionIcon variant="subtle" aria-label="Problem actions"><IconDots size={16} /></ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item onClick={() => setEditing(c)}>Edit</Menu.Item>
                        {status(c) !== 'resolved' && <Menu.Item onClick={() => setStatus(c, 'resolved')}>Resolve</Menu.Item>}
                        {status(c) !== 'active' && <Menu.Item onClick={() => setStatus(c, 'active')}>Reactivate</Menu.Item>}
                        <Menu.Item color="red" onClick={() => markError(c)}>Entered in error</Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
      <Modal opened={!!editing} onClose={() => setEditing(undefined)} title={editing === 'new' ? 'Add problem' : 'Edit problem'} size="lg">
        {editing && (
          <ProblemForm
            patient={patientRef}
            category="problem-list-item"
            existing={editing === 'new' ? undefined : editing}
            onSaved={() => {
              setEditing(undefined);
              notifySuccess('Problem list updated');
              refresh();
            }}
          />
        )}
      </Modal>
    </Card>
  );
}
