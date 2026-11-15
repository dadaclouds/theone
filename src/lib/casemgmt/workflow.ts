// Case-management workflows shared by the web app and the demo seed script.
import type { MedplumClient } from '@medplum/core';
import type { Goal, Patient, Practitioner, Reference, ServiceRequest, Task } from '@medplum/fhirtypes';
import { CM_CODES, CM_SYSTEMS, UNIT_ALERT_THRESHOLD, cmCoding } from './constants';
import type { FocosClient } from './focos';
import { authorizationToFocos, formatAuthorizationNumber, identifierValue, medicaidId, unitUsage, visitGoalObservations, visitToEncounter } from './mapping';

export const DIVISION_DISPLAY = 'Division of Developmental Disabilities';

function goalRefs(sr: ServiceRequest): string[] {
  return (sr.supportingInfo ?? []).map((r) => r.reference ?? '').filter((r) => r.startsWith('Goal/'));
}

async function loadGoals(medplum: MedplumClient, sr: ServiceRequest): Promise<Goal[]> {
  return Promise.all(goalRefs(sr).map((ref) => medplum.readReference({ reference: ref } as Reference<Goal>)));
}

/** Case manager submits a planned service for Division approval. */
export async function requestAuthorization(
  medplum: MedplumClient,
  sr: ServiceRequest,
  requester: Reference<Practitioner> | undefined
): Promise<{ request: ServiceRequest; task: Task }> {
  const request = await medplum.updateResource<ServiceRequest>({ ...sr, intent: 'order', status: 'draft', authoredOn: new Date().toISOString(), requester });
  const task = await medplum.createResource<Task>({
    resourceType: 'Task',
    status: 'requested',
    intent: 'order',
    priority: 'routine',
    code: { coding: [cmCoding(CM_CODES.AUTH_APPROVAL, 'Service authorization approval')], text: 'Service authorization approval' },
    description: `Approve ${sr.code?.text ?? 'service'} for ${sr.subject.display ?? 'participant'}`,
    focus: { reference: `ServiceRequest/${request.id}`, display: sr.code?.text },
    for: sr.subject as Reference<Patient>,
    requester,
    owner: { display: DIVISION_DISPLAY },
    authoredOn: new Date().toISOString(),
  });
  return { request, task };
}

/** Sends an approved authorization (and its linked goals) to FOCOS and records the FOCOS id. */
export async function pushAuthorizationToFocos(medplum: MedplumClient, focos: FocosClient, sr: ServiceRequest): Promise<ServiceRequest> {
  const patient = await medplum.readReference(sr.subject as Reference<Patient>);
  const goals = await loadGoals(medplum, sr);
  const focosAuth = await focos.upsertAuthorization(authorizationToFocos(sr, patient, goals));
  if (identifierValue(sr, CM_SYSTEMS.FOCOS_AUTHORIZATION) === focosAuth.id) return sr;
  return medplum.updateResource<ServiceRequest>({
    ...sr,
    identifier: [...(sr.identifier ?? []).filter((i) => i.system !== CM_SYSTEMS.FOCOS_AUTHORIZATION), { system: CM_SYSTEMS.FOCOS_AUTHORIZATION, value: focosAuth.id }],
  });
}

/** Division approves: the authorization becomes active and is created in FOCOS for scheduling and EVV. */
export async function approveAuthorization(
  medplum: MedplumClient,
  focos: FocosClient,
  task: Task,
  decision: { units: number; start: string; end: string; reviewer?: string; now?: Date }
): Promise<ServiceRequest> {
  const sr = await medplum.readReference(task.focus as Reference<ServiceRequest>);
  const now = decision.now ?? new Date();
  const number = identifierValue(sr, CM_SYSTEMS.AUTHORIZATION_NUMBER) ?? formatAuthorizationNumber(now.getFullYear(), Number(String(now.getTime()).slice(-5)));
  const approved = await medplum.updateResource<ServiceRequest>({
    ...sr,
    status: 'active',
    quantityQuantity: { value: decision.units, unit: '15 min units' },
    occurrencePeriod: { start: decision.start, end: decision.end },
    identifier: [...(sr.identifier ?? []).filter((i) => i.system !== CM_SYSTEMS.AUTHORIZATION_NUMBER), { system: CM_SYSTEMS.AUTHORIZATION_NUMBER, value: number }],
  });
  const pushed = await pushAuthorizationToFocos(medplum, focos, approved);
  await medplum.updateResource<Task>({
    ...task,
    status: 'completed',
    businessStatus: { text: 'Approved' },
    lastModified: now.toISOString(),
    note: [...(task.note ?? []), { text: `Approved ${decision.units} units, ${decision.start} to ${decision.end}${decision.reviewer ? ` by ${decision.reviewer}` : ''}. Sent to FOCOS.`, time: now.toISOString() }],
  });
  return pushed;
}

