import { Alert, Button, Card, Divider, Grid, Group, Select, Stack, TextInput, Title } from '@mantine/core';
import { createReference } from '@medplum/core';
import type { Coverage, Organization, Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { PageHeader } from '../components/common';
import { notifyError, notifySuccess } from '../components/notify';
import { CM_SYSTEMS } from '../lib/casemgmt/constants';
import { SYSTEMS } from '../lib/constants';
import { generateMrn, patientMrn, patientName } from '../lib/fhir';

interface FormState {
  given: string;
  family: string;
  birthDate: string;
  gender: string;
  phone: string;
  email: string;
  line: string;
  city: string;
  state: string;
  postalCode: string;
  language: string;
  medicaidId: string;
  emergencyName: string;
  emergencyPhone: string;
  payor: string;
  memberId: string;
  groupId: string;
}

const EMPTY: FormState = {
  given: '', family: '', birthDate: '', gender: '', phone: '', email: '', line: '', city: '', state: '', postalCode: '',
  language: 'en', medicaidId: '', emergencyName: '', emergencyPhone: '', payor: '', memberId: '', groupId: '',
};

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'zh', label: 'Chinese' },
  { value: 'vi', label: 'Vietnamese' },
  { value: 'fr', label: 'French' },
  { value: 'ar', label: 'Arabic' },
];

function fromPatient(p: Patient, coverage?: Coverage): FormState {
  const addr = p.address?.[0];
  const contact = p.contact?.[0];
  return {
    given: p.name?.[0]?.given?.join(' ') ?? '',
    family: p.name?.[0]?.family ?? '',
    birthDate: p.birthDate ?? '',
    gender: p.gender ?? '',
    phone: p.telecom?.find((t) => t.system === 'phone')?.value ?? '',
    email: p.telecom?.find((t) => t.system === 'email')?.value ?? '',
    line: addr?.line?.join(', ') ?? '',
    city: addr?.city ?? '',
    state: addr?.state ?? '',
    postalCode: addr?.postalCode ?? '',
    language: p.communication?.[0]?.language?.coding?.[0]?.code ?? 'en',
    medicaidId: p.identifier?.find((i) => i.system === CM_SYSTEMS.MEDICAID_ID)?.value ?? '',
    emergencyName: contact?.name?.text ?? '',
    emergencyPhone: contact?.telecom?.[0]?.value ?? '',
    payor: coverage?.payor?.[0]?.display ?? '',
    memberId: coverage?.subscriberId ?? '',
    groupId: coverage?.class?.find((c) => c.type?.coding?.[0]?.code === 'group')?.value ?? '',
  };
}

