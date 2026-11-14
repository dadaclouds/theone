/**
 * Seeds a Medplum server with a demo clinic ("Riverside Family Medicine"), clinicians and
 * realistic patient charts so the EHR can be explored immediately.
 *
 *   MEDPLUM_BASE_URL=http://localhost:8103/ npm run seed
 *
 * Re-running is safe: if the demo clinician already exists the script signs in and only
 * tops up today's schedule.
 */
import { MedplumClient, createReference, getReferenceString } from '@medplum/core';
import type {
  AllergyIntolerance, Appointment, Communication, Condition, Coverage, DocumentReference, Encounter, Immunization,
  MedicationRequest, Organization, Patient, Practitioner, ProjectMembership, Reference, ServiceRequest, Task,
} from '@medplum/fhirtypes';
import { buildClaim, buildSelfPayCoverage } from '../src/lib/billing';
import { ALLERGENS, LAB_TESTS, MEDICATIONS, PROBLEMS, REACTIONS, VACCINES, type CatalogItem } from '../src/lib/catalog';
import { SYSTEMS, TASK_CODES } from '../src/lib/constants';
import { conceptFromCatalog, patientName } from '../src/lib/fhir';
import { buildResultObservations } from '../src/lib/labs';
import { buildNoteDocument, type SoapNote } from '../src/lib/notes';
import { buildVitalObservations, type VitalValues } from '../src/lib/vitals';

const BASE_URL = process.env.MEDPLUM_BASE_URL ?? 'http://localhost:8103/';
export const DEMO = {
  email: process.env.DEMO_EMAIL ?? 'dr.chen@example.com',
  password: process.env.DEMO_PASSWORD ?? 'Riverside-demo-2026!',
  project: 'Riverside Family Medicine',
};

const medplum = new MedplumClient({ baseUrl: BASE_URL });

const find = (list: readonly CatalogItem[], code: string): CatalogItem => {
  const item = list.find((i) => i.code === code);
  if (!item) throw new Error(`Unknown code ${code}`);
  return item;
};
const at = (daysFromNow: number, hour: number, minute = 0): Date => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, minute, 0, 0);
  return d;
};
const iso = (d: Date) => d.toISOString();

async function loginAs(client: MedplumClient, email: string, password: string, projectName?: string): Promise<void> {
  const login = await client.startLogin({ email, password });
  if (login.code) {
    await client.processCode(login.code);
    return;
  }
  const memberships = login.memberships ?? [];
  const m = memberships.find((x) => x.project?.display === projectName) ?? memberships[0];
  const res = await client.post('auth/profile', { login: login.login, profile: m.id });
  await client.processCode(res.code);
}

/**
 * Signs in as the demo clinician, creating the clinic project first if needed.
 * Project creation uses the server's super-admin account (a fresh self-hosted Medplum seeds
 * admin@example.com / medplum_admin), falling back to self-registration for hosted servers.
 */
async function signIn(): Promise<{ practitioner: Practitioner; isNew: boolean }> {
  try {
    await loginAs(medplum, DEMO.email, DEMO.password, DEMO.project);
    console.log(`Signed in as existing demo user ${DEMO.email}`);
    return { practitioner: medplum.getProfile() as Practitioner, isNew: false };
  } catch {
    // fall through: user does not exist yet
  }
  const adminEmail = process.env.MEDPLUM_ADMIN_EMAIL ?? 'admin@example.com';
  const adminPassword = process.env.MEDPLUM_ADMIN_PASSWORD ?? 'medplum_admin';
  const admin = new MedplumClient({ baseUrl: BASE_URL });
  try {
    await loginAs(admin, adminEmail, adminPassword);
  } catch {
    console.log('Super-admin login unavailable; registering a new project instead.');
    const user = await medplum.startNewUser({ firstName: 'Maya', lastName: 'Chen', email: DEMO.email, password: DEMO.password, recaptchaToken: '' });
    const project = await medplum.startNewProject({ login: user.login as string, projectName: DEMO.project });
    await medplum.processCode(project.code as string);
    return { practitioner: medplum.getProfile() as Practitioner, isNew: true };
  }
  const project = await admin.createResource({ resourceType: 'Project', name: DEMO.project, strictMode: true });
  await admin.post(`admin/projects/${project.id}/invite`, {
    resourceType: 'Practitioner', firstName: 'Maya', lastName: 'Chen', email: DEMO.email, password: DEMO.password, sendEmail: false, admin: true,
  });
  await loginAs(medplum, DEMO.email, DEMO.password, DEMO.project);
  console.log(`Created project "${DEMO.project}" and admin user ${DEMO.email}`);
  return { practitioner: medplum.getProfile() as Practitioner, isNew: true };
}

