import { Alert, Button, Card, Checkbox, Grid, Group, Modal, Stack, Table, Text, TextInput } from '@mantine/core';
import { IconUserPlus } from '@tabler/icons-react';
import type { AuditEvent, ProjectMembership } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useState } from 'react';
import { EmptyState, PageHeader, SectionCard } from '../components/common';
import { notifyError, notifySuccess } from '../components/notify';
import { formatDateTime } from '../lib/fhir';
import { useAsync } from '../lib/hooks';

export function AdminPage() {
  const medplum = useMedplum();
  const project = medplum.getProject();
  const isAdmin = !!medplum.getProjectMembership()?.admin;
  const [inviting, setInviting] = useState(false);

  const { data, reload } = useAsync(async () => {
    const [members, audit] = await Promise.all([
      isAdmin && project?.id
        ? medplum.searchResources('ProjectMembership', { _count: '200' }, { cache: 'no-cache' }).catch(() => [] as ProjectMembership[])
        : Promise.resolve([] as ProjectMembership[]),
      medplum.searchResources('AuditEvent', { _sort: '-date', _count: '25' }, { cache: 'no-cache' }).catch(() => [] as AuditEvent[]),
    ]);
    return { members, audit };
  }, [medplum, isAdmin, project?.id]);

  return (
    <>
      <PageHeader
        title="Administration"
        subtitle={project?.name}
        actions={isAdmin && <Button leftSection={<IconUserPlus size={16} />} onClick={() => setInviting(true)}>Invite clinician</Button>}
      />
      {!isAdmin && <Alert color="yellow" mb="md">You are not a project administrator. Some settings are hidden.</Alert>}
      <Grid>
        <Grid.Col span={{ base: 12, lg: 6 }}>
          <SectionCard title="Users">
            {(data?.members ?? []).length === 0 ? (
              <EmptyState>{isAdmin ? 'No members' : 'Admin access required'}</EmptyState>
            ) : (
              <Table verticalSpacing="xs">
                <Table.Thead><Table.Tr><Table.Th>User</Table.Th><Table.Th>Profile</Table.Th><Table.Th>Role</Table.Th></Table.Tr></Table.Thead>
                <Table.Tbody>
                  {data?.members.map((m) => (
                    <Table.Tr key={m.id}>
                      <Table.Td>{m.user?.display}</Table.Td>
                      <Table.Td>{m.profile?.display ?? m.profile?.reference}</Table.Td>
                      <Table.Td>{m.admin ? 'Admin' : m.profile?.reference?.split('/')[0]}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </SectionCard>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 6 }}>
          <SectionCard title="Recent audit events">
            {(data?.audit ?? []).length === 0 ? (
              <EmptyState>No audit events visible</EmptyState>
            ) : (
              <Table verticalSpacing={4}>
                <Table.Tbody>
                  {data?.audit.map((a) => (
                    <Table.Tr key={a.id}>
                      <Table.Td><Text size="xs">{formatDateTime(a.recorded)}</Text></Table.Td>
                      <Table.Td><Text size="xs">{a.type?.display ?? a.type?.code} {a.subtype?.map((s) => s.display ?? s.code).join(', ')}</Text></Table.Td>
                      <Table.Td><Text size="xs">{a.agent?.[0]?.who?.display}</Text></Table.Td>
                      <Table.Td><Text size="xs" c={a.outcome === '0' ? 'green' : 'red'}>{a.outcome === '0' ? 'success' : a.outcome}</Text></Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </SectionCard>
        </Grid.Col>
        <Grid.Col span={12}>
          <Card withBorder>
            <Text fw={600} mb={4}>Server</Text>
            <Text size="sm" c="dimmed">{medplum.getBaseUrl()} · Project ID {project?.id}</Text>
          </Card>
        </Grid.Col>
      </Grid>
      <Modal opened={inviting} onClose={() => setInviting(false)} title="Invite clinician">
        {inviting && <InviteForm projectId={project?.id as string} onDone={() => { setInviting(false); reload(); }} />}
      </Modal>
    </>
  );
}

function InviteForm({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const medplum = useMedplum();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [admin, setAdmin] = useState(false);
  const [saving, setSaving] = useState(false);

  const invite = async (): Promise<void> => {
    setSaving(true);
    try {
      await medplum.post(medplum.fhirUrl().toString().replace(/fhir\/R4\/?$/, `admin/projects/${projectId}/invite`), {
        resourceType: 'Practitioner',
        firstName,
        lastName,
        email,
        password: password || undefined,
        sendEmail: !password,
        admin,
      });
      notifySuccess(`Invited ${firstName} ${lastName}`);
      onDone();
    } catch (err) {
      notifyError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack>
      <Group grow>
        <TextInput label="First name" value={firstName} onChange={(e) => setFirstName(e.currentTarget.value)} required />
        <TextInput label="Last name" value={lastName} onChange={(e) => setLastName(e.currentTarget.value)} required />
      </Group>
      <TextInput label="Email" type="email" value={email} onChange={(e) => setEmail(e.currentTarget.value)} required />
      <TextInput label="Initial password" description="Leave blank to send an invitation email instead" type="password" value={password} onChange={(e) => setPassword(e.currentTarget.value)} />
      <Checkbox label="Project administrator" checked={admin} onChange={(e) => setAdmin(e.currentTarget.checked)} />
      <Group justify="flex-end"><Button onClick={invite} loading={saving} disabled={!firstName || !lastName || !email}>Send invite</Button></Group>
    </Stack>
  );
}
