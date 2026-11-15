/**
 * Seeds the FOCOS case-management demo story into an existing project (run `npm run seed` first)
 * and the mock FOCOS service (run `npm run focos-mock`).
 *
 *   npm run seed:demo
 *
 * Creates:
 *  - Alex Rivera: screened, enrolled, ISP with two goals, two approved authorizations sent to FOCOS,
 *    and a month of EVV-verified visits (with goal data) synced back. One authorization is past
 *    80% of its units to show the cap alert.
 *  - Taylor Morgan: newly referred, for the live intake -> plan -> authorization -> visit demo.
 * Safe to re-run: participants are keyed on Medicaid ID.
 */
import { MedplumClient } from '@medplum/core';
import type { CarePlan, EpisodeOfCare, Goal, Observation, Patient, Practitioner, QuestionnaireResponse, Reference, ServiceRequest } from '@medplum/fhirtypes';
import { existsSync, readFileSync } from 'node:fs';
import { SCREENING_DOMAINS, SCREENING_QUESTIONNAIRE, SCREENING_URL, scoreScreening } from '../src/lib/casemgmt/assessment';
import { CM_CODES, CM_SYSTEMS, HCBS_SERVICES, WAIVERS, cmCoding } from '../src/lib/casemgmt/constants';
import { FocosClient } from '../src/lib/casemgmt/focos';
import { identifierValue } from '../src/lib/casemgmt/mapping';
import { approveAuthorization, requestAuthorization, syncParticipantFromFocos } from '../src/lib/casemgmt/workflow';
import { SYSTEMS } from '../src/lib/constants';

const env: Record<string, string> = {};
const envFile = new URL('../.env', import.meta.url);
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
}
const get = (k: string, d = '') => process.env[k] ?? env[k] ?? d;
const BASE_URL = get('MEDPLUM_BASE_URL', 'http://localhost:8103/');
const EMAIL = get('DEMO_EMAIL', 'dr.chen@example.com');
const PASSWORD = get('DEMO_PASSWORD', 'Riverside-demo-2026!');
const PROJECT_ID = get('MEDPLUM_PROJECT_ID') || undefined;
const FOCOS_URL = get('MEDPLUM_FOCOS_API_URL', 'http://localhost:4100');
const FOCOS_KEY = get('MEDPLUM_FOCOS_API_KEY', 'demo-focos-key');

const medplum = new MedplumClient({ baseUrl: BASE_URL });
const focos = new FocosClient({ baseUrl: FOCOS_URL, apiKey: FOCOS_KEY });

const daysAgo = (n: number, hour = 9) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(hour, 0, 0, 0); return d; };
const ymd = (d: Date) => d.toISOString().slice(0, 10);

async function signIn(): Promise<Reference<Practitioner>> {
  const login = await medplum.startLogin({ email: EMAIL, password: PASSWORD, projectId: PROJECT_ID });
  if (login.code) await medplum.processCode(login.code);
  else {
    const res = await medplum.post('auth/profile', { login: login.login, profile: login.memberships?.[0]?.id });
    await medplum.processCode(res.code);
  }
  const p = medplum.getProfile() as Practitioner;
  const n = p.name?.[0];
  return { reference: `Practitioner/${p.id}`, display: [n?.prefix?.join(' '), n?.given?.join(' '), n?.family].filter(Boolean).join(' ') };
}

async function participant(given: string, family: string, birthDate: string, gender: Patient['gender'], mid: string, mrn: string): Promise<{ patient: Patient; ref: Reference<Patient>; isNew: boolean }> {
  const existing = await medplum.searchOne('Patient', { identifier: `${CM_SYSTEMS.MEDICAID_ID}|${mid}` }, { cache: 'no-cache' });
  const patient = existing ?? await medplum.createResourceIfNoneExist<Patient>({
    resourceType: 'Patient', active: true,
    identifier: [{ system: CM_SYSTEMS.MEDICAID_ID, value: mid, type: { text: 'Medicaid ID' } }, { system: SYSTEMS.MRN, value: mrn, type: { text: 'MRN' } }],
    name: [{ use: 'official', given: [given], family }], birthDate, gender,
    telecom: [{ system: 'phone', value: '(605) 555-0140', use: 'mobile' }],
    address: [{ use: 'home', line: ['418 W 12th St'], city: 'Sioux Falls', state: 'SD', postalCode: '57104', country: 'US' }],
  }, `identifier=${CM_SYSTEMS.MEDICAID_ID}|${mid}`);
  return { patient, ref: { reference: `Patient/${patient.id}`, display: `${given} ${family}` }, isNew: !existing };
}

