import { Alert, Badge, Button, Group, Modal, Progress, Select, SimpleGrid, Stack, Table, Text } from '@mantine/core';
import { IconClipboardCheck } from '@tabler/icons-react';
import type { EpisodeOfCare, Observation, Practitioner, Questionnaire, QuestionnaireResponse, Reference } from '@medplum/fhirtypes';
import { QuestionnaireForm, useMedplum, useMedplumProfile } from '@medplum/react';
import { useState } from 'react';
import { EmptyState, SectionCard, StatusBadge } from '../../components/common';
import { notifyError, notifySuccess } from '../../components/notify';
import { SCREENING_QUESTIONNAIRE, SCREENING_URL, scoreScreening, type ScreeningResult } from '../../lib/casemgmt/assessment';
import { CM_CODES, CM_SYSTEMS, WAIVERS, cmCoding } from '../../lib/casemgmt/constants';
import { formatDate, formatDateTime, profileDisplay, toLocalDateString } from '../../lib/fhir';
import { useAsync } from '../../lib/hooks';
import { useChart } from './PatientContext';

export function EligibilityTab() {
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const { patientRef } = useChart();
  const ref = patientRef.reference as string;
  const [screening, setScreening] = useState<Questionnaire>();
  const [enrolling, setEnrolling] = useState(false);

  const { data, reload } = useAsync(async () => {
    const opts = { cache: 'no-cache' as const };
    const [responses, scores, enrollments] = await Promise.all([
      medplum.searchResources('QuestionnaireResponse', { subject: ref, questionnaire: SCREENING_URL, _sort: '-authored', _count: '50' }, opts),
      medplum.searchResources('Observation', { subject: ref, code: `${CM_SYSTEMS.CASE_MGMT}|${CM_CODES.LEVEL_OF_CARE}`, _sort: '-date', _count: '50' }, opts),
      medplum.searchResources('EpisodeOfCare', { patient: ref, _sort: '-_lastUpdated', _count: '20' }, opts),
    ]);
    return { responses, scores, enrollments };
  }, [medplum, ref]);

  const latest = data?.responses[0] ? scoreScreening(data.responses[0]) : undefined;
  const enrollment = data?.enrollments.find((e) => ['active', 'waitlist', 'planned'].includes(e.status));

  const startScreening = async (): Promise<void> => {
    try {
      // Conditional create: the instrument is stored once per project and reused.
      setScreening(await medplum.createResourceIfNoneExist(SCREENING_QUESTIONNAIRE, `url=${SCREENING_URL}`));
    } catch (err) {
      notifyError(err);
    }
  };

  const submitScreening = async (response: QuestionnaireResponse): Promise<void> => {
    try {
      const author = profile ? { reference: `${profile.resourceType}/${profile.id}`, display: profileDisplay(profile) } : undefined;
      const saved = await medplum.createResource<QuestionnaireResponse>({
        ...response, questionnaire: SCREENING_URL, status: 'completed', subject: patientRef, authored: new Date().toISOString(), author: author as QuestionnaireResponse['author'],
      });
      const result = scoreScreening(saved);
      await medplum.createResource<Observation>({
        resourceType: 'Observation',
        status: 'final',
        code: { coding: [cmCoding(CM_CODES.LEVEL_OF_CARE, 'Level of care determination (screening)')], text: 'Level of care (screening)' },
        subject: patientRef,
        effectiveDateTime: saved.authored,
        performer: author ? [author as Reference<Practitioner>] : undefined,
        valueCodeableConcept: { text: result.tier },
        component: [{ code: { coding: [cmCoding(CM_CODES.SCREENING_SCORE, 'Functional needs score')], text: 'Functional needs score' }, valueInteger: result.total }],
        derivedFrom: [{ reference: `QuestionnaireResponse/${saved.id}` }],
      });
      setScreening(undefined);
      notifySuccess(`Screening scored ${result.total}/${result.maxTotal}: ${result.tier}`);
      reload();
    } catch (err) {
      notifyError(err);
    }
  };

  return (
    <Stack>
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <SectionCard title="Level of care" actions={<Button size="xs" leftSection={<IconClipboardCheck size={14} />} onClick={startScreening}>New screening</Button>} data-testid="loc-card">
          {latest ? <ScreeningSummary result={latest} date={data?.responses[0]?.authored} assessor={data?.responses[0]?.author?.display} /> : <EmptyState>No screening on file</EmptyState>}
        </SectionCard>
        <SectionCard
          title="Waiver enrollment"
          actions={<Button size="xs" variant="light" disabled={!latest} onClick={() => setEnrolling(true)}>{enrollment ? 'Update' : 'Determine eligibility'}</Button>}
          data-testid="enrollment-card"
        >
          {enrollment ? (
            <Stack gap={4}>
              <Group gap="xs"><Text fw={600}>{enrollment.type?.[0]?.text}</Text><StatusBadge status={enrollment.status} /></Group>
              <Text size="sm" c="dimmed">Since {formatDate(enrollment.period?.start)}{enrollment.careManager?.display ? ` · Case manager ${enrollment.careManager.display}` : ''}</Text>
            </Stack>
          ) : (
            <EmptyState>{latest ? 'Eligibility not yet determined' : 'Complete a screening first'}</EmptyState>
          )}
        </SectionCard>
      </SimpleGrid>
      <SectionCard title="Screening history">
        {(data?.responses ?? []).length === 0 ? <EmptyState>No screenings</EmptyState> : (
          <Table verticalSpacing="xs">
            <Table.Thead><Table.Tr><Table.Th>Date</Table.Th><Table.Th>Assessor</Table.Th><Table.Th>Score</Table.Th><Table.Th>Level of care</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>
              {data?.responses.map((r) => {
                const s = scoreScreening(r);
                return (
                  <Table.Tr key={r.id}>
                    <Table.Td>{formatDateTime(r.authored)}</Table.Td><Table.Td>{r.author?.display}</Table.Td>
                    <Table.Td>{s.total} / {s.maxTotal}</Table.Td><Table.Td>{s.tier}</Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        )}
      </SectionCard>
      <Modal opened={!!screening} onClose={() => setScreening(undefined)} title={SCREENING_QUESTIONNAIRE.title} size="xl">
        <Alert color="gray" mb="sm">Illustrative demo instrument. In production DHS configures its own assessments and scoring.</Alert>
        {screening && <QuestionnaireForm questionnaire={screening} subject={patientRef} onSubmit={submitScreening} submitButtonText="Submit screening" />}
      </Modal>
      <Modal opened={enrolling} onClose={() => setEnrolling(false)} title="Eligibility determination">
        {enrolling && latest && (
          <EnrollForm
            result={latest}
            existing={enrollment}
            onDone={() => { setEnrolling(false); reload(); }}
          />
        )}
      </Modal>
    </Stack>
  );
}

function ScreeningSummary({ result, date, assessor }: { result: ScreeningResult; date?: string; assessor?: string }) {
  const eligible = result.tier !== 'Not eligible';
  return (
    <Stack gap={6}>
      <Group justify="space-between">
        <Badge size="lg" color={eligible ? 'blue' : 'gray'} variant="light">{result.tier}</Badge>
        <Text fw={700}>{result.total} / {result.maxTotal}</Text>
      </Group>
      <Progress value={(100 * result.total) / result.maxTotal} />
      <Text size="xs" c="dimmed">
        {formatDateTime(date)}{assessor ? ` · ${assessor}` : ''} · Diagnosis documented: {result.diagnosisConfirmed ? 'yes' : 'no'}
      </Text>
    </Stack>
  );
}

function EnrollForm({ result, existing, onDone }: { result: ScreeningResult; existing?: EpisodeOfCare; onDone: () => void }) {
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const { patientRef } = useChart();
  const eligible = result.tier !== 'Not eligible';
  const [waiver, setWaiver] = useState<string | null>(existing?.type?.[0]?.coding?.[0]?.code ?? WAIVERS[0].code);
  const [status, setStatus] = useState<string | null>(existing?.status === 'waitlist' ? 'waitlist' : 'active');

  const save = async (): Promise<void> => {
    try {
      const w = WAIVERS.find((x) => x.code === waiver) ?? WAIVERS[0];
      const careManager = profile?.resourceType === 'Practitioner' ? { reference: `Practitioner/${profile.id}`, display: profileDisplay(profile) } : undefined;
      const resource: EpisodeOfCare = {
        ...(existing ?? {}),
        resourceType: 'EpisodeOfCare',
        status: status as EpisodeOfCare['status'],
        type: [{ coding: [{ system: `${CM_SYSTEMS.CASE_MGMT}/waiver`, code: w.code, display: w.display }], text: w.display }],
        patient: patientRef,
        period: { start: existing?.period?.start ?? toLocalDateString(new Date()) },
        careManager: careManager as EpisodeOfCare['careManager'],
        statusHistory: [...(existing?.statusHistory ?? []), ...(existing && existing.status !== status ? [{ status: existing.status, period: { start: existing.period?.start, end: toLocalDateString(new Date()) } }] : [])],
      };
      if (existing) await medplum.updateResource(resource); else await medplum.createResource(resource);
      notifySuccess(status === 'waitlist' ? 'Added to waitlist' : `Enrolled in ${w.display}`);
      onDone();
    } catch (err) {
      notifyError(err);
    }
  };

  return (
    <Stack>
      <Text size="sm">Screening result: <b>{result.tier}</b> ({result.total}/{result.maxTotal})</Text>
      {!eligible && <Alert color="orange">The screening does not support eligibility. Re-screen or record a determination outside the demo instrument.</Alert>}
      <Select label="Waiver program" data={WAIVERS.map((w) => ({ value: w.code, label: w.display }))} value={waiver} onChange={setWaiver} disabled={!eligible} />
      <Select label="Decision" data={[{ value: 'active', label: 'Eligible: enroll now' }, { value: 'waitlist', label: 'Eligible: place on waitlist' }]} value={status} onChange={setStatus} disabled={!eligible} />
      <Group justify="flex-end"><Button onClick={save} disabled={!eligible}>Save determination</Button></Group>
    </Stack>
  );
}
