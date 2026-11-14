import { Anchor, Badge, Grid, Group, Stack, Table, Text } from '@mantine/core';
import type { Appointment, Encounter, Immunization, Observation } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { EmptyState, SectionCard, StatusBadge } from '../../components/common';
import { isActiveAllergy, isNoKnownAllergy } from '../../lib/allergy';
import { conceptText, formatDate, formatDateTime } from '../../lib/fhir';
import { useAsync } from '../../lib/hooks';
import { isAbnormal, observationFlag } from '../../lib/labs';
import { VITALS, VITAL_LOINC_CODES, vitalsFlowsheet, type VitalKey } from '../../lib/vitals';
import { SYSTEMS } from '../../lib/constants';
import { useChart } from './PatientContext';

export function SummaryTab() {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { patient, patientRef, problems, medications, allergies } = useChart();
  const ref = patientRef.reference as string;

  const { data } = useAsync(async () => {
    const opts = { cache: 'no-cache' as const };
    const [vitals, labs, encounters, immunizations, appointments] = await Promise.all([
      medplum.searchResources('Observation', { subject: ref, code: VITAL_LOINC_CODES.map((c) => `${SYSTEMS.LOINC}|${c}`).join(','), _sort: '-date', _count: '30' }, opts),
      medplum.searchResources('Observation', { subject: ref, category: 'laboratory', _sort: '-date', _count: '10' }, opts),
      medplum.searchResources('Encounter', { subject: ref, _sort: '-date', _count: '5' }, opts),
      medplum.searchResources('Immunization', { patient: ref, _sort: '-date', _count: '5' }, opts),
      medplum.searchResources('Appointment', { patient: ref, date: `ge${new Date().toISOString()}`, _sort: 'date', _count: '3' }, opts),
    ]);
    return { vitals: vitalsFlowsheet(vitals), labs, encounters, immunizations, appointments };
  }, [medplum, ref]);

  const isPrint = params.get('print') === '1';
  useEffect(() => {
    if (isPrint && data) {
      const t = setTimeout(() => window.print(), 300);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [isPrint, data]);

  const activeProblems = problems.filter((p) => p.clinicalStatus?.coding?.[0]?.code === 'active');
  const activeMeds = medications.filter((m) => m.status === 'active');
  const activeAllergies = allergies.filter((a) => isActiveAllergy(a) && !isNoKnownAllergy(a));
  const latest = data?.vitals[0];
  const go = (tab: string) => () => navigate(`/patients/${patient.id}/${tab}`);

  return (
    <Grid>
      <Grid.Col span={{ base: 12, md: 6, xl: 4 }}>
        <SectionCard title="Active problems" actions={<Anchor size="sm" onClick={go('problems')}>Manage</Anchor>} data-testid="summary-problems">
          {activeProblems.length === 0 ? <EmptyState>No active problems</EmptyState> : (
            <Stack gap={4}>
              {activeProblems.map((p) => (
                <Group key={p.id} justify="space-between" wrap="nowrap">
                  <Text size="sm">{conceptText(p.code)}</Text>
                  <Text size="xs" c="dimmed">{p.code?.coding?.find((c) => c.system === SYSTEMS.ICD10)?.code}</Text>
                </Group>
              ))}
            </Stack>
          )}
        </SectionCard>
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 6, xl: 4 }}>
        <SectionCard title="Active medications" actions={<Anchor size="sm" onClick={go('medications')}>Manage</Anchor>} data-testid="summary-meds">
          {activeMeds.length === 0 ? <EmptyState>No active medications</EmptyState> : (
            <Stack gap={4}>
              {activeMeds.map((m) => (
                <div key={m.id}>
                  <Text size="sm" fw={500}>{conceptText(m.medicationCodeableConcept)}</Text>
                  <Text size="xs" c="dimmed">{m.dosageInstruction?.[0]?.text}</Text>
                </div>
              ))}
            </Stack>
          )}
        </SectionCard>
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 6, xl: 4 }}>
        <SectionCard title="Allergies" actions={<Anchor size="sm" onClick={go('allergies')}>Manage</Anchor>}>
          {activeAllergies.length === 0 ? <EmptyState>{allergies.some(isNoKnownAllergy) ? 'No known allergies' : 'None recorded'}</EmptyState> : (
            <Stack gap={4}>
              {activeAllergies.map((a) => (
                <Group key={a.id} justify="space-between" wrap="nowrap">
                  <Text size="sm" fw={500} c="red.8">{conceptText(a.code)}</Text>
                  <Text size="xs" c="dimmed">{a.reaction?.[0]?.manifestation?.map(conceptText).join(', ')}</Text>
                </Group>
              ))}
            </Stack>
          )}
        </SectionCard>
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 6, xl: 4 }}>
        <SectionCard title={`Latest vitals${latest ? ` · ${formatDate(latest.date)}` : ''}`} actions={<Anchor size="sm" onClick={go('vitals')}>Trends</Anchor>}>
          {!latest ? <EmptyState>No vitals recorded</EmptyState> : (
            <Table withRowBorders={false} verticalSpacing={2}>
              <Table.Tbody>
                {latest.values.systolic !== undefined && (
                  <Table.Tr><Table.Td c="dimmed">Blood pressure</Table.Td><Table.Td fw={500}>{latest.values.systolic}/{latest.values.diastolic} mmHg</Table.Td></Table.Tr>
                )}
                {(['heartRate', 'respRate', 'temp', 'spo2', 'weight', 'bmi'] as VitalKey[]).filter((k) => latest.values[k] !== undefined).map((k) => (
                  <Table.Tr key={k}><Table.Td c="dimmed">{VITALS[k].label}</Table.Td><Table.Td fw={500}>{latest.values[k]} {VITALS[k].unit}</Table.Td></Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </SectionCard>
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 6, xl: 4 }}>
        <SectionCard title="Recent lab results" actions={<Anchor size="sm" onClick={go('labs')}>All labs</Anchor>}>
          {(data?.labs ?? []).length === 0 ? <EmptyState>No results</EmptyState> : (
            <Stack gap={4}>
              {data?.labs.map((o: Observation) => (
                <Group key={o.id} justify="space-between" wrap="nowrap">
                  <Text size="sm">{conceptText(o.code)}</Text>
                  <Group gap={4} wrap="nowrap">
                    <Text size="sm" fw={500} c={isAbnormal(o) ? 'red' : undefined}>
                      {o.valueQuantity ? `${o.valueQuantity.value} ${o.valueQuantity.unit ?? ''}` : o.valueString}
                    </Text>
                    {isAbnormal(o) && <Badge size="xs" color="red">{observationFlag(o)}</Badge>}
                  </Group>
                </Group>
              ))}
            </Stack>
          )}
        </SectionCard>
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 6, xl: 4 }}>
        <SectionCard title="Recent encounters" actions={<Anchor size="sm" onClick={go('encounters')}>All</Anchor>}>
          {(data?.encounters ?? []).length === 0 ? <EmptyState>No encounters</EmptyState> : (
            <Stack gap={4}>
              {data?.encounters.map((e: Encounter) => (
                <Group key={e.id} justify="space-between" wrap="nowrap">
                  <Anchor size="sm" onClick={() => navigate(`/patients/${patient.id}/encounters/${e.id}`)}>
                    {formatDate(e.period?.start)} · {e.type?.[0]?.text ?? 'Visit'}
                  </Anchor>
                  <StatusBadge status={e.status} size="xs" />
                </Group>
              ))}
            </Stack>
          )}
        </SectionCard>
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 6 }}>
        <SectionCard title="Immunizations" actions={<Anchor size="sm" onClick={go('immunizations')}>All</Anchor>}>
          {(data?.immunizations ?? []).length === 0 ? <EmptyState>None recorded</EmptyState> : (
            <Stack gap={4}>
              {data?.immunizations.map((i: Immunization) => (
                <Group key={i.id} justify="space-between" wrap="nowrap">
                  <Text size="sm">{conceptText(i.vaccineCode)}</Text>
                  <Text size="xs" c="dimmed">{formatDate(i.occurrenceDateTime)}</Text>
                </Group>
              ))}
            </Stack>
          )}
        </SectionCard>
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 6 }}>
        <SectionCard title="Upcoming appointments" actions={<Anchor size="sm" onClick={go('appointments')}>All</Anchor>}>
          {(data?.appointments ?? []).length === 0 ? <EmptyState>None scheduled</EmptyState> : (
            <Stack gap={4}>
              {data?.appointments.map((a: Appointment) => (
                <Group key={a.id} justify="space-between" wrap="nowrap">
                  <Text size="sm">{formatDateTime(a.start)} · {a.appointmentType?.text}</Text>
                  <StatusBadge status={a.status} size="xs" />
                </Group>
              ))}
            </Stack>
          )}
        </SectionCard>
      </Grid.Col>
    </Grid>
  );
}
