import { Badge, Button, Group, Stack, Table, Text, TextInput, Textarea } from '@mantine/core';
import { createReference } from '@medplum/core';
import type { DiagnosticReport, Practitioner, Reference, ServiceRequest, Task } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useState } from 'react';
import { SYSTEMS, TASK_CODES } from '../../lib/constants';
import { conceptText, toDateTimeLocalInput, fromDateTimeLocalInput } from '../../lib/fhir';
import { buildResultObservations, findLabDefinition, flagFor, type ResultEntry } from '../../lib/labs';
import { notifyError } from '../notify';

/**
 * Manual result entry for an outstanding lab order. In production, results usually arrive via a
 * lab interface (HL7v2 / FHIR) which would create the same DiagnosticReport + Observation shape.
 */
export function LabResultForm({ order, onSaved }: { readonly order: ServiceRequest; readonly onSaved: (report: DiagnosticReport) => void }) {
  const medplum = useMedplum();
  const def = findLabDefinition(order);
  const [entries, setEntries] = useState<ResultEntry[]>(
    def?.analytes.map((a) => ({ ...a, value: '' })) ?? [{ code: '', display: conceptText(order.code), unit: '', value: '' }]
  );
  const [collected, setCollected] = useState(toDateTimeLocalInput(undefined));
  const [conclusion, setConclusion] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      const subject = order.subject as Reference<import('@medplum/fhirtypes').Patient>;
      const effective = fromDateTimeLocalInput(collected);
      const observations = await Promise.all(
        buildResultObservations(entries, subject, createReference(order), effective).map((o) => medplum.createResource(o))
      );
      const report = await medplum.createResource<DiagnosticReport>({
        resourceType: 'DiagnosticReport',
        status: 'final',
        category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0074', code: 'LAB', display: 'Laboratory' }] }],
        code: order.code ?? { text: 'Lab result' },
        subject,
        basedOn: [createReference(order)],
        encounter: order.encounter,
        effectiveDateTime: effective,
        issued: new Date().toISOString(),
        result: observations.map((o) => ({ reference: `Observation/${o.id}`, display: conceptText(o.code) })),
        conclusion: conclusion.trim() || undefined,
      });
      await medplum.updateResource<ServiceRequest>({ ...order, status: 'completed' });
      await medplum.createResource<Task>({
        resourceType: 'Task',
        status: 'requested',
        intent: 'order',
        priority: observations.some((o) => ['H', 'L'].includes(o.interpretation?.[0]?.coding?.[0]?.code ?? '')) ? 'urgent' : 'routine',
        code: { coding: [{ system: SYSTEMS.TASK_TYPE, code: TASK_CODES.REVIEW_RESULT, display: 'Review result' }], text: 'Review result' },
        description: `Review ${conceptText(order.code)} result`,
        focus: { reference: `DiagnosticReport/${report.id}`, display: conceptText(report.code) },
        for: subject,
        owner: order.requester as Reference<Practitioner> | undefined,
        authoredOn: new Date().toISOString(),
      });
      onSaved(report);
    } catch (err) {
      notifyError(err);
    } finally {
      setSaving(false);
    }
  };

  const update = (i: number, patch: Partial<ResultEntry>): void =>
    setEntries((prev) => prev.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));

  return (
    <Stack>
      <Text fw={600}>{conceptText(order.code)}</Text>
      <TextInput label="Collected" type="datetime-local" value={collected} onChange={(e) => setCollected(e.currentTarget.value)} />
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Analyte</Table.Th>
            <Table.Th>Result</Table.Th>
            <Table.Th>Units</Table.Th>
            <Table.Th>Reference</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {entries.map((e, i) => {
            const num = Number(e.value);
            const flag = e.value && !Number.isNaN(num) ? flagFor(num, e.low, e.high) : undefined;
            return (
              <Table.Tr key={`${e.code}-${i}`}>
                <Table.Td>
                  {def ? e.display : <TextInput size="xs" value={e.display} onChange={(ev) => update(i, { display: ev.currentTarget.value })} />}
                </Table.Td>
                <Table.Td>
                  <TextInput size="xs" aria-label={`${e.display} result`} value={e.value} onChange={(ev) => update(i, { value: ev.currentTarget.value })} w={110} />
                </Table.Td>
                <Table.Td>{e.unit}</Table.Td>
                <Table.Td>
                  <Text size="xs" c="dimmed">
                    {e.low !== undefined ? e.low : ''}
                    {e.low !== undefined || e.high !== undefined ? ' – ' : ''}
                    {e.high !== undefined ? e.high : ''}
                  </Text>
                </Table.Td>
                <Table.Td>{flag && flag !== 'N' && <Badge color="red" size="sm">{flag}</Badge>}</Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
      <Textarea label="Interpretation / comment" autosize minRows={1} value={conclusion} onChange={(e) => setConclusion(e.currentTarget.value)} />
      <Group justify="flex-end">
        <Button onClick={save} loading={saving} disabled={entries.every((e) => !e.value.trim())}>
          File results
        </Button>
      </Group>
    </Stack>
  );
}
