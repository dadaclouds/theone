import { ActionIcon, Button, Card, Group, Menu, Modal, Table, Text } from '@mantine/core';
import { IconDots, IconPlus } from '@tabler/icons-react';
import type { AllergyIntolerance } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useState } from 'react';
import { AllergyForm } from '../../components/clinical/AllergyForm';
import { EmptyState, StatusBadge } from '../../components/common';
import { notifyError, notifySuccess } from '../../components/notify';
import { isActiveAllergy, isNoKnownAllergy } from '../../lib/allergy';
import { NO_KNOWN_ALLERGY } from '../../lib/catalog';
import { SYSTEMS } from '../../lib/constants';
import { conceptFromCatalog, conceptText, formatDate } from '../../lib/fhir';
import { useChart } from './PatientContext';

export function AllergiesTab() {
  const medplum = useMedplum();
  const { allergies, patientRef, refresh } = useChart();
  const [editing, setEditing] = useState<AllergyIntolerance | 'new'>();
  const active = allergies.filter(isActiveAllergy);
  const real = active.filter((a) => !isNoKnownAllergy(a));
  const nka = active.find(isNoKnownAllergy);

  const setStatus = async (a: AllergyIntolerance, clinical: 'inactive' | 'resolved' | undefined, verification: string): Promise<void> => {
    try {
      const { clinicalStatus: _drop, ...rest } = a;
      void _drop;
      await medplum.updateResource<AllergyIntolerance>({
        ...rest,
        clinicalStatus: clinical ? { coding: [{ system: SYSTEMS.ALLERGY_CLINICAL, code: clinical }] } : undefined,
        verificationStatus: { coding: [{ system: SYSTEMS.ALLERGY_VER, code: verification }] },
      });
      refresh();
    } catch (err) {
      notifyError(err);
    }
  };

  const markNka = async (): Promise<void> => {
    try {
      await medplum.createResource<AllergyIntolerance>({
        resourceType: 'AllergyIntolerance',
        patient: patientRef,
        code: conceptFromCatalog(NO_KNOWN_ALLERGY),
        clinicalStatus: { coding: [{ system: SYSTEMS.ALLERGY_CLINICAL, code: 'active' }] },
        verificationStatus: { coding: [{ system: SYSTEMS.ALLERGY_VER, code: 'confirmed' }] },
        recordedDate: new Date().toISOString(),
      });
      notifySuccess('Recorded: no known allergies');
      refresh();
    } catch (err) {
      notifyError(err);
    }
  };

  return (
    <Card withBorder>
      <Group justify="space-between" mb="sm">
        <Text size="sm" c="dimmed">
          {real.length ? `${real.length} active allerg${real.length === 1 ? 'y' : 'ies'}` : nka ? `No known allergies (reviewed ${formatDate(nka.recordedDate)})` : 'Allergies not yet reviewed'}
        </Text>
        <Group gap="xs">
          {real.length === 0 && !nka && (
            <Button variant="default" onClick={markNka}>
              No known allergies
            </Button>
          )}
          <Button leftSection={<IconPlus size={16} />} onClick={() => setEditing('new')}>
            Add allergy
          </Button>
        </Group>
      </Group>
      {real.length === 0 ? (
        <EmptyState>No active allergies</EmptyState>
      ) : (
        <Table.ScrollContainer minWidth={600}>
          <Table verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Allergen</Table.Th>
                <Table.Th>Category</Table.Th>
                <Table.Th>Reaction</Table.Th>
                <Table.Th>Severity</Table.Th>
                <Table.Th>Criticality</Table.Th>
                <Table.Th w={40} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {real.map((a) => (
                <Table.Tr key={a.id}>
                  <Table.Td fw={600} c="red.8">{conceptText(a.code)}</Table.Td>
                  <Table.Td tt="capitalize">{a.category?.join(', ')}</Table.Td>
                  <Table.Td>{a.reaction?.[0]?.manifestation?.map(conceptText).join(', ')}</Table.Td>
                  <Table.Td><StatusBadge status={a.reaction?.[0]?.severity} /></Table.Td>
                  <Table.Td><StatusBadge status={a.criticality} /></Table.Td>
                  <Table.Td>
                    <Menu position="bottom-end">
                      <Menu.Target>
                        <ActionIcon variant="subtle" aria-label="Allergy actions"><IconDots size={16} /></ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item onClick={() => setEditing(a)}>Edit</Menu.Item>
                        <Menu.Item onClick={() => setStatus(a, 'inactive', 'confirmed')}>Mark inactive</Menu.Item>
                        <Menu.Item onClick={() => setStatus(a, 'inactive', 'refuted')}>Refuted</Menu.Item>
                        <Menu.Item color="red" onClick={() => setStatus(a, undefined, 'entered-in-error')}>Entered in error</Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
      <Modal opened={!!editing} onClose={() => setEditing(undefined)} title={editing === 'new' ? 'Add allergy' : 'Edit allergy'} size="lg">
        {editing && (
          <AllergyForm
            patient={patientRef}
            existing={editing === 'new' ? undefined : editing}
            onSaved={async () => {
              setEditing(undefined);
              // A documented allergy supersedes any prior "no known allergies" entry.
              if (nka) {
                await setStatus(nka, 'inactive', 'refuted');
              }
              notifySuccess('Allergy saved');
              refresh();
            }}
          />
        )}
      </Modal>
    </Card>
  );
}
