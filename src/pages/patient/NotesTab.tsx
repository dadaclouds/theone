import { Anchor, Badge, Card, Grid, Group, ScrollArea, Stack, Text, Title, UnstyledButton } from '@mantine/core';
import type { DocumentReference } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { EmptyState, StatusBadge } from '../../components/common';
import { formatDateTime } from '../../lib/fhir';
import { useAsync } from '../../lib/hooks';
import { markdownToSoap, readNoteText, SOAP_SECTIONS } from '../../lib/notes';
import { useChart } from './PatientContext';

export function NotesTab() {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const { patient, patientRef } = useChart();
  const [selectedId, setSelectedId] = useState<string>();
  const { data = [] } = useAsync(
    () => medplum.searchResources('DocumentReference', { subject: patientRef.reference as string, category: 'clinical-note', _sort: '-date', _count: '200' }, { cache: 'no-cache' }),
    [medplum, patientRef.reference]
  );
  const notes = data.filter((d) => d.status !== 'entered-in-error');
  const selected = notes.find((n) => n.id === selectedId) ?? notes[0];

  if (notes.length === 0) {
    return (
      <Card withBorder>
        <EmptyState>No clinical notes yet. Start a visit to write one.</EmptyState>
      </Card>
    );
  }

  return (
    <Grid>
      <Grid.Col span={{ base: 12, md: 4 }}>
        <Card withBorder padding="xs">
          <ScrollArea.Autosize mah={600}>
            <Stack gap={4}>
              {notes.map((n) => (
                <UnstyledButton
                  key={n.id}
                  onClick={() => setSelectedId(n.id)}
                  p="xs"
                  style={{ borderRadius: 6, background: n.id === selected?.id ? 'var(--mantine-color-blue-0)' : undefined }}
                >
                  <Group justify="space-between" wrap="nowrap">
                    <Text size="sm" fw={500} lineClamp={1}>{n.description}</Text>
                    <StatusBadge status={n.docStatus} size="xs" />
                  </Group>
                  <Text size="xs" c="dimmed">{formatDateTime(n.date)} · {n.author?.[0]?.display}</Text>
                </UnstyledButton>
              ))}
            </Stack>
          </ScrollArea.Autosize>
        </Card>
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 8 }}>
        {selected && <NoteView note={selected} onOpenEncounter={(id) => navigate(`/patients/${patient.id}/encounters/${id}`)} />}
      </Grid.Col>
    </Grid>
  );
}

export function NoteView({ note, onOpenEncounter }: { note: DocumentReference; onOpenEncounter?: (id: string) => void }) {
  const soap = markdownToSoap(readNoteText(note));
  const encounterId = note.context?.encounter?.[0]?.reference?.split('/')[1];
  const isAddendum = note.relatesTo?.some((r) => r.code === 'appends');
  return (
    <Card withBorder>
      <Group justify="space-between" mb="sm">
        <div>
          <Group gap="xs">
            <Title order={4}>{note.description}</Title>
            {isAddendum && <Badge color="violet">Addendum</Badge>}
          </Group>
          <Text size="sm" c="dimmed">
            {formatDateTime(note.date)} · {note.author?.[0]?.display}
            {note.docStatus === 'final' && note.authenticator?.display ? ` · Signed by ${note.authenticator.display}` : ''}
          </Text>
        </div>
        <Group gap="xs">
          <StatusBadge status={note.docStatus === 'final' ? 'final' : 'preliminary'} />
          {encounterId && onOpenEncounter && <Anchor size="sm" onClick={() => onOpenEncounter(encounterId)}>Open encounter</Anchor>}
        </Group>
      </Group>
      <Stack gap="sm">
        {SOAP_SECTIONS.filter((s) => soap[s.key]).map((s) => (
          <div key={s.key}>
            <Text fw={700} size="sm" tt="uppercase" c="dimmed">{s.title}</Text>
            <Text size="sm" className="prewrap">{soap[s.key]}</Text>
          </div>
        ))}
      </Stack>
    </Card>
  );
}
