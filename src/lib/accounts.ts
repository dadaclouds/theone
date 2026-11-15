import type { MedplumClient } from '@medplum/core';
import type { ProjectMembership, User } from '@medplum/fhirtypes';
import { isValidEmail } from './practitioner';

export function userId(membership: ProjectMembership | undefined): string | undefined {
  return membership?.user?.reference?.split('/')[1];
}

/** Sign-in email as recorded on the membership (Medplum stores the user's email as the display). */
export function membershipLoginEmail(membership: ProjectMembership | undefined): string | undefined {
  const display = membership?.user?.display;
  return display && display.includes('@') ? display : undefined;
}

export interface AccountInfo {
  /** Current sign-in email (from the User resource when readable, else the membership's cached display). */
  readonly email: string | undefined;
  /** True when the account belongs to this project, so project admins may change its sign-in email. */
  readonly projectScoped: boolean;
}

/** Loads sign-in details for a member. Server-scoped Users are not readable by project admins. */
export async function loadAccountInfo(medplum: MedplumClient, membership: ProjectMembership): Promise<AccountInfo> {
  const id = userId(membership);
  if (id) {
    try {
      const user = (await medplum.readResource('User', id, { cache: 'no-cache' })) as User;
      return { email: user.email ?? membershipLoginEmail(membership), projectScoped: !!user.project };
    } catch {
      // server-scoped account
    }
  }
  return { email: membershipLoginEmail(membership), projectScoped: false };
}

/** The signed-in user's own current sign-in email. */
export async function getOwnLoginEmail(medplum: MedplumClient): Promise<string | undefined> {
  const me = (await medplum.get('auth/me', { cache: 'no-cache' })) as { user?: { email?: string } };
  return me.user?.email;
}

/** Returns the other project member already using this sign-in email, if any. */
export function findEmailConflict(
  accounts: { membership: ProjectMembership; email?: string }[],
  email: string,
  exceptMembershipId: string | undefined
): ProjectMembership | undefined {
  const target = email.trim().toLowerCase();
  return accounts.find((a) => a.membership.id !== exceptMembershipId && (a.email ?? membershipLoginEmail(a.membership))?.toLowerCase() === target)?.membership;
}

/**
 * Changes a project-scoped user's sign-in email with Medplum's `$update-email` operation, which also
 * updates the profile's contact email, invalidates outstanding invites/resets and signs the user out.
 * Never edit `User.email` directly: that path does not preserve the password.
 */
export async function updateLoginEmail(medplum: MedplumClient, membership: ProjectMembership, email: string): Promise<void> {
  const id = userId(membership);
  if (!id) throw new Error('Membership has no user');
  if (!isValidEmail(email)) throw new Error('Enter a valid email address');
  await medplum.post(medplum.fhirUrl('User', id, '$update-email'), {
    resourceType: 'Parameters',
    parameter: [
      { name: 'email', valueString: email.trim().toLowerCase() },
      { name: 'updateProfileTelecom', valueBoolean: true },
      { name: 'skipEmailVerification', valueBoolean: true },
    ],
  });
}

/**
 * Signs out locally. After a sign-in email change the server has already revoked every session,
 * so the server-side sign-out call can fail with 401; local state must be cleared regardless.
 */
export async function signOutLocally(medplum: MedplumClient): Promise<void> {
  try {
    await medplum.signOut();
  } catch {
    medplum.clear();
  }
}

/** Re-reads the signed-in user's profile so the header and menus show edits immediately. */
export async function refreshSignedInProfile(medplum: MedplumClient): Promise<void> {
  const login = medplum.getActiveLogin();
  if (login) {
    await medplum.setActiveLogin(login);
  }
}
