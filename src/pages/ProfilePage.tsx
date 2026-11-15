import { Alert, Badge, Button, Card, Group, Modal, Stack, Text, TextInput, Title } from '@mantine/core';
import type { Practitioner, ProjectMembership } from '@medplum/fhirtypes';
import { ChangePasswordForm, useMedplum, useMedplumProfile } from '@medplum/react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { PageHeader } from '../components/common';
import { notifyError, notifySuccess } from '../components/notify';
import { ProfileFields } from '../components/ProfileFields';
import { findEmailConflict, getOwnLoginEmail, loadAccountInfo, membershipLoginEmail, refreshSignedInProfile, signOutLocally, updateLoginEmail } from '../lib/accounts';

type AccountRow = { membership: ProjectMembership; email?: string };
import { useAsync } from '../lib/hooks';
import { applyProfileForm, isValidEmail, practitionerDisplay, practitionerToForm, validateProfileForm, type ProfileFormValues } from '../lib/practitioner';

export function ProfilePage() {
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const navigate = useNavigate();
  const membership = medplum.getProjectMembership();
  const isAdmin = !!membership?.admin;

  const { data, reload } = useAsync(async () => {
    if (profile?.resourceType !== 'Practitioner') return undefined;
    const practitioner = await medplum.readResource('Practitioner', profile.id as string, { cache: 'no-cache' });
    const loginEmail = await getOwnLoginEmail(medplum);
    const canChangeEmail = isAdmin && membership ? (await loadAccountInfo(medplum, membership)).projectScoped : false;
    const memberships = isAdmin ? await medplum.searchResources('ProjectMembership', { _count: '500' }, { cache: 'no-cache' }) : [];
    const members = await Promise.all(memberships.map(async (m) => ({ membership: m, ...(await loadAccountInfo(medplum, m)) })));
    return { practitioner, loginEmail, canChangeEmail, members };
  }, [medplum, profile?.id, isAdmin]);

  if (profile && profile.resourceType !== 'Practitioner') {
    return <Alert color="yellow">Profile editing is available for clinician (Practitioner) accounts.</Alert>;
  }

  return (
    <>
      <PageHeader title="My profile" subtitle="Your name and details as shown to colleagues and on clinical records" />
      <Stack maw={900}>
        {data && (
          <ProfileCard
            key={data.practitioner.meta?.versionId}
            practitioner={data.practitioner}
            membership={membership}
            onSaved={async () => {
              await refreshSignedInProfile(medplum);
              reload();
            }}
          />
        )}
        <SignInCard
          key={data?.loginEmail}
          membership={membership}
          loginEmail={data?.loginEmail}
          canChange={!!data?.canChangeEmail}
          members={data?.members ?? []}
          onChanged={async () => {
            await signOutLocally(medplum);
            navigate('/signin');
          }}
        />
        <Card withBorder>
          <Title order={5} mb="sm">Password</Title>
          <ChangePasswordForm onSuccess={() => notifySuccess('Password changed')} />
        </Card>
      </Stack>
    </>
  );
}

function ProfileCard({ practitioner, membership, onSaved }: { practitioner: Practitioner; membership: ProjectMembership | undefined; onSaved: () => Promise<void> }) {
  const medplum = useMedplum();
  const [values, setValues] = useState<ProfileFormValues>(practitionerToForm(practitioner));
  const [errors, setErrors] = useState<Partial<Record<keyof ProfileFormValues, string>>>({});
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(values) !== JSON.stringify(practitionerToForm(practitioner));

  const save = async (): Promise<void> => {
    const errs = validateProfileForm(values);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      await medplum.updateResource(applyProfileForm(practitioner, values));
      // Keep the cached display name on the membership in sync (admins only; harmless to skip otherwise).
      if (membership?.admin && membership.id) {
        await medplum
          .post(`admin/projects/${medplum.getProject()?.id}/members/${membership.id}`, { ...membership, profile: { ...membership.profile, display: practitionerDisplay(values) } })
          .catch(() => undefined);
      }
      notifySuccess('Profile updated');
      await onSaved();
    } catch (err) {
      notifyError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card withBorder>
      <Group justify="space-between" mb="sm">
        <Title order={5}>Name & contact</Title>
        <Text size="sm" c="dimmed">Shown as: <b>{practitionerDisplay(values) || '—'}</b></Text>
      </Group>
      <ProfileFields values={values} errors={errors} onChange={setValues} />
      <Text size="xs" c="dimmed" mt="sm">
        Notes, orders and other records you already signed keep the name that was current at the time.
      </Text>
      <Group justify="flex-end" mt="md">
        <Button variant="default" disabled={!dirty || saving} onClick={() => setValues(practitionerToForm(practitioner))}>Reset</Button>
        <Button onClick={save} loading={saving} disabled={!dirty}>Save profile</Button>
      </Group>
    </Card>
  );
}

function SignInCard({ membership, loginEmail, canChange, members, onChanged }: { membership: ProjectMembership | undefined; loginEmail: string | undefined; canChange: boolean; members: AccountRow[]; onChanged: () => Promise<void> }) {
  const medplum = useMedplum();
  const current = loginEmail ?? membershipLoginEmail(membership) ?? '';
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);

  const conflict = email ? findEmailConflict(members, email, membership?.id) : undefined;
  const invalid = email.trim() !== '' && !isValidEmail(email);

  const change = async (): Promise<void> => {
    if (!membership) return;
    setSaving(true);
    try {
      await updateLoginEmail(medplum, membership, email);
      notifySuccess('Sign-in email changed. Please sign in again with the new email.');
      setEditing(false);
      await onChanged();
    } catch (err) {
      notifyError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card withBorder data-testid="signin-card">
      <Title order={5} mb="sm">Sign-in</Title>
      <Group justify="space-between" align="flex-end">
        <div>
          <Text size="xs" c="dimmed">User name (sign-in email)</Text>
          <Text fw={500} data-testid="login-email">{current}</Text>
        </div>
        {canChange ? (
          <Button variant="light" onClick={() => { setEmail(current); setEditing(true); }}>Change sign-in email</Button>
        ) : (
          <Badge variant="light" color="gray">Managed by your administrator</Badge>
        )}
      </Group>
      {!canChange && (
        <Text size="xs" c="dimmed" mt="xs">
          To change the email you sign in with, ask a project administrator. Accounts shared across Medplum projects can only be changed by a Medplum server administrator.
        </Text>
      )}
      <Modal opened={editing} onClose={() => setEditing(false)} title="Change sign-in email">
        <Stack>
          <TextInput label="New sign-in email" type="email" value={email} onChange={(e) => setEmail(e.currentTarget.value)} error={invalid ? 'Enter a valid email address' : conflict ? 'Another user already signs in with this email' : undefined} data-autofocus />
          <Alert color="yellow">You will be signed out everywhere and must sign in again with the new email. Your password stays the same.</Alert>
          <Group justify="flex-end">
            <Button onClick={change} loading={saving} disabled={!email.trim() || invalid || !!conflict || email.trim().toLowerCase() === current.toLowerCase()}>Change email</Button>
          </Group>
        </Stack>
      </Modal>
    </Card>
  );
}
