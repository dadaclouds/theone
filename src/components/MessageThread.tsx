import { Box, Button, Group, Paper, ScrollArea, Stack, Text, Textarea } from '@mantine/core';
import { IconSend } from '@tabler/icons-react';
import type { Communication, Patient, Reference } from '@medplum/fhirtypes';
import { useMedplum, useMedplumProfile } from '@medplum/react';
import { useEffect, useRef, useState } from 'react';
import { formatDateTime, profileDisplay } from '../lib/fhir';
import { useAsync } from '../lib/hooks';
import { EmptyState } from './common';
import { notifyError } from './notify';

/** Secure messaging thread between the care team and a patient (FHIR Communication). */
export function MessageThread({ patient, onSent }: { readonly patient: Reference<Patient>; readonly onSent?: () => void }) {
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);

  const { data = [], reload } = useAsync(
    () => medplum.searchResources('Communication', { subject: patient.reference as string, _sort: 'sent', _count: '200' }, { cache: 'no-cache' }),
    [medplum, patient.reference]
  );

  useEffect(() => {
    viewport.current?.scrollTo({ top: viewport.current.scrollHeight });
  }, [data.length]);

  const send = async (): Promise<void> => {
    if (!text.trim() || !profile) return;
    setSending(true);
    try {
      await medplum.createResource<Communication>({
        resourceType: 'Communication',
        status: 'completed',
        category: [{ text: 'Patient message' }],
        subject: patient,
        sender: { reference: `${profile.resourceType}/${profile.id}`, display: profileDisplay(profile) },
        recipient: [patient],
        sent: new Date().toISOString(),
        payload: [{ contentString: text.trim() }],
      });
      setText('');
      reload();
      onSent?.();
    } catch (err) {
      notifyError(err);
    } finally {
      setSending(false);
    }
  };

  return (
    <Stack gap="sm">
      <ScrollArea h={400} viewportRef={viewport}>
        {data.length === 0 ? (
          <EmptyState>No messages yet</EmptyState>
        ) : (
          <Stack gap="xs" p="xs">
            {data.map((m) => {
              const fromPatient = m.sender?.reference?.startsWith('Patient/');
              return (
                <Group key={m.id} justify={fromPatient ? 'flex-start' : 'flex-end'}>
                  <Box maw="75%">
                    <Paper p="xs" radius="md" bg={fromPatient ? 'gray.1' : 'blue.6'} c={fromPatient ? undefined : 'white'}>
                      <Text size="sm" className="prewrap">{m.payload?.map((p) => p.contentString).join('\n')}</Text>
                    </Paper>
                    <Text size="xs" c="dimmed" ta={fromPatient ? 'left' : 'right'}>
                      {m.sender?.display} · {formatDateTime(m.sent)}
                    </Text>
                  </Box>
                </Group>
              );
            })}
          </Stack>
        )}
      </ScrollArea>
      <Group align="flex-end" wrap="nowrap">
        <Textarea
          style={{ flex: 1 }}
          placeholder="Write a message to the patient…"
          autosize
          minRows={1}
          maxRows={5}
          value={text}
          aria-label="Message"
          onChange={(e) => setText(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send().catch(notifyError);
            }
          }}
        />
        <Button leftSection={<IconSend size={16} />} onClick={send} loading={sending} disabled={!text.trim()}>
          Send
        </Button>
      </Group>
    </Stack>
  );
}