/** Registration form used for both new patients and demographic edits. */
export function NewPatientPage() {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const { patientId } = useParams();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [existing, setExisting] = useState<Patient>();
  const [coverage, setCoverage] = useState<Coverage>();
  const [saving, setSaving] = useState(false);
  const [duplicate, setDuplicate] = useState<Patient>();

  useEffect(() => {
    if (!patientId) {
      return;
    }
    (async () => {
      const p = await medplum.readResource('Patient', patientId);
      const cov = await medplum.searchOne('Coverage', { beneficiary: `Patient/${patientId}`, status: 'active', _sort: '-_lastUpdated' });
      const realCoverage = cov && cov.type?.coding?.[0]?.code !== 'pay' ? cov : undefined;
      setExisting(p);
      setCoverage(realCoverage);
      setForm(fromPatient(p, realCoverage));
    })().catch(notifyError);
  }, [medplum, patientId]);

  const set = (key: keyof FormState) => (value: string | null) => setForm((f) => ({ ...f, [key]: value ?? '' }));
  const input = (key: keyof FormState) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(key)(e.currentTarget.value),
  });

  const buildPatient = (mrn: string): Patient => ({
    ...(existing ?? {}),
    resourceType: 'Patient',
    active: true,
    identifier: [
      ...(existing?.identifier?.filter((i) => i.system !== SYSTEMS.MRN && i.system !== CM_SYSTEMS.MEDICAID_ID) ?? []),
      ...(form.medicaidId.trim() ? [{ system: CM_SYSTEMS.MEDICAID_ID, value: form.medicaidId.trim().toUpperCase(), type: { text: 'Medicaid ID' } }] : []),
      { system: SYSTEMS.MRN, value: mrn, type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0203', code: 'MR' }], text: 'MRN' } },
    ],
    name: [{ use: 'official', given: form.given.trim().split(/\s+/), family: form.family.trim() }],
    birthDate: form.birthDate || undefined,
    gender: (form.gender || undefined) as Patient['gender'],
    telecom: [
      ...(form.phone ? [{ system: 'phone' as const, value: form.phone, use: 'mobile' as const }] : []),
      ...(form.email ? [{ system: 'email' as const, value: form.email }] : []),
    ],
    address: form.line || form.city
      ? [{ use: 'home', line: form.line ? [form.line] : undefined, city: form.city || undefined, state: form.state || undefined, postalCode: form.postalCode || undefined, country: 'US' }]
      : undefined,
    communication: form.language
      ? [{ language: { coding: [{ system: 'urn:ietf:bcp:47', code: form.language, display: LANGUAGES.find((l) => l.value === form.language)?.label }] }, preferred: true }]
      : undefined,
    contact: form.emergencyName
      ? [{
          relationship: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0131', code: 'C', display: 'Emergency Contact' }] }],
          name: { text: form.emergencyName },
          telecom: form.emergencyPhone ? [{ system: 'phone', value: form.emergencyPhone }] : undefined,
        }]
      : undefined,
  });

  const save = async (force = false): Promise<void> => {
    if (!form.given.trim() || !form.family.trim() || !form.birthDate || !form.gender) {
      notifyError(new Error('First name, last name, date of birth and sex are required.'));
      return;
    }
    setSaving(true);
    try {
      if (!existing && !force) {
        const dup =
          (form.medicaidId.trim() ? await medplum.searchOne('Patient', { identifier: `${CM_SYSTEMS.MEDICAID_ID}|${form.medicaidId.trim().toUpperCase()}` }, { cache: 'no-cache' }) : undefined) ??
          (await medplum.searchOne('Patient', { family: form.family.trim(), birthdate: form.birthDate }, { cache: 'no-cache' }));
        if (dup) {
          setDuplicate(dup);
          return;
        }
      }
      let mrn = patientMrn(existing);
      while (!mrn) {
        const candidate = generateMrn();
        const clash = await medplum.searchOne('Patient', { identifier: `${SYSTEMS.MRN}|${candidate}` });
        if (!clash) {
          mrn = candidate;
        }
      }
      const resource = buildPatient(mrn);
      const patient = existing ? await medplum.updateResource(resource) : await medplum.createResource(resource);
      await saveCoverage(patient);
      notifySuccess(existing ? 'Demographics updated' : `Registered ${patientName(patient)} (MRN ${mrn})`);
      navigate(`/patients/${patient.id}`);
    } catch (err) {
      notifyError(err);
    } finally {
      setSaving(false);
    }
  };

  const saveCoverage = async (patient: Patient): Promise<void> => {
    if (!form.payor.trim()) {
      return;
    }
    let org = await medplum.searchOne('Organization', { name: form.payor.trim(), type: 'pay' });
    if (!org) {
      org = await medplum.createResource<Organization>({
        resourceType: 'Organization',
        name: form.payor.trim(),
        type: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/organization-type', code: 'pay', display: 'Payer' }] }],
      });
    }
    const resource: Coverage = {
      ...(coverage ?? {}),
      resourceType: 'Coverage',
      status: 'active',
      beneficiary: createReference(patient),
      subscriberId: form.memberId || undefined,
      relationship: { coding: [{ system: SYSTEMS.SUBSCRIBER_REL, code: 'self', display: 'Self' }] },
      payor: [{ ...createReference(org), display: org.name }],
      class: form.groupId
        ? [{ type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/coverage-class', code: 'group' }] }, value: form.groupId }]
        : undefined,
    };
    if (coverage) {
      await medplum.updateResource(resource);
    } else {
      await medplum.createResource(resource);
    }
  };

  return (
    <>
      <PageHeader title={existing ? `Edit ${patientName(existing)}` : 'Register participant'} />
      <Card withBorder maw={900}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save().catch(notifyError);
          }}
        >
          <Stack>
            {duplicate && (
              <Alert color="orange" title="Possible duplicate">
                {patientName(duplicate)} (DOB {duplicate.birthDate}) already exists.
                <Group mt="xs">
                  <Button size="xs" variant="light" onClick={() => navigate(`/patients/${duplicate.id}`)}>
                    Open existing chart
                  </Button>
                  <Button size="xs" color="orange" onClick={() => save(true)}>
                    Register anyway
                  </Button>
                </Group>
              </Alert>
            )}
            <Title order={5}>Demographics</Title>
            <Grid>
              <Grid.Col span={{ base: 12, sm: 6 }}><TextInput label="First name" required {...input('given')} /></Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}><TextInput label="Last name" required {...input('family')} /></Grid.Col>
              <Grid.Col span={{ base: 12, sm: 4 }}><TextInput label="Date of birth" type="date" required {...input('birthDate')} /></Grid.Col>
              <Grid.Col span={{ base: 12, sm: 4 }}>
                <Select label="Sex" required data={[{ value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }, { value: 'other', label: 'Other' }, { value: 'unknown', label: 'Unknown' }]} value={form.gender || null} onChange={set('gender')} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 4 }}>
                <Select label="Preferred language" data={LANGUAGES} value={form.language} onChange={set('language')} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}><TextInput label="Medicaid ID" description="Links the participant to FOCOS EVV and billing" {...input('medicaidId')} /></Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}><TextInput label="Phone" type="tel" {...input('phone')} /></Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}><TextInput label="Email" type="email" {...input('email')} /></Grid.Col>
              <Grid.Col span={12}><TextInput label="Street address" {...input('line')} /></Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}><TextInput label="City" {...input('city')} /></Grid.Col>
              <Grid.Col span={{ base: 6, sm: 3 }}><TextInput label="State" {...input('state')} /></Grid.Col>
              <Grid.Col span={{ base: 6, sm: 3 }}><TextInput label="ZIP" {...input('postalCode')} /></Grid.Col>
            </Grid>
            <Divider />
            <Title order={5}>Emergency contact</Title>
            <Grid>
              <Grid.Col span={{ base: 12, sm: 6 }}><TextInput label="Name" {...input('emergencyName')} /></Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}><TextInput label="Phone" type="tel" {...input('emergencyPhone')} /></Grid.Col>
            </Grid>
            <Divider />
            <Title order={5}>Insurance</Title>
            <Grid>
              <Grid.Col span={{ base: 12, sm: 6 }}><TextInput label="Payer" placeholder="Leave blank for self-pay" {...input('payor')} /></Grid.Col>
              <Grid.Col span={{ base: 6, sm: 3 }}><TextInput label="Member ID" {...input('memberId')} /></Grid.Col>
              <Grid.Col span={{ base: 6, sm: 3 }}><TextInput label="Group #" {...input('groupId')} /></Grid.Col>
            </Grid>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => navigate(-1)}>Cancel</Button>
              <Button type="submit" loading={saving}>{existing ? 'Save changes' : 'Register participant'}</Button>
            </Group>
          </Stack>
        </form>
      </Card>
    </>
  );
}