async function main(): Promise<void> {
  await focos.listAuthorizations().catch(() => { throw new Error(`Mock FOCOS not reachable at ${FOCOS_URL}. Start it with: npm run focos-mock`); });
  const me = await signIn();
  console.log(`Seeding demo as ${me.display} into ${medplum.getProject()?.name}`);
  await medplum.createResourceIfNoneExist(SCREENING_QUESTIONNAIRE, `url=${SCREENING_URL}`);

  const taylor = await participant('Taylor', 'Morgan', '2004-06-02', 'female', 'SD5582094', '20000002');
  console.log(taylor.isNew ? 'Created Taylor Morgan (fresh referral for the live demo)' : 'Taylor Morgan already exists');

  const alex = await participant('Alex', 'Rivera', '1998-09-14', 'male', 'SD4471023', '20000001');
  if (!alex.isNew) {
    console.log('Alex Rivera already exists; syncing latest FOCOS visits only.');
    console.log(await syncParticipantFromFocos(medplum, focos, alex.patient));
    return;
  }

  // 1. Screening and eligibility
  const answers = ['2', '1', '1', '2', '1', '2'];
  const qr = await medplum.createResource<QuestionnaireResponse>({
    resourceType: 'QuestionnaireResponse', questionnaire: SCREENING_URL, status: 'completed', subject: alex.ref, author: me, authored: daysAgo(45).toISOString(),
    item: [
      { linkId: 'domains', item: SCREENING_DOMAINS.map((d, i) => ({ linkId: d.linkId, text: d.text, answer: [{ valueCoding: { system: `${SCREENING_URL}/levels`, code: answers[i] } }] })) },
      { linkId: 'diagnosis-confirmed', answer: [{ valueBoolean: true }] },
      { linkId: 'notes', answer: [{ valueString: 'Lives with family; wants more independence at home and at work.' }] },
    ],
  });
  const score = scoreScreening(qr);
  await medplum.createResource<Observation>({
    resourceType: 'Observation', status: 'final', subject: alex.ref, effectiveDateTime: qr.authored, performer: [me],
    code: { coding: [cmCoding(CM_CODES.LEVEL_OF_CARE, 'Level of care determination (screening)')], text: 'Level of care (screening)' },
    valueCodeableConcept: { text: score.tier },
    component: [{ code: { coding: [cmCoding(CM_CODES.SCREENING_SCORE, 'Functional needs score')] }, valueInteger: score.total }],
    derivedFrom: [{ reference: `QuestionnaireResponse/${qr.id}` }],
  });
  const waiver = WAIVERS[0];
  await medplum.createResource<EpisodeOfCare>({
    resourceType: 'EpisodeOfCare', status: 'active', patient: alex.ref, careManager: me, period: { start: ymd(daysAgo(40)) },
    type: [{ coding: [{ system: `${CM_SYSTEMS.CASE_MGMT}/waiver`, code: waiver.code, display: waiver.display }], text: waiver.display }],
  });

  // 2. Support plan with goals
  const planStart = daysAgo(35);
  const planEnd = new Date(planStart); planEnd.setFullYear(planEnd.getFullYear() + 1); planEnd.setDate(planEnd.getDate() - 1);
  let plan = await medplum.createResource<CarePlan>({
    resourceType: 'CarePlan', status: 'active', intent: 'plan', subject: alex.ref, author: me, created: planStart.toISOString(),
    category: [{ coding: [cmCoding(CM_CODES.ISP, 'Individual Support Plan')], text: 'Individual Support Plan' }],
    title: `Individual Support Plan · ${waiver.display}`,
    description: 'Alex wants to cook for himself, keep his part-time job at the grocery store, and see his friends on weekends.',
    period: { start: ymd(planStart), end: ymd(planEnd) },
  });
  const goal = (text: string, measure: string, target: number, unit: string) => medplum.createResource<Goal>({
    resourceType: 'Goal', lifecycleStatus: 'active', subject: alex.ref, startDate: ymd(planStart), description: { text },
    achievementStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/goal-achievement', code: 'in-progress', display: 'In Progress' }] },
    target: [{ measure: { text: measure }, detailQuantity: { value: target, unit }, dueDate: ymd(planEnd) }],
  });
  const cooking = await goal('Prepare a simple meal independently', '% of meal-prep steps completed independently', 80, '%');
  const work = await goal('Arrive at work on time using the bus', 'On-time arrivals this week', 5, 'times');
  plan = await medplum.updateResource({ ...plan, goal: [cooking, work].map((g) => ({ reference: `Goal/${g.id}`, display: g.description.text })) });

  // 3. Planned services -> request -> Division approval -> FOCOS
  const service = async (code: string, units: number, provider: string, goals: Goal[]) => {
    const svc = HCBS_SERVICES.find((s) => s.code === code)!;
    const sr = await medplum.createResource<ServiceRequest>({
      resourceType: 'ServiceRequest', status: 'draft', intent: 'plan', subject: alex.ref,
      category: [{ coding: [cmCoding(CM_CODES.PLANNED_SERVICE, 'Planned waiver service')] }],
      code: { coding: [{ system: CM_SYSTEMS.HCPCS, code: svc.code, display: svc.display }], text: svc.display },
      basedOn: [{ reference: `CarePlan/${plan.id}` }], quantityQuantity: { value: units, unit: '15 min units' },
      occurrencePeriod: { start: ymd(planStart), end: ymd(planEnd) }, performer: [{ display: provider }],
      supportingInfo: goals.map((g) => ({ reference: `Goal/${g.id}`, display: g.description.text })),
    });
    const { task } = await requestAuthorization(medplum, sr, me as Reference<Practitioner>);
    return approveAuthorization(medplum, focos, task, { units, start: ymd(planStart), end: ymd(planEnd), reviewer: 'Division reviewer (demo)' });
  };
  const dayHab = await service('T2021', 480, 'Prairie Community Supports', [cooking]);
  const attendant = await service('S5125', 40, 'Prairie Community Supports', [work]);
  plan = await medplum.updateResource({ ...plan, activity: [dayHab, attendant].map((s) => ({ reference: { reference: `ServiceRequest/${s.id}`, display: s.code?.text } })) });

  // 4. A month of EVV visits recorded in FOCOS (as the EVV app would), then synced back
  const auths = await focos.listAuthorizations('SD4471023');
  const focosId = (sr: ServiceRequest) => identifierValue(sr, CM_SYSTEMS.FOCOS_AUTHORIZATION)!;
  const post = (body: unknown) => fetch(`${FOCOS_URL}/api/visits`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': FOCOS_KEY }, body: JSON.stringify(body) }).then((r) => r.json());
  const cookingScores = [30, 35, 40, 40, 50, 55, 60, 65];
  for (let i = 0; i < cookingScores.length; i++) {
    const start = daysAgo(28 - i * 3, 10);
    await post({
      authorizationId: focosId(dayHab), renderingProvider: i % 2 ? 'Jordan Lee' : 'Sam Ortiz', actualStart: start.toISOString(),
      actualEnd: new Date(start.getTime() + 60 * 60000).toISOString(), gps: { lat: 43.5446 + i * 0.0005, lng: -96.7311 }, participantSignature: true,
      notes: i === cookingScores.length - 1 ? 'Made pasta with minimal prompts. Needed help draining the pot.' : 'Practiced meal prep; reviewed kitchen safety.',
      goalData: [{ goalId: cooking.id, value: cookingScores[i] }],
    });
  }
  const onTime = [2, 3, 3, 4];
  for (let w = 0; w < onTime.length; w++) {
    // 4 + 5 = 9 units per week of job-coach attendant care -> 36 of 40 units (90%) to show the cap alert
    for (const [d, mins] of [[0, 60], [2, 75]] as const) {
      const start = daysAgo(27 - w * 7 - d, 7);
      await post({
        authorizationId: focosId(attendant), renderingProvider: 'Jordan Lee', actualStart: start.toISOString(), actualEnd: new Date(start.getTime() + mins * 60000).toISOString(),
        gps: { lat: 43.5502, lng: -96.7003 }, participantSignature: true, notes: 'Bus travel training to work.',
        goalData: d === 2 ? [{ goalId: work.id, value: onTime[w] }] : [],
      });
    }
  }
  console.log(`FOCOS authorizations: ${auths.map((a) => a.authorizationNumber).join(', ')}`);
  console.log('Sync:', await syncParticipantFromFocos(medplum, focos, alex.patient));
  console.log('Demo seed complete.');
}

main().catch((err) => { console.error(err); process.exit(1); });