export async function denyAuthorization(medplum: MedplumClient, task: Task, reason: string, reviewer?: string): Promise<void> {
  const sr = await medplum.readReference(task.focus as Reference<ServiceRequest>);
  await medplum.updateResource<ServiceRequest>({ ...sr, status: 'revoked', note: [...(sr.note ?? []), { text: `Denied: ${reason}` }] });
  await medplum.updateResource<Task>({
    ...task,
    status: 'rejected',
    businessStatus: { text: 'Denied' },
    statusReason: { text: reason },
    lastModified: new Date().toISOString(),
    note: [...(task.note ?? []), { text: `Denied${reviewer ? ` by ${reviewer}` : ''}: ${reason}`, time: new Date().toISOString() }],
  });
}

export interface SyncSummary {
  visits: number;
  observations: number;
  alerts: number;
}

/**
 * Pulls EVV-verified visits for a participant from FOCOS into FHIR: one Encounter per visit, goal
 * Observations linked to their Goals, and an alert Task when an authorization passes the unit
 * threshold. Conditional creates keyed on FOCOS identifiers make re-running safe.
 */
export async function syncParticipantFromFocos(medplum: MedplumClient, focos: FocosClient, patient: Patient): Promise<SyncSummary> {
  const mid = medicaidId(patient);
  if (!mid) return { visits: 0, observations: 0, alerts: 0 };
  const patientRef = { reference: `Patient/${patient.id}`, display: patient.name?.[0] ? `${patient.name[0].given?.join(' ')} ${patient.name[0].family}` : undefined } as Reference<Patient>;
  const [visits, auths] = await Promise.all([focos.listVisits({ medicaidId: mid }), focos.listAuthorizations(mid)]);
  const summary: SyncSummary = { visits: 0, observations: 0, alerts: 0 };
  const srCache = new Map<string, ServiceRequest>();
  const goalCache = new Map<string, Goal[]>();

  for (const visit of visits) {
    const srId = visit.externalRef.replace('ServiceRequest/', '');
    let sr = srCache.get(srId);
    if (!sr) {
      sr = await medplum.readResource('ServiceRequest', srId);
      srCache.set(srId, sr);
      goalCache.set(srId, await loadGoals(medplum, sr));
    }
    const goals = goalCache.get(srId) ?? [];
    const encounter = await medplum.createResourceIfNoneExist(visitToEncounter(visit, patientRef, sr), `identifier=${CM_SYSTEMS.FOCOS_VISIT}|${visit.id}`);
    summary.visits++;
    for (const obs of visitGoalObservations(visit, patientRef, encounter.id as string, goals)) {
      const saved = await medplum.createResourceIfNoneExist(obs, `identifier=${CM_SYSTEMS.GOAL_OBSERVATION}|${obs.identifier?.[0]?.value}`);
      summary.observations++;
      const goalId = obs.focus?.[0]?.reference?.split('/')[1];
      const goal = goals.find((g) => g.id === goalId);
      if (goal && !goal.outcomeReference?.some((r) => r.reference === `Observation/${saved.id}`)) {
        const updated = await medplum.updateResource<Goal>({ ...goal, outcomeReference: [...(goal.outcomeReference ?? []), { reference: `Observation/${saved.id}` }] });
        goalCache.set(srId, goals.map((g) => (g.id === updated.id ? updated : g)));
      }
    }
  }

  for (const a of auths) {
    const { ratio, remaining } = unitUsage(a.authorizedUnits, a.usedUnits);
    if (ratio < UNIT_ALERT_THRESHOLD) continue;
    const key = `${a.id}:cap-${Math.round(UNIT_ALERT_THRESHOLD * 100)}`;
    await medplum.createResourceIfNoneExist<Task>({
      resourceType: 'Task',
      identifier: [{ system: `${CM_SYSTEMS.CASE_MGMT}/alert`, value: key }],
      status: 'requested',
      intent: 'order',
      priority: ratio >= 1 ? 'urgent' : 'routine',
      code: { coding: [cmCoding(CM_CODES.AUTH_CAP_ALERT, 'Authorization nearing unit cap')], text: 'Authorization nearing unit cap' },
      description: `${a.serviceCode} ${a.serviceDescription}: ${a.usedUnits} of ${a.authorizedUnits} units used (${remaining} left) on ${a.authorizationNumber}`,
      for: patientRef,
      focus: { reference: a.externalRef },
      authoredOn: new Date().toISOString(),
    }, `identifier=${CM_SYSTEMS.CASE_MGMT}/alert|${key}`);
    summary.alerts++;
  }
  return summary;
}
