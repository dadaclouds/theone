import { Anchor, Card, Grid, Group, Stack, Text, Title, UnstyledButton } from '@mantine/core';
import type { Communication, Patient, Reference } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { MessageThread } from '../components/MessageThread';
import { PatientSearch } from '../components/PatientSearch';
import { EmptyState, PageHeader } from '../components/common';
import { formatDateTime, patientName } from '../lib/fhir';
import { useAsync } from '../lib/hooks';

interface ThreadSummary {
  patient: Reference<Patient>;
  last: Communication;
}

export function MessagesPage() {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Reference<Patient>>();

  const { data: threads = [], reload } = useAsync(async () => {
    const messages = await medplum.searchResources('Communication', { _sort: '-sent', _count: '300' }, { cache: 'no-cache' });
    const map = new Map<string, ThreadSummary>();
    for (const m of messages) {
      const ref = m.subject?.reference;
      if (ref?.startsWith('Patient/') && !map.has(ref)) {
        map.set(ref, { patient: m.subject as Reference<Patient>, last: m });
      }
    }
    return [...map.values()];
  }, [medplum]);

  const active = selected ?? threads[0]?.patient;

  return (
    <>
      <PageHeader title="Messages" subtitle="Secure patient messaging" />
      <Grid>
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Card withBorder padding="xs">
            <PatientSearch placeholder="Start a conversation…" onSelect={(p) => setSelected({ reference: `Patient/${p.id}`, display: patientName(p) })} />
            <Stack gap={4} mt="xs">
              {threads.length === 0 && <EmptyState>No conversations yet</EmptyState>}
              {threads.map((t) => (
                <UnstyledButton
                  key={t.patient.reference}
                  p="xs"
                  onClick={() => setSelected(t.patient)}
                  style={{ borderRadius: 6, background: t.patient.reference === active?.reference ? 'var(--mantine-color-blue-0)' : undefined }}
                >
                  <Group justify="space-between" wrap="nowrap">
                    <Text size="sm" fw={600}>{t.patient.display}</Text>
                    <Text size="xs" c="dimmed">{formatDateTime(t.last.sent)}</Text>
                  </Group>
                  <Text size="xs" c="dimmed" lineClamp={1}>
                    {t.last.sender?.reference?.startsWith('Patient/') ? '' : 'You: '}
                    {t.last.payload?.[0]?.contentString}
                  </Text>
                </UnstyledButton>
              ))}
            </Stack>
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Card withBorder>
            {active ? (
              <>
                <Group justify="space-between" mb="xs">
                  <Title order={4}>{active.display}</Title>
                  <Anchor size="sm" onClick={() => navigate(`/${active.reference?.replace('Patient', 'patients')}`)}>Open chart</Anchor>
                </Group>
                <MessageThread key={active.reference} patient={active} onSent={reload} />
              </>
            ) : (
              <EmptyState>Select a conversation</EmptyState>
            )}
          </Card>
        </Grid.Col>
      </Grid>
    </>
  );
}
