import { Anchor, Button, Card, Group, Modal, Select, Stack, Table, Text, TextInput } from '@mantine/core';
import { IconUpload } from '@tabler/icons-react';
import type { Attachment, DocumentReference } from '@medplum/fhirtypes';
import { AttachmentButton, useMedplum, useMedplumProfile } from '@medplum/react';
import { useState } from 'react';
import { EmptyState } from '../../components/common';
import { notifyError, notifySuccess } from '../../components/notify';
import { SYSTEMS } from '../../lib/constants';
import { formatDateTime, profileDisplay } from '../../lib/fhir';
import { useAsync } from '../../lib/hooks';
import { useChart } from './PatientContext';

const DOC_TYPES = [
  { value: '34108-1', label: 'Outpatient note (outside)' },
  { value: '11502-2', label: 'Laboratory report' },
  { value: '18748-4', label: 'Diagnostic imaging study' },
  { value: '64290-0', label: 'Insurance card' },
  { value: '59284-0', label: 'Consent document' },
  { value: '57016-8', label: 'Privacy policy acknowledgment' },
  { value: '51851-4', label: 'Administrative note' },
];

export function DocumentsTab() {
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const { patient, patientRef } = useChart();
  const [pending, setPending] = useState<Attachment>();
  const [docType, setDocType] = useState<string>('34108-1');
  const [description, setDescription] = useState('');
  const [uploading, setUploading] = useState(false);

  const { data = [], reload } = useAsync(
    () => medplum.searchResources('DocumentReference', { subject: patientRef.reference as string, 'category:not': 'clinical-note', _sort: '-date', _count: '200' }, { cache: 'no-cache' }),
    [medplum, patientRef.reference]
  );
  const docs = data.filter((d) => !d.category?.some((c) => c.coding?.some((cc) => cc.code === 'clinical-note')));

  const save = async (): Promise<void> => {
    if (!pending) return;
    try {
      const type = DOC_TYPES.find((t) => t.value === docType);
      await medplum.createResource<DocumentReference>({
        resourceType: 'DocumentReference',
        status: 'current',
        type: { coding: [{ system: SYSTEMS.LOINC, code: docType, display: type?.label }], text: type?.label },
        category: [{ text: 'Scanned document' }],
        subject: patientRef,
        date: new Date().toISOString(),
        author: profile ? [{ reference: `${profile.resourceType}/${profile.id}`, display: profileDisplay(profile) }] : undefined,
        description: description || pending.title,
        content: [{ attachment: pending }],
      });
      notifySuccess('Document uploaded');
      setPending(undefined);
      setDescription('');
      reload();
    } catch (err) {
      notifyError(err);
    }
  };

  return (
    <Card withBorder>
      <Group justify="space-between" mb="sm">
        <Text size="sm" c="dimmed">{docs.length} document(s)</Text>
        <AttachmentButton
          securityContext={{ reference: `Patient/${patient.id}` }}
          onUploadStart={() => setUploading(true)}
          onUploadError={(o) => {
            setUploading(false);
            notifyError(o);
          }}
          onUpload={(a) => {
            setUploading(false);
            setPending(a);
            setDescription(a.title ?? '');
          }}
        >
          {(props) => (
            <Button {...props} loading={uploading} leftSection={<IconUpload size={16} />}>
              Upload document
            </Button>
          )}
        </AttachmentButton>
      </Group>
      {docs.length === 0 ? (
        <EmptyState>No documents</EmptyState>
      ) : (
        <Table.ScrollContainer minWidth={600}>
          <Table verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Description</Table.Th>
                <Table.Th>Type</Table.Th>
                <Table.Th>Date</Table.Th>
                <Table.Th>Uploaded by</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {docs.map((d) => (
                <Table.Tr key={d.id}>
                  <Table.Td>
                    <Anchor href={d.content?.[0]?.attachment?.url} target="_blank" rel="noreferrer" size="sm">
                      {d.description ?? d.content?.[0]?.attachment?.title ?? 'Document'}
                    </Anchor>
                  </Table.Td>
                  <Table.Td>{d.type?.text}</Table.Td>
                  <Table.Td>{formatDateTime(d.date)}</Table.Td>
                  <Table.Td>{d.author?.[0]?.display}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
      <Modal opened={!!pending} onClose={() => setPending(undefined)} title="File document">
        <Stack>
          <Text size="sm">{pending?.title} ({pending?.contentType})</Text>
          <Select label="Document type" data={DOC_TYPES} value={docType} onChange={(v) => setDocType(v ?? DOC_TYPES[0].value)} />
          <TextInput label="Description" value={description} onChange={(e) => setDescription(e.currentTarget.value)} />
          <Group justify="flex-end">
            <Button onClick={save}>Save to chart</Button>
          </Group>
        </Stack>
      </Modal>
    </Card>
  );
}
