import { Alert, Badge, Button, Card, Checkbox, Divider, Grid, Group, Modal, Stack, Switch, Table, Text, TextInput, Title } from '@mantine/core';
import { IconEdit, IconUserPlus } from '@tabler/icons-react';
import type { AuditEvent, Practitioner, ProjectMembership } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useState } from 'react';
import { EmptyState, PageHeader, SectionCard } from '../components/common';
import { notifyError, notifySuccess } from '../components/notify';
import { ProfileFields } from '../components/ProfileFields';
import { findEmailConflict, loadAccountInfo, refreshSignedInProfile, updateLoginEmail } from '../lib/accounts';
import { formatDateTime, profileDisplay } from '../lib/fhir';
import { useAsync } from '../lib/hooks';
import { applyProfileForm, isValidEmail, practitionerDisplay, practitionerToForm, validateProfileForm, type ProfileFormValues } from '../lib/practitioner';
import { getProjectId } from '../lib/server';

interface Member {
  membership: ProjectMembership;
  practitioner?: Practitioner;
  email?: string;
  projectScoped: boolean;
}

export function AdminPage() {
  const medplum = useMedplum();
  const project = medplum.getProject();
  const isAdmin = !!medplum.getProjectMembership()?.admin;
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<Member>();

  const { data, reload } = useAsync(async () => {
    const opts = { cache: 'no-cache' as const };
    const [memberships, practitioners, audit] = await Promise.all([
      isAdmin ? medplum.searchResources('ProjectMembership', { _count: '500' }, opts).catch(() => [] as ProjectMembership[]) : Promise.resolve([] as ProjectMembership[]),
      isAdmin ? medplum.searchResources('Practitioner', { _count: '500' }, opts) : Promise.resolve([] as Practitioner[]),
      medplum.searchResources('AuditEvent', { _sort: '-date', _count: '25' }, opts).catch(() => [] as AuditEvent[]),
    ]);
    const byRef = new Map(practitioners.map((p) => [`Practitioner/${p.id}`, p]));
    const clinicians = memberships.filter((m) => m.profile?.reference?.startsWith('Practitioner/') && m.user?.reference?.startsWith('User/'));
    const members: Member[] = (
      await Promise.all(
        clinicians.map(async (m) => ({ membership: m, practitioner: byRef.get(m.profile?.reference as string), ...(await loadAccountInfo(medplum, m)) }))
      )
    ).sort((a, b) => (profileDisplay(a.practitioner) ?? '').localeCompare(profileDisplay(b.practitioner) ?? ''));
    return { members, audit };
  }, [medplum, isAdmin, project?.id]);

  return (
    <>
      <PageHeader
        title="Administration"
        subtitle={project?.name}
        actions={isAdmin && <Button leftSection={<IconUserPlus size={16} />} onClick={() => setInviting(true)}>Invite clinician</Button>}
      />
      {!isAdmin && <Alert color="yellow" mb="md">You are not a project administrator. User management is hidden.</Alert>}
      <Grid>
        <Grid.Col span={12}>
          <SectionCard title="Users" data-testid="users-card">
            {(data?.members ?? []).length === 0 ? (
              <EmptyState>{isAdmin ? 'No clinician accounts' : 'Admin access required'}</EmptyState>
            ) : (
              <Table.ScrollContainer minWidth={700}>
                <Table verticalSpacing="xs" highlightOnHover>
                  <Table.Thead>
                    <Table.Tr><Table.Th>Name</Table.Th><Table.Th>User name (sign-in email)</Table.Th><Table.Th>Role</Table.Th><Table.Th>Status</Table.Th><Table.Th /></Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {data?.members.map((m) => (
                      <Table.Tr key={m.membership.id}>
                        <Table.Td fw={500}>{profileDisplay(m.practitioner) ?? m.membership.profile?.display}</Table.Td>
                        <Table.Td>{m.email}</Table.Td>
                        <Table.Td>{m.membership.admin ? <Badge variant="light">Admin</Badge> : <Text size="sm">Clinician</Text>}</Table.Td>
                        <Table.Td>{m.membership.active === false ? <Badge color="gray" variant="light">Deactivated</Badge> : <Badge color="green" variant="light">Active</Badge>}</Table.Td>
                        <Table.Td>
                          <Button size="xs" variant="subtle" leftSection={<IconEdit size={14} />} onClick={() => setEditing(m)} aria-label={`Edit ${profileDisplay(m.practitioner) ?? 'user'}`}>Edit</Button>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
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
        <Grid.Col span={{ base: 12, lg: 6 }}>
          <Card withBorder>
            <Text fw={600} mb={4}>Server</Text>
            <Text size="sm" c="dimmed">{medplum.getBaseUrl()}</Text>
            <Text size="sm" c="dimmed">Project ID {project?.id}</Text>
            {!getProjectId() && (
              <Text size="xs" c="dimmed" mt="xs">
                Tip: set <code>MEDPLUM_PROJECT_ID={project?.id}</code> in .env so new clinicians get clinic-owned accounts whose sign-in email you can change here.
              </Text>
            )}
          </Card>
        </Grid.Col>
      </Grid>
      <Modal opened={inviting} onClose={() => setInviting(false)} title="Invite clinician">
        {inviting && <InviteForm projectId={project?.id as string} members={data?.members ?? []} onDone={() => { setInviting(false); reload(); }} />}
      </Modal>
      <Modal opened={!!editing} onClose={() => setEditing(undefined)} title="Edit user" size="xl">
        {editing && (
          <EditUserForm
            member={editing}
            members={data?.members ?? []}
            onDone={async () => {
              setEditing(undefined);
              await refreshSignedInProfile(medplum);
              reload();
            }}
          />
        )}
      </Modal>
    </>
  );
}

function EditUserForm({ member, members, onDone }: { member: Member; members: Member[]; onDone: () => Promise<void> }) {
  const medplum = useMedplum();
  const projectId = medplum.getProject()?.id as string;
  const isSelf = medplum.getProjectMembership()?.id === member.membership.id;
  const initial = practitionerToForm(member.practitioner);
  const currentEmail = member.email ?? '';
  const projectScoped = member.projectScoped;
  const [values, setValues] = useState<ProfileFormValues>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof ProfileFormValues, string>>>({});
  const [email, setEmail] = useState(currentEmail);
  const [admin, setAdmin] = useState(!!member.membership.admin);
  const [active, setActive] = useState(member.membership.active !== false);
  const [saving, setSaving] = useState(false);

  const emailChanged = email.trim().toLowerCase() !== currentEmail.toLowerCase();
  const conflict = emailChanged ? findEmailConflict(members, email, member.membership.id) : undefined;
  const emailError = emailChanged && !isValidEmail(email) ? 'Enter a valid email address' : conflict ? 'Another user already signs in with this email' : undefined;

  const save = async (): Promise<void> => {
    const errs = validateProfileForm(values);
    setErrors(errs);
    if (Object.keys(errs).length || emailError) return;
    setSaving(true);
    try {
      let practitioner = member.practitioner;
      if (practitioner && JSON.stringify(values) !== JSON.stringify(initial)) {
        practitioner = await medplum.updateResource(applyProfileForm(practitioner, values));
      }
      // $update-email must run before the membership update: it changes the user (and profile) it points to.
      if (emailChanged && projectScoped) {
        await updateLoginEmail(medplum, member.membership, email);
      }
      const latest = (await medplum.get(`admin/projects/${projectId}/members/${member.membership.id}`, { cache: 'no-cache' })) as ProjectMembership;
      const nextMembership: ProjectMembership = {
        ...latest,
        admin,
        active,
        profile: { ...latest.profile, display: practitionerDisplay(values) },
      };
      if (JSON.stringify(nextMembership) !== JSON.stringify(latest)) {
        await medplum.post(`admin/projects/${projectId}/members/${member.membership.id}`, nextMembership);
      }
      notifySuccess(emailChanged && projectScoped ? 'User updated. They have been signed out and must use the new email.' : 'User updated');
      await onDone();
    } catch (err) {
      notifyError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack>
      <Title order={6}>Profile</Title>
      {member.practitioner ? <ProfileFields values={values} errors={errors} onChange={setValues} /> : <Alert color="yellow">This user's profile could not be loaded.</Alert>}
      <Divider />
      <Title order={6}>Account</Title>
      <TextInput
        label="User name (sign-in email)"
        value={email}
        onChange={(e) => setEmail(e.currentTarget.value)}
        disabled={!projectScoped}
        error={emailError}
        description={
          projectScoped
              ? 'Changing this signs the user out everywhere; their password stays the same.'
              : 'This account is shared across Medplum projects, so only a Medplum server administrator can change its sign-in email.'
        }
      />
      <Group>
        <Switch label="Project administrator" checked={admin} disabled={isSelf} onChange={(e) => setAdmin(e.currentTarget.checked)} />
        <Switch label="Active (can sign in)" checked={active} disabled={isSelf} onChange={(e) => setActive(e.currentTarget.checked)} />
      </Group>
      {isSelf && <Text size="xs" c="dimmed">You can't remove your own admin role or deactivate yourself.</Text>}
      <Group justify="flex-end">
        <Button onClick={save} loading={saving} disabled={!!emailError}>Save changes</Button>
      </Group>
    </Stack>
  );
}

function InviteForm({ projectId, members, onDone }: { projectId: string; members: Member[]; onDone: () => void }) {
  const medplum = useMedplum();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [admin, setAdmin] = useState(false);
  const [saving, setSaving] = useState(false);
  // Clinic-owned accounts need the project ID at sign-in, so only create them when it is configured.
  const projectScoped = !!getProjectId();
  const conflict = email ? findEmailConflict(members, email, undefined) : undefined;

  const invite = async (): Promise<void> => {
    setSaving(true);
    try {
      await medplum.post(`admin/projects/${projectId}/invite`, {
        resourceType: 'Practitioner',
        firstName,
        lastName,
        email: email.trim().toLowerCase(),
        password: password || undefined,
        sendEmail: !password,
        admin,
        scope: projectScoped ? 'project' : 'server',
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
      <TextInput label="Email (user name)" type="email" value={email} onChange={(e) => setEmail(e.currentTarget.value)} required error={conflict ? 'Already a member of this project' : undefined} />
      <TextInput label="Initial password" description="Leave blank to send an invitation email instead" type="password" value={password} onChange={(e) => setPassword(e.currentTarget.value)} />
      <Checkbox label="Project administrator" checked={admin} onChange={(e) => setAdmin(e.currentTarget.checked)} />
      <Text size="xs" c="dimmed">
        {projectScoped
          ? 'Creates a clinic-owned account: administrators can later change its sign-in email.'
          : 'Creates a server-wide account. Set MEDPLUM_PROJECT_ID in .env to create clinic-owned accounts instead.'}
      </Text>
      <Group justify="flex-end"><Button onClick={invite} loading={saving} disabled={!firstName || !lastName || !isValidEmail(email) || !!conflict}>Send invite</Button></Group>
    </Stack>
  );
}
