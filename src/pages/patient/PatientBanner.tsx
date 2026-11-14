import { Avatar, Badge, Button, Card, Group, Menu, Stack, Text, Tooltip } from '@mantine/core';
import { IconAlertTriangle, IconCalendarPlus, IconDots, IconEdit, IconPlayerPlay, IconPrinter } from '@tabler/icons-react';
import { useNavigate } from 'react-router';
import { isActiveAllergy, isNoKnownAllergy } from '../../lib/allergy';
import { conceptText, patientName, patientSummaryLine } from '../../lib/fhir';
import { useChart } from './PatientContext';
import { useStartEncounter } from './useStartEncounter';

export function PatientBanner() {
  const { patient, allergies, coverage } = useChart();
  const navigate = useNavigate();
  const startEncounter = useStartEncounter();
  const active = allergies.filter(isActiveAllergy);
  const nka = active.some(isNoKnownAllergy);
  const real = active.filter((a) => !isNoKnownAllergy(a));
  const phone = patient.telecom?.find((t) => t.system === 'phone')?.value;

  return (
    <Card withBorder padding="sm" data-testid="patient-banner">
      <Group justify="space-between" wrap="wrap" gap="sm">
        <Group wrap="nowrap" gap="md">
          <Avatar size="lg" radius="xl" color={patient.gender === 'female' ? 'pink' : 'blue'}>
            {(patient.name?.[0]?.given?.[0]?.[0] ?? '') + (patient.name?.[0]?.family?.[0] ?? '')}
          </Avatar>
          <Stack gap={2}>
            <Group gap="xs">
              <Text fw={700} size="lg">
                {patientName(patient)}
              </Text>
              {patient.active === false && <Badge color="gray">Inactive</Badge>}
            </Group>
            <Text size="sm" c="dimmed">
              {patientSummaryLine(patient)}
              {phone ? ` · ${phone}` : ''}
              {` · ${coverage?.payor?.[0]?.display ?? 'Self-pay'}`}
            </Text>
            <Group gap={4}>
              {real.length > 0 ? (
                real.map((a) => (
                  <Tooltip key={a.id} label={a.reaction?.[0]?.manifestation?.map(conceptText).join(', ') || 'No reaction recorded'}>
                    <Badge color="red" variant="light" leftSection={<IconAlertTriangle size={12} />}>
                      {conceptText(a.code)}
                    </Badge>
                  </Tooltip>
                ))
              ) : nka ? (
                <Badge color="green" variant="light">No known allergies</Badge>
              ) : (
                <Badge color="yellow" variant="light">Allergies not reviewed</Badge>
              )}
            </Group>
          </Stack>
        </Group>
        <Group gap="xs" className="no-print">
          <Button leftSection={<IconPlayerPlay size={16} />} onClick={() => startEncounter()}>
            Start visit
          </Button>
          <Button variant="default" leftSection={<IconCalendarPlus size={16} />} onClick={() => navigate(`/patients/${patient.id}/appointments?new=1`)}>
            Schedule
          </Button>
          <Menu position="bottom-end">
            <Menu.Target>
              <Button variant="default" px="xs" aria-label="More patient actions">
                <IconDots size={16} />
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<IconEdit size={16} />} onClick={() => navigate(`/patients/${patient.id}/edit`)}>
                Edit demographics
              </Menu.Item>
              <Menu.Item leftSection={<IconPrinter size={16} />} onClick={() => navigate(`/patients/${patient.id}/summary?print=1`)}>
                Print summary
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>
    </Card>
  );
}