async function invite(firstName: string, lastName: string, email: string, prefix?: string): Promise<Practitioner> {
  const existing = await medplum.searchOne('Practitioner', { family: lastName, given: firstName });
  if (existing) return existing;
  const projectId = medplum.getProject()?.id;
  const membership = (await medplum.post(`admin/projects/${projectId}/invite`, {
    resourceType: 'Practitioner', firstName, lastName, email, password: DEMO.password, sendEmail: false,
  })) as ProjectMembership;
  const practitioner = await medplum.readReference(membership.profile as Reference<Practitioner>);
  if (prefix) {
    return medplum.updateResource({ ...practitioner, name: [{ prefix: [prefix], given: [firstName], family: lastName }] });
  }
  return practitioner;
}

const pref = (p: Practitioner): Reference<Practitioner> => ({ reference: getReferenceString(p as Practitioner & { id: string }), display: `Dr. ${p.name?.[0]?.given?.[0]} ${p.name?.[0]?.family}` });

interface PatientSpec {
  given: string; family: string; gender: Patient['gender']; birthDate: string; phone: string; city: string;
  mrn: string; payer?: { name: string; member: string; group: string };
}

async function createPatient(spec: PatientSpec): Promise<{ patient: Patient; ref: Reference<Patient>; coverage: Coverage }> {
  const patient = await medplum.createResource<Patient>({
    resourceType: 'Patient',
    active: true,
    identifier: [{ system: SYSTEMS.MRN, value: spec.mrn, type: { text: 'MRN' } }],
    name: [{ use: 'official', given: [spec.given], family: spec.family }],
    gender: spec.gender,
    birthDate: spec.birthDate,
    telecom: [{ system: 'phone', value: spec.phone, use: 'mobile' }, { system: 'email', value: `${spec.given}.${spec.family}@example.net`.toLowerCase().replace(/'/g, '') }],
    address: [{ use: 'home', line: [`${100 + Math.floor(Math.random() * 900)} Oak Street`], city: spec.city, state: 'OR', postalCode: '97201', country: 'US' }],
    communication: [{ language: { coding: [{ system: 'urn:ietf:bcp:47', code: 'en', display: 'English' }] }, preferred: true }],
  });
  const ref = { reference: getReferenceString(patient as Patient & { id: string }), display: patientName(patient) } as Reference<Patient>;
  let coverage: Coverage;
  if (spec.payer) {
    let org = await medplum.searchOne('Organization', { name: spec.payer.name });
    org ??= await medplum.createResource<Organization>({ resourceType: 'Organization', name: spec.payer.name, type: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/organization-type', code: 'pay' }] }] });
    coverage = await medplum.createResource<Coverage>({
      resourceType: 'Coverage', status: 'active', beneficiary: ref, subscriberId: spec.payer.member,
      relationship: { coding: [{ system: SYSTEMS.SUBSCRIBER_REL, code: 'self' }] },
      payor: [{ ...createReference(org), display: org.name }],
      class: [{ type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/coverage-class', code: 'group' }] }, value: spec.payer.group }],
    });
  } else {
    coverage = await medplum.createResource(buildSelfPayCoverage(ref));
  }
  return { patient, ref, coverage };
}

async function problem(ref: Reference<Patient>, code: string, onset: string, status = 'active'): Promise<Condition> {
  return medplum.createResource<Condition>({
    resourceType: 'Condition', subject: ref,
    category: [{ coding: [{ system: SYSTEMS.CONDITION_CATEGORY, code: 'problem-list-item', display: 'Problem List Item' }] }],
    code: conceptFromCatalog(find(PROBLEMS, code)),
    clinicalStatus: { coding: [{ system: SYSTEMS.CONDITION_CLINICAL, code: status }] },
    verificationStatus: { coding: [{ system: SYSTEMS.CONDITION_VER, code: 'confirmed' }] },
    onsetDateTime: onset, recordedDate: onset,
  });
}

async function allergy(ref: Reference<Patient>, code: string, reaction: string, severity: 'mild' | 'moderate' | 'severe', category: 'medication' | 'food' | 'environment'): Promise<void> {
  await medplum.createResource<AllergyIntolerance>({
    resourceType: 'AllergyIntolerance', patient: ref, code: conceptFromCatalog(find(ALLERGENS, code)),
    clinicalStatus: { coding: [{ system: SYSTEMS.ALLERGY_CLINICAL, code: 'active' }] },
    verificationStatus: { coding: [{ system: SYSTEMS.ALLERGY_VER, code: 'confirmed' }] },
    type: 'allergy', category: [category], criticality: severity === 'severe' ? 'high' : 'low',
    reaction: [{ manifestation: [conceptFromCatalog(find(REACTIONS, reaction))], severity }],
    recordedDate: iso(at(-400, 10)),
  });
}

async function nka(ref: Reference<Patient>): Promise<void> {
  await medplum.createResource<AllergyIntolerance>({
    resourceType: 'AllergyIntolerance', patient: ref,
    code: { coding: [{ system: SYSTEMS.SNOMED, code: '716186003', display: 'No known allergy' }], text: 'No known allergy' },
    clinicalStatus: { coding: [{ system: SYSTEMS.ALLERGY_CLINICAL, code: 'active' }] },
    verificationStatus: { coding: [{ system: SYSTEMS.ALLERGY_VER, code: 'confirmed' }] },
    recordedDate: iso(at(-200, 10)),
  });
}

async function med(ref: Reference<Patient>, prescriber: Reference<Practitioner>, code: string, sig: string, authored: Date, status: MedicationRequest['status'] = 'active'): Promise<void> {
  await medplum.createResource<MedicationRequest>({
    resourceType: 'MedicationRequest', status, intent: 'order', subject: ref, requester: prescriber,
    medicationCodeableConcept: conceptFromCatalog(find(MEDICATIONS, code)), authoredOn: iso(authored),
    dosageInstruction: [{ text: sig }],
    dispenseRequest: { numberOfRepeatsAllowed: 3, quantity: { value: 90, unit: 'each' }, expectedSupplyDuration: { value: 90, unit: 'days', system: 'http://unitsofmeasure.org', code: 'd' } },
  });
}

async function vaccine(ref: Reference<Patient>, code: string, date: Date, lot?: string): Promise<void> {
  await medplum.createResource<Immunization>({
    resourceType: 'Immunization', status: 'completed', patient: ref, vaccineCode: conceptFromCatalog(find(VACCINES, code)),
    occurrenceDateTime: iso(date).slice(0, 10), primarySource: true, lotNumber: lot, site: { text: 'Left deltoid' },
  });
}

async function labResult(
  ref: Reference<Patient>, prescriber: Reference<Practitioner>, loinc: string, values: Record<string, string>, date: Date,
  opts: { reviewed: boolean; encounter?: Reference<Encounter> }
): Promise<void> {
  const test = LAB_TESTS.find((t) => t.code === loinc);
  if (!test) throw new Error(loinc);
  const order = await medplum.createResource<ServiceRequest>({
    resourceType: 'ServiceRequest', status: 'completed', intent: 'order', subject: ref, requester: prescriber, encounter: opts.encounter,
    code: conceptFromCatalog(test), authoredOn: iso(new Date(date.getTime() - 86400000)),
    category: [{ coding: [{ system: SYSTEMS.SNOMED, code: '108252007', display: 'Laboratory procedure' }] }],
  });
  const entries = test.analytes.map((a) => ({ ...a, value: values[a.code] ?? '' }));
  const obs = await Promise.all(buildResultObservations(entries, ref, createReference(order), iso(date)).map((o) => medplum.createResource(o)));
  const report = await medplum.createResource({
    resourceType: 'DiagnosticReport', status: 'final', code: conceptFromCatalog(test), subject: ref, basedOn: [createReference(order)],
    category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0074', code: 'LAB' }] }],
    effectiveDateTime: iso(date), issued: iso(date), result: obs.map((o) => ({ reference: `Observation/${o.id}`, display: o.code.text })),
  });
  const abnormal = obs.some((o) => ['H', 'L'].includes(o.interpretation?.[0]?.coding?.[0]?.code ?? ''));
  await medplum.createResource<Task>({
    resourceType: 'Task', status: opts.reviewed ? 'completed' : 'requested', intent: 'order', priority: abnormal ? 'urgent' : 'routine',
    code: { coding: [{ system: SYSTEMS.TASK_TYPE, code: TASK_CODES.REVIEW_RESULT, display: 'Review result' }], text: 'Review result' },
    description: `Review ${test.display} result`, focus: { reference: `DiagnosticReport/${report.id}`, display: test.display },
    for: ref, owner: prescriber, authoredOn: iso(date),
  });
}

interface VisitSpec {
  daysAgo: number; type: string; reason: string; vitals: VitalValues; dx: string[]; note: SoapNote; cpt: string[];
}

async function visit(ref: Reference<Patient>, provider: Reference<Practitioner>, coverage: Coverage, v: VisitSpec): Promise<Reference<Encounter>> {
  const start = at(-v.daysAgo, 9 + (v.daysAgo % 6), 0);
  const end = new Date(start.getTime() + 25 * 60000);
  const enc = await medplum.createResource<Encounter>({
    resourceType: 'Encounter', status: 'in-progress', class: { system: SYSTEMS.ACT_CODE, code: 'AMB', display: 'ambulatory' },
    type: [{ text: v.type }], subject: ref, participant: [{ individual: provider }], period: { start: iso(start) }, reasonCode: [{ text: v.reason }],
  });
  const encRef = { reference: `Encounter/${enc.id}`, display: v.type } as Reference<Encounter>;
  await Promise.all(buildVitalObservations(v.vitals, ref, { encounter: encRef, performer: provider, effective: iso(new Date(start.getTime() + 5 * 60000)) }).map((o) => medplum.createResource(o)));
  const diagnoses = await Promise.all(v.dx.map((code) => medplum.createResource<Condition>({
    resourceType: 'Condition', subject: ref, encounter: encRef,
    category: [{ coding: [{ system: SYSTEMS.CONDITION_CATEGORY, code: 'encounter-diagnosis', display: 'Encounter Diagnosis' }] }],
    code: conceptFromCatalog(find(PROBLEMS, code)),
    clinicalStatus: { coding: [{ system: SYSTEMS.CONDITION_CLINICAL, code: 'active' }] },
    verificationStatus: { coding: [{ system: SYSTEMS.CONDITION_VER, code: 'confirmed' }] },
    recordedDate: iso(start),
  })));
  const doc = buildNoteDocument({ patient: ref, encounter: encRef, author: provider, note: v.note, title: `${v.type} note` });
  await medplum.createResource<DocumentReference>({ ...doc, docStatus: 'final', authenticator: provider, date: iso(end) });
  const finished = await medplum.updateResource<Encounter>({
    ...enc, status: 'finished', period: { start: iso(start), end: iso(end) },
    diagnosis: diagnoses.map((d, i) => ({ condition: { reference: `Condition/${d.id}` }, rank: i + 1 })),
  });
  const claim = buildClaim({
    patient: ref, provider, encounter: { reference: `Encounter/${finished.id}` },
    coverage: { reference: `Coverage/${coverage.id}`, display: coverage.payor?.[0]?.display ?? 'Self-pay' },
    diagnoses, lines: v.cpt.map((cpt) => ({ cpt, units: 1 })), serviceDate: iso(start).slice(0, 10),
  });
  await medplum.createResource({ ...claim, status: v.daysAgo > 14 ? 'active' : 'draft', created: iso(end) });
  return encRef;
}

async function appointment(ref: Reference<Patient>, provider: Reference<Practitioner>, start: Date, type: string, reason: string, status: Appointment['status'] = 'booked', minutes = 30): Promise<Appointment> {
  return medplum.createResource<Appointment>({
    resourceType: 'Appointment', status, appointmentType: { text: type }, serviceType: [{ text: type }], description: reason,
    start: iso(start), end: iso(new Date(start.getTime() + minutes * 60000)), minutesDuration: minutes, created: iso(new Date()),
    participant: [{ actor: ref, status: 'accepted', required: 'required' }, { actor: provider, status: 'accepted', required: 'required' }],
  });
}

async function message(ref: Reference<Patient>, from: Reference<Patient> | Reference<Practitioner>, text: string, when: Date, to: Reference<Patient> | Reference<Practitioner>): Promise<void> {
  await medplum.createResource<Communication>({
    resourceType: 'Communication', status: 'completed', subject: ref, sender: from, recipient: [to], sent: iso(when), payload: [{ contentString: text }],
    category: [{ text: 'Patient message' }],
  });
}

async function main(): Promise<void> {
  console.log(`Seeding ${BASE_URL}`);
  const { practitioner: chenRaw } = await signIn();
  const chen = chenRaw.name?.[0]?.prefix ? chenRaw : await medplum.updateResource({ ...chenRaw, name: [{ prefix: ['Dr.'], given: ['Maya'], family: 'Chen' }] });
  const okafor = await invite('James', 'Okafor', 'dr.okafor@example.com', 'Dr.');
  const drChen = pref(chen);
  const drOkafor = pref(okafor);

  const already = await medplum.searchOne('Patient', { identifier: `${SYSTEMS.MRN}|10000001` });
  if (already) {
    console.log('Demo patients already exist; skipping chart seeding.');
    return;
  }

  // ---------- Robert Hernandez: chronic disease management ----------
  const robert = await createPatient({ given: 'Robert', family: 'Hernandez', gender: 'male', birthDate: '1964-03-12', phone: '(503) 555-0142', city: 'Portland', mrn: '10000001', payer: { name: 'Blue Cross Blue Shield', member: 'BCX884213', group: 'GRP-5521' } });
  await allergy(robert.ref, '91936005', '126485001', 'moderate', 'medication');
  for (const [c, d] of [['I10', '2016-05-01'], ['E11.9', '2018-09-15'], ['E78.5', '2017-02-10']] as const) await problem(robert.ref, c, d);
  await med(robert.ref, drChen, '314076', '1 tablet oral once daily', at(-180, 10));
  await med(robert.ref, drChen, '860975', '1 tablet oral twice daily with meals', at(-180, 10));
  await med(robert.ref, drChen, '617312', '1 tablet oral at bedtime', at(-180, 10));
  await vaccine(robert.ref, '140', at(-45, 10), 'FL2291');
  await vaccine(robert.ref, '187', at(-300, 10), 'SHX441');
  const bpSeries: [number, number, number, number][] = [[270, 152, 94, 212], [180, 144, 90, 208], [90, 136, 86, 204], [21, 128, 82, 201]];
  for (const [days, sys, dia, wt] of bpSeries) {
    const e = await visit(robert.ref, drChen, robert.coverage, {
      daysAgo: days, type: 'Follow-up', reason: 'Diabetes and hypertension follow-up',
      vitals: { systolic: sys, diastolic: dia, heartRate: 78, respRate: 14, temp: 98.4, spo2: 97, weight: wt, height: 70 },
      dx: ['E11.9', 'I10'],
      note: {
        subjective: `Here for DM2/HTN follow-up. Taking metformin and lisinopril as prescribed. Walking 20 min most days. Denies chest pain, polyuria, vision changes.`,
        objective: `Vitals: BP ${sys}/${dia}, HR 78, Wt ${wt} lb.\nGeneral: well appearing.\nCV: RRR, no murmurs. No edema.\nFeet: monofilament intact bilaterally.`,
        assessment: `1. Type 2 diabetes mellitus — ${days > 100 ? 'suboptimally controlled' : 'improving'}.\n2. Essential hypertension — ${sys > 135 ? 'above goal' : 'at goal'}.`,
        plan: `Continue metformin 500 mg BID and lisinopril 10 mg daily.\nA1c and CMP today.\nReinforced diet and exercise.\nReturn in 3 months.`,
      },
      cpt: ['99214'],
    });
    const a1c = days === 270 ? '8.4' : days === 180 ? '7.9' : days === 90 ? '7.3' : '7.0';
    await labResult(robert.ref, drChen, '4548-4', { '4548-4': a1c }, at(-days + 1, 8), { reviewed: days !== 21, encounter: e });
  }
  await labResult(robert.ref, drChen, '57698-3', { '2093-3': '214', '2571-8': '188', '2085-9': '38', '13457-7': '138' }, at(-20, 8), { reviewed: false });
  await message(robert.ref, robert.ref, 'Hi Dr. Chen, my home BP readings have been around 125/80 this week. Should I keep the same dose?', at(-2, 19, 12), drChen);
  await message(robert.ref, drChen, 'Those numbers look great, Robert. Please keep the same dose and bring your log to your next visit.', at(-1, 8, 40), robert.ref);

  // ---------- Emily Johnson: asthma / anxiety, visit in progress today ----------
  const emily = await createPatient({ given: 'Emily', family: 'Johnson', gender: 'female', birthDate: '1991-07-22', phone: '(503) 555-0178', city: 'Beaverton', mrn: '10000002', payer: { name: 'Aetna', member: 'AET55102', group: 'AE-2210' } });
  await nka(emily.ref);
  await problem(emily.ref, 'J45.909', '2005-01-01');
  await problem(emily.ref, 'F41.1', '2021-06-01');
  await med(emily.ref, drChen, '745679', '2 puffs inhaled every 4-6 hours as needed for wheeze', at(-200, 10));
  await med(emily.ref, drChen, '312940', '1 tablet oral once daily', at(-200, 10));
  await vaccine(emily.ref, '208', at(-120, 10), 'PF8812');
  await visit(emily.ref, drChen, emily.coverage, {
    daysAgo: 200, type: 'Office visit', reason: 'Anxiety', vitals: { systolic: 118, diastolic: 74, heartRate: 88, weight: 142, height: 65, temp: 98.2, spo2: 99 }, dx: ['F41.1'],
    note: { subjective: 'Increased worry, poor sleep for 3 months. GAD-7 score 14.', objective: 'Anxious affect, linear thought process. No SI/HI.', assessment: 'Generalized anxiety disorder, moderate.', plan: 'Start sertraline 50 mg daily. Referral to counseling. Follow up 6 weeks.' }, cpt: ['99214'],
  });
  const emilyAppt = await appointment(emily.ref, drChen, at(0, 8, 30), 'Sick visit', 'Cough and wheezing x 4 days', 'arrived');
  const emilyEnc = await medplum.createResource<Encounter>({
    resourceType: 'Encounter', status: 'in-progress', class: { system: SYSTEMS.ACT_CODE, code: 'AMB', display: 'ambulatory' },
    type: [{ text: 'Sick visit' }], subject: emily.ref, participant: [{ individual: drChen }], period: { start: iso(at(0, 8, 35)) },
    appointment: [createReference(emilyAppt)], reasonCode: [{ text: 'Cough and wheezing x 4 days' }],
  });
  await Promise.all(buildVitalObservations({ systolic: 122, diastolic: 78, heartRate: 96, respRate: 20, temp: 99.8, spo2: 95, weight: 141, height: 65 }, emily.ref, { encounter: { reference: `Encounter/${emilyEnc.id}` }, performer: drChen, effective: iso(at(0, 8, 40)) }).map((o) => medplum.createResource(o)));
  await medplum.createResource(buildNoteDocument({
    patient: emily.ref, encounter: { reference: `Encounter/${emilyEnc.id}` }, author: drChen, title: 'Sick visit note',
    note: { subjective: 'CC: Cough and wheezing x 4 days\nHPI: Started after URI from her son. Using albuterol 3-4x/day with partial relief. No fever.', objective: '', assessment: '', plan: '' },
  }));
  await message(emily.ref, emily.ref, 'Can I get a refill on my inhaler before my appointment?', at(-3, 14, 5), drChen);
  await medplum.createResource<Task>({
    resourceType: 'Task', status: 'requested', intent: 'order', priority: 'routine',
    code: { coding: [{ system: SYSTEMS.TASK_TYPE, code: TASK_CODES.REFILL_REQUEST, display: 'Refill request' }], text: 'Refill request' },
    description: 'Albuterol inhaler refill request', for: emily.ref, owner: drChen, authoredOn: iso(at(-3, 14, 6)),
    restriction: { period: { end: iso(at(1, 17)) } },
  });

  // ---------- Margaret O'Brien: complex elderly patient ----------
  const margaret = await createPatient({ given: 'Margaret', family: "O'Brien", gender: 'female', birthDate: '1947-11-02', phone: '(503) 555-0193', city: 'Portland', mrn: '10000003', payer: { name: 'Medicare', member: '1EG4-TE5-MK72', group: 'PART-B' } });
  await allergy(margaret.ref, '91939003', '271807003', 'mild', 'medication');
  for (const [c, d] of [['I50.9', '2019-04-01'], ['I48.91', '2019-04-01'], ['N18.3', '2020-08-01'], ['M81.0', '2015-01-01'], ['I10', '2005-01-01']] as const) await problem(margaret.ref, c, d);
  await med(margaret.ref, drOkafor, '1364430', '1 tablet oral twice daily', at(-365, 10));
  await med(margaret.ref, drOkafor, '310429', '1 tablet oral once daily in the morning', at(-365, 10));
  await med(margaret.ref, drOkafor, '866514', '1 tablet oral twice daily', at(-365, 10));
  await med(margaret.ref, drOkafor, '855332', '1 tablet oral daily', at(-900, 10), 'stopped');
  await vaccine(margaret.ref, '140', at(-50, 10));
  await vaccine(margaret.ref, '215', at(-400, 10));
  await vaccine(margaret.ref, '305', at(-380, 10));
  await visit(margaret.ref, drOkafor, margaret.coverage, {
    daysAgo: 35, type: 'Follow-up', reason: 'CHF follow-up', vitals: { systolic: 138, diastolic: 76, heartRate: 72, respRate: 16, spo2: 94, weight: 151, height: 62, temp: 97.9 }, dx: ['I50.9', 'I48.91', 'N18.3'],
    note: { subjective: 'Mild dyspnea on exertion, stable. 2-pillow orthopnea unchanged. No chest pain.', objective: 'Irregularly irregular rhythm. Trace bilateral ankle edema. Lungs: faint bibasilar crackles.', assessment: '1. HFrEF, compensated.\n2. Persistent AF, rate controlled on metoprolol, anticoagulated.\n3. CKD 3 — monitor with diuretic.', plan: 'Continue current regimen. BMP today. Daily weights; call if gain >3 lb in 2 days.' }, cpt: ['99215'],
  });
  await labResult(margaret.ref, drOkafor, '24320-4', { '2345-7': '104', '3094-0': '31', '2160-0': '1.6', '2951-2': '134', '2823-3': '5.4' }, at(-34, 8), { reviewed: false });
  await medplum.createResource<ServiceRequest>({
    resourceType: 'ServiceRequest', status: 'active', intent: 'order', priority: 'routine', subject: margaret.ref, requester: drOkafor,
    code: conceptFromCatalog(LAB_TESTS.find((t) => t.code === '58410-2') as CatalogItem), authoredOn: iso(at(-2, 11)),
    category: [{ coding: [{ system: SYSTEMS.SNOMED, code: '108252007', display: 'Laboratory procedure' }] }],
  });

  // ---------- Other patients ----------
  const david = await createPatient({ given: 'David', family: 'Kim', gender: 'male', birthDate: '1980-01-30', phone: '(503) 555-0110', city: 'Lake Oswego', mrn: '10000004', payer: { name: 'United Healthcare', member: 'UHC771120', group: 'UH-8890' } });
  await allergy(david.ref, '300913006', '267038008', 'severe', 'food');
  await problem(david.ref, 'K21.9', '2019-01-01');
  await problem(david.ref, 'G47.33', '2022-03-01');
  await med(david.ref, drChen, '402014', '1 capsule oral once daily before breakfast', at(-90, 10));

  const sofia = await createPatient({ given: 'Sofia', family: 'Martinez', gender: 'female', birthDate: '2018-05-14', phone: '(503) 555-0166', city: 'Portland', mrn: '10000005', payer: { name: 'Oregon Health Plan', member: 'OHP33019', group: 'MEDICAID' } });
  await nka(sofia.ref);
  await problem(sofia.ref, 'L20.9', '2019-02-01');
  for (const [c, d] of [['08', -2500], ['03', -2200], ['21', -2200], ['140', -40]] as const) await vaccine(sofia.ref, c, at(d, 10));

  const aisha = await createPatient({ given: 'Aisha', family: 'Williams', gender: 'female', birthDate: '1973-09-08', phone: '(503) 555-0122', city: 'Tigard', mrn: '10000006', payer: { name: 'Kaiser Permanente', member: 'KP40021', group: 'KP-100' } });
  await nka(aisha.ref);
  await problem(aisha.ref, 'E03.9', '2012-01-01');
  await problem(aisha.ref, 'F32.9', '2020-10-01');
  await med(aisha.ref, drChen, '966247', '1 tablet oral once daily on empty stomach', at(-120, 10));
  await med(aisha.ref, drChen, '248642', '1 tablet oral once daily', at(-120, 10));
  await labResult(aisha.ref, drChen, '3016-3', { '3016-3': '6.2' }, at(-1, 8), { reviewed: false });

  const thomas = await createPatient({ given: 'Thomas', family: 'Nguyen', gender: 'male', birthDate: '1997-12-03', phone: '(503) 555-0155', city: 'Portland', mrn: '10000007' });

  const linda = await createPatient({ given: 'Linda', family: 'Park', gender: 'female', birthDate: '1959-04-19', phone: '(503) 555-0187', city: 'Gresham', mrn: '10000008', payer: { name: 'Medicare', member: '3RT2-KL9-PQ11', group: 'PART-B' } });
  await allergy(linda.ref, '387494007', '422587007', 'moderate', 'medication');
  await problem(linda.ref, 'M17.9', '2018-06-01');
  await problem(linda.ref, 'I10', '2014-01-01');
  await med(linda.ref, drOkafor, '197361', '1 tablet oral once daily', at(-60, 10));
  await visit(linda.ref, drOkafor, linda.coverage, {
    daysAgo: 60, type: 'Office visit', reason: 'Knee pain', vitals: { systolic: 142, diastolic: 84, heartRate: 70, weight: 165, height: 64 }, dx: ['M17.9', 'I10'],
    note: { subjective: 'Bilateral knee pain worse with stairs, 6/10. Acetaminophen helps partially.', objective: 'Crepitus both knees, no effusion. ROM mildly reduced.', assessment: '1. Osteoarthritis of knees.\n2. HTN, above goal.', plan: 'PT referral. Start amlodipine 5 mg. Recheck BP 4-6 weeks.' }, cpt: ['99213'],
  });

  // ---------- Today's schedule ----------
  await appointment(robert.ref, drChen, at(0, 9, 0), 'Follow-up', 'Review A1c and lipids');
  await appointment(thomas.ref, drChen, at(0, 9, 30), 'New patient', 'Establish care', 'booked', 45);
  await appointment(aisha.ref, drChen, at(0, 10, 30), 'Follow-up', 'Thyroid dose adjustment');
  await appointment(sofia.ref, drChen, at(0, 11, 0), 'Annual physical', 'Well child check');
  await appointment(david.ref, drChen, at(0, 13, 30), 'Telehealth', 'GERD follow-up', 'booked', 20);
  await appointment(margaret.ref, drOkafor, at(0, 10, 0), 'Follow-up', 'CHF check, review labs');
  await appointment(linda.ref, drOkafor, at(0, 14, 0), 'Follow-up', 'Blood pressure recheck');
  await appointment(robert.ref, drChen, at(2, 15, 0), 'Procedure', 'Diabetic foot exam', 'booked', 20);

  await medplum.createResource<Task>({
    resourceType: 'Task', status: 'requested', intent: 'order', priority: 'urgent',
    code: { coding: [{ system: SYSTEMS.TASK_TYPE, code: TASK_CODES.FOLLOW_UP, display: 'Follow-up call' }], text: 'Follow-up call' },
    description: 'Call patient about elevated potassium; repeat BMP this week', for: margaret.ref, owner: drOkafor, authoredOn: iso(at(-1, 9)),
    restriction: { period: { end: iso(at(0, 17)) } },
  });

  console.log('Seed complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
