import { Button, Card, Group, Modal, SegmentedControl, Stack, Table, Text } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useMedplum } from '@medplum/react';
import { useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { VitalsForm } from '../../components/clinical/VitalsForm';
import { EmptyState, SectionCard } from '../../components/common';
import { notifySuccess } from '../../components/notify';
import { SYSTEMS } from '../../lib/constants';
import { formatDate, formatDateTime } from '../../lib/fhir';
import { useAsync } from '../../lib/hooks';
import { interpret, VITALS, VITAL_LOINC_CODES, vitalsFlowsheet, type VitalKey } from '../../lib/vitals';
import { useChart } from './PatientContext';

const CHARTS: { value: string; label: string; keys: VitalKey[]; colors: string[] }[] = [
  { value: 'bp', label: 'Blood pressure', keys: ['systolic', 'diastolic'], colors: ['#e03131', '#1971c2'] },
  { value: 'hr', label: 'Heart rate', keys: ['heartRate'], colors: ['#c2255c'] },
  { value: 'weight', label: 'Weight', keys: ['weight'], colors: ['#2f9e44'] },
  { value: 'bmi', label: 'BMI', keys: ['bmi'], colors: ['#f08c00'] },
  { value: 'temp', label: 'Temp', keys: ['temp'], colors: ['#7048e8'] },
];

const COLUMNS: VitalKey[] = ['heartRate', 'respRate', 'temp', 'spo2', 'weight', 'height', 'bmi', 'pain'];

export function VitalsTab() {
  const medplum = useMedplum();
  const { patientRef } = useChart();
  const [adding, setAdding] = useState(false);
  const [chart, setChart] = useState('bp');

  const { data: rows = [], reload } = useAsync(async () => {
    const obs = await medplum.searchResources(
      'Observation',
      { subject: patientRef.reference as string, code: VITAL_LOINC_CODES.map((c) => `${SYSTEMS.LOINC}|${c}`).join(','), _sort: '-date', _count: '500' },
      { cache: 'no-cache' }
    );
    return vitalsFlowsheet(obs);
  }, [medplum, patientRef.reference]);

  const def = CHARTS.find((c) => c.value === chart) ?? CHARTS[0];
  const series = [...rows].reverse().filter((r) => def.keys.some((k) => r.values[k] !== undefined)).map((r) => ({ date: formatDate(r.date), ...r.values }));

  const cell = (key: VitalKey, v: number | undefined) => {
    if (v === undefined) return <Text c="dimmed">–</Text>;
    const flag = interpret(VITALS[key], v);
    return <Text size="sm" fw={flag !== 'N' ? 700 : undefined} c={flag !== 'N' ? 'red' : undefined}>{v}</Text>;
  };

  return (
    <Stack>
      <SectionCard
        title="Trends"
        actions={
          <Button leftSection={<IconPlus size={16} />} onClick={() => setAdding(true)}>
            Record vitals
          </Button>
        }
      >
        <SegmentedControl mb="sm" value={chart} onChange={setChart} data={CHARTS.map((c) => ({ value: c.value, label: c.label }))} />
        {series.length === 0 ? (
          <EmptyState>No data to chart</EmptyState>
        ) : (
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={series} margin={{ left: -10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" fontSize={12} />
                <YAxis fontSize={12} domain={['auto', 'auto']} />
                <Tooltip />
                <Legend />
                {def.keys.map((k, i) => (
                  <Line key={k} type="monotone" dataKey={k} name={VITALS[k].label} stroke={def.colors[i]} strokeWidth={2} dot isAnimationActive={false} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </SectionCard>
      <Card withBorder>
        <Text fw={600} mb="sm">Flowsheet</Text>
        {rows.length === 0 ? (
          <EmptyState>No vitals recorded</EmptyState>
        ) : (
          <Table.ScrollContainer minWidth={800}>
            <Table striped verticalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Date</Table.Th>
                  <Table.Th>BP (mmHg)</Table.Th>
                  {COLUMNS.map((k) => (
                    <Table.Th key={k}>{VITALS[k].label} ({VITALS[k].unit})</Table.Th>
                  ))}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((r) => (
                  <Table.Tr key={r.date}>
                    <Table.Td><Text size="sm">{formatDateTime(r.date)}</Text></Table.Td>
                    <Table.Td>
                      {r.values.systolic !== undefined ? (
                        <Group gap={2} wrap="nowrap">{cell('systolic', r.values.systolic)}/{cell('diastolic', r.values.diastolic)}</Group>
                      ) : <Text c="dimmed">–</Text>}
                    </Table.Td>
                    {COLUMNS.map((k) => (
                      <Table.Td key={k}>{cell(k, r.values[k])}</Table.Td>
                    ))}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Card>
      <Modal opened={adding} onClose={() => setAdding(false)} title="Record vitals" size="lg">
        <VitalsForm
          patient={patientRef}
          onSaved={() => {
            setAdding(false);
            notifySuccess('Vitals saved');
            reload();
          }}
        />
      </Modal>
    </Stack>
  );
}
