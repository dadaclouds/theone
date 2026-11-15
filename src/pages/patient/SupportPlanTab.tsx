import { Alert, Badge, Button, Card, Grid, Group, Modal, MultiSelect, NumberInput, Select, SimpleGrid, Stack, Text, Textarea, TextInput, Title } from '@mantine/core';
import { IconPlus, IconSend } from '@tabler/icons-react';
import type { CarePlan, Goal, Observation, Practitioner, Reference, ServiceRequest, Task } from '@medplum/fhirtypes';
import { useMedplum, useMedplumProfile } from '@medplum/react';
import { useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { EmptyState, SectionCard, StatusBadge } from '../../components/common';
import { notifyCountsChanged } from '../../components/Shell';
import { notifyError, notifySuccess } from '../../components/notify';
import { CM_CODES, CM_SYSTEMS, HCBS_SERVICES, cmCoding } from '../../lib/casemgmt/constants';
import { identifierValue, serviceCode } from '../../lib/casemgmt/mapping';
import { requestAuthorization } from '../../lib/casemgmt/workflow';
import { formatDate, profileDisplay, toLocalDateString } from '../../lib/fhir';
import { useAsync } from '../../lib/hooks';
import { useChart } from './PatientContext';

const ispCategory = { coding: [cmCoding(CM_CODES.ISP, 'Individual Support Plan')], text: 'Individual Support Plan' };

export function SupportPlanTab() {
  const medplum = useMedplum();
  const { patientRef } = useChart();
  const ref = patientRef.reference as string;
  const [modal, setModal] = useState<'plan' | 'goal' | 'service'>();

  const { data, reload } = useAsync(async () => {
    const opts = { cache: 'no-cache' as const };
    const plans = await medplum.searchResources('CarePlan', { subject: ref, category: `${CM_SYSTEMS.CASE_MGMT}|${CM_CODES.ISP}`, _sort: '-_lastUpdated' }, opts);
    const plan = plans.find((p) => p.status === 'active' || p.status === 'draft');
    if (!plan) return { plan: undefined, goals: [] as Goal[], services: [] as ServiceRequest[], tasks: [] as Task[], observations: [] as Observation[], enrollment: await currentEnrollment() };
    const [goals, services, tasks, observations] = await Promise.all([
      medplum.searchResources('Goal', { subject: ref, _count: '100' }, opts),
      medplum.searchResources('ServiceRequest', { subject: ref, 'based-on': `CarePlan/${plan.id}`, _count: '100' }, opts),
      medplum.searchResources('Task', { patient: ref, code: `${CM_SYSTEMS.CASE_MGMT}|${CM_CODES.AUTH_APPROVAL}`, _count: '100' }, opts),
      medplum.searchResources('Observation', { subject: ref, _count: '1000', _sort: 'date' }, opts),
    ]);
    const goalIds = new Set((plan.goal ?? []).map((g) => g.reference));
    return { plan, goals: goals.filter((g) => goalIds.has(`Goal/${g.id}`)), services, tasks, observations, enrollment: await currentEnrollment() };

    async function currentEnrollment() {
      const eps = await medplum.searchResources('EpisodeOfCare', { patient: ref, status: 'active,waitlist' }, opts);
      return eps[0];
    }
  }, [medplum, ref]);

  if (!data) return null;
  if (!data.plan) {
    return (
      <Card withBorder>
        <Stack align="center" py="lg">
          <Text c="dimmed">No Individual Support Plan yet.</Text>
          {!data.enrollment && <Text size="sm" c="dimmed">Tip: complete the screening and eligibility determination on the Eligibility tab first.</Text>}
          <Button leftSection={<IconPlus size={16} />} onClick={() => setModal('plan')}>Create ISP</Button>
        </Stack>
        <Modal opened={modal === 'plan'} onClose={() => setModal(undefined)} title="Create Individual Support Plan" size="lg">
          {modal === 'plan' && <PlanForm waiver={data.enrollment?.type?.[0]?.text} onSaved={() => { setModal(undefined); reload(); }} />}
        </Modal>
      </Card>
    );
  }

  const { plan, goals, services, tasks, observations } = data;
  return (
    <Stack>
      <Card withBorder data-testid="isp-card">
        <Group justify="space-between" align="flex-start">
          <div>
            <Group gap="xs"><Title order={4}>{plan.title}</Title><StatusBadge status={plan.status} /></Group>
            <Text size="sm" c="dimmed">{formatDate(plan.period?.start)} to {formatDate(plan.period?.end)}{plan.author?.display ? ` · Case manager ${plan.author.display}` : ''}</Text>
          </div>
        </Group>
        {plan.description && (
          <Text size="sm" mt="sm"><b>What is important to the person:</b> {plan.description}</Text>
        )}
      </Card>
      <SectionCard title="Goals" actions={<Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => setModal('goal')}>Add goal</Button>} data-testid="goals-card">
        {goals.length === 0 ? <EmptyState>Add the person's goals</EmptyState> : (
          <SimpleGrid cols={{ base: 1, lg: 2 }}>
            {goals.map((g) => <GoalProgress key={g.id} goal={g} observations={observations.filter((o) => o.focus?.some((f) => f.reference === `Goal/${g.id}`))} />)}
          </SimpleGrid>
        )}
      </SectionCard>
      <SectionCard title="Planned services and authorizations" actions={<Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => setModal('service')} disabled={goals.length === 0}>Add service</Button>} data-testid="services-card">
        {services.length === 0 ? <EmptyState>{goals.length ? 'Add the services that support these goals' : 'Add goals first'}</EmptyState> : (
          <Stack gap="sm">{services.map((s) => <ServiceRow key={s.id} service={s} goals={goals} task={tasks.find((t) => t.focus?.reference === `ServiceRequest/${s.id}`)} onChanged={reload} />)}</Stack>
        )}
      </SectionCard>
      <Modal opened={modal === 'goal'} onClose={() => setModal(undefined)} title="Add goal" size="lg">
        {modal === 'goal' && <GoalForm plan={plan} onSaved={() => { setModal(undefined); reload(); }} />}
      </Modal>
      <Modal opened={modal === 'service'} onClose={() => setModal(undefined)} title="Add planned service" size="lg">
        {modal === 'service' && <ServiceForm plan={plan} goals={goals} onSaved={() => { setModal(undefined); reload(); }} />}
      </Modal>
    </Stack>
  );
}

function GoalProgress({ goal, observations }: { goal: Goal; observations: Observation[] }) {
  const target = goal.target?.[0];
  const targetValue = target?.detailQuantity?.value;
  const unit = target?.detailQuantity?.unit ?? '';
  const points = observations
    .filter((o) => o.valueQuantity?.value !== undefined)
    .map((o) => ({ date: formatDate(o.effectiveDateTime), value: o.valueQuantity?.value as number }));
  const latest = points[points.length - 1]?.value;
  const met = latest !== undefined && targetValue !== undefined && latest >= targetValue;
  const fmt = (v: number | undefined) => (v === undefined ? '' : unit === '%' ? `${v}%` : `${v} ${unit}`.trim());
  return (
    <Card withBorder padding="sm" data-testid="goal-card">
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <div>
          <Text fw={600} size="sm">{goal.description.text}</Text>
          <Text size="xs" c="dimmed">{target?.measure?.text} · target {fmt(targetValue)}{target?.dueDate ? ` by ${formatDate(target.dueDate)}` : ''}</Text>
        </div>
        {latest !== undefined ? (
          <Badge color={met ? 'green' : 'blue'} variant="light" style={{ flexShrink: 0 }}>{met ? 'Target met' : `Latest ${fmt(latest)}`}</Badge>
        ) : (
          <Badge color="gray" variant="light" style={{ flexShrink: 0 }}>No data yet</Badge>
        )}
      </Group>
      {points.length > 0 ? (
        <div style={{ width: '100%', height: 140 }}>
          <ResponsiveContainer>
            <LineChart data={points} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" fontSize={10} />
              <YAxis fontSize={10} allowDecimals={false} domain={[0, (max: number) => Math.max(max, targetValue ?? 0)]} />
              <Tooltip />
              {targetValue !== undefined && <ReferenceLine y={targetValue} stroke="#2f9e44" strokeDasharray="4 4" label={{ value: 'target', fontSize: 10, position: 'insideTopRight' }} />}
              <Line type="monotone" dataKey="value" stroke="#1c7ed6" strokeWidth={2} dot isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <Text size="xs" c="dimmed" mt="sm">Progress appears here as direct support staff record goal data during EVV visits.</Text>
      )}
      <Text size="xs" c="dimmed">{points.length} data point(s) from verified visits</Text>
    </Card>
  );
}

function ServiceRow({ service, goals, task, onChanged }: { service: ServiceRequest; goals: Goal[]; task?: Task; onChanged: () => void }) {
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const [sending, setSending] = useState(false);
  const linkedGoals = goals.filter((g) => service.supportingInfo?.some((r) => r.reference === `Goal/${g.id}`));
  const authNumber = identifierValue(service, CM_SYSTEMS.AUTHORIZATION_NUMBER);
  const focosId = identifierValue(service, CM_SYSTEMS.FOCOS_AUTHORIZATION);
  const state =
    service.status === 'active' ? 'Approved' : service.status === 'revoked' ? 'Denied' : service.intent === 'order' ? 'Pending Division approval' : 'Planned';
  const color = { Approved: 'green', Denied: 'red', 'Pending Division approval': 'orange', Planned: 'gray' }[state];

  const request = async (): Promise<void> => {
    setSending(true);
    try {
      const requester = profile?.resourceType === 'Practitioner' ? ({ reference: `Practitioner/${profile.id}`, display: profileDisplay(profile) } as Reference<Practitioner>) : undefined;
      await requestAuthorization(medplum, service, requester);
      notifySuccess('Sent to the Division for approval');
      notifyCountsChanged();
      onChanged();
    } catch (err) {
      notifyError(err);
    } finally {
      setSending(false);
    }
  };

  return (
    <Card withBorder padding="sm" data-testid="service-row">
      <Grid align="center">
        <Grid.Col span={{ base: 12, md: 5 }}>
          <Text fw={600} size="sm">{serviceCode(service)} · {service.code?.text}</Text>
          <Text size="xs" c="dimmed">{service.quantityQuantity?.value} units (15 min) · {service.performer?.[0]?.display ?? 'Provider TBD'}</Text>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Text size="xs" c="dimmed">Supports</Text>
          <Text size="sm">{linkedGoals.map((g) => g.description.text).join('; ') || '—'}</Text>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 3 }}>
          <Stack gap={4} align="flex-end">
            <Badge color={color} variant="light">{state}</Badge>
            {authNumber && <Text size="xs">Auth {authNumber}</Text>}
            {focosId && <Text size="xs" c="dimmed">FOCOS {focosId}</Text>}
            {state === 'Denied' && task?.statusReason?.text && <Text size="xs" c="red">{task.statusReason.text}</Text>}
            {state === 'Planned' && <Button size="xs" leftSection={<IconSend size={14} />} loading={sending} onClick={request}>Request authorization</Button>}
          </Stack>
        </Grid.Col>
      </Grid>
    </Card>
  );
}

function PlanForm({ waiver, onSaved }: { waiver?: string; onSaved: () => void }) {
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const { patientRef } = useChart();
  const start = new Date();
  const end = new Date(start); end.setFullYear(end.getFullYear() + 1); end.setDate(end.getDate() - 1);
  const [startDate, setStartDate] = useState(toLocalDateString(start));
  const [endDate, setEndDate] = useState(toLocalDateString(end));
  const [important, setImportant] = useState('');

  const save = async (): Promise<void> => {
    try {
      await medplum.createResource<CarePlan>({
        resourceType: 'CarePlan',
        status: 'active',
        intent: 'plan',
        category: [ispCategory],
        title: `Individual Support Plan${waiver ? ` · ${waiver}` : ''}`,
        description: important.trim() || undefined,
        subject: patientRef,
        period: { start: startDate, end: endDate },
        created: new Date().toISOString(),
        author: profile ? ({ reference: `${profile.resourceType}/${profile.id}`, display: profileDisplay(profile) } as CarePlan['author']) : undefined,
      });
      notifySuccess('Support plan created');
      onSaved();
    } catch (err) {
      notifyError(err);
    }
  };

  return (
    <Stack>
      <Group grow>
        <TextInput label="Plan start" type="date" value={startDate} onChange={(e) => setStartDate(e.currentTarget.value)} />
        <TextInput label="Plan end" type="date" value={endDate} onChange={(e) => setEndDate(e.currentTarget.value)} />
      </Group>
      <Textarea label="What is important to the person" description="In the person's own words where possible (person-centered planning)" autosize minRows={3} value={important} onChange={(e) => setImportant(e.currentTarget.value)} />
      <Group justify="flex-end"><Button onClick={save}>Create plan</Button></Group>
    </Stack>
  );
}

function GoalForm({ plan, onSaved }: { plan: CarePlan; onSaved: () => void }) {
  const medplum = useMedplum();
  const { patientRef } = useChart();
  const [description, setDescription] = useState('');
  const [measure, setMeasure] = useState('% of steps completed independently');
  const [target, setTarget] = useState<number | string>(80);
  const [unit, setUnit] = useState<string | null>('%');
  const [due, setDue] = useState(plan.period?.end ?? '');

  const save = async (): Promise<void> => {
    try {
      const goal = await medplum.createResource<Goal>({
        resourceType: 'Goal',
        lifecycleStatus: 'active',
        achievementStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/goal-achievement', code: 'in-progress', display: 'In Progress' }] },
        description: { text: description.trim() },
        subject: patientRef,
        startDate: toLocalDateString(new Date()),
        target: [{ measure: { text: measure.trim() }, detailQuantity: { value: Number(target), unit: unit ?? undefined }, dueDate: due || undefined }],
      });
      await medplum.updateResource<CarePlan>({ ...plan, goal: [...(plan.goal ?? []), { reference: `Goal/${goal.id}`, display: goal.description.text }] });
      notifySuccess('Goal added');
      onSaved();
    } catch (err) {
      notifyError(err);
    }
  };

  return (
    <Stack>
      <TextInput label="Goal" placeholder="e.g. Prepare a simple meal independently" value={description} onChange={(e) => setDescription(e.currentTarget.value)} required data-autofocus />
      <TextInput label="How progress is measured" description="What direct support staff record at each visit" value={measure} onChange={(e) => setMeasure(e.currentTarget.value)} />
      <Group grow>
        <NumberInput label="Target" value={target} onChange={setTarget} min={0} />
        <Select label="Unit" data={['%', 'times', 'minutes', 'steps', 'rating (1-5)']} value={unit} onChange={setUnit} />
        <TextInput label="Target date" type="date" value={due} onChange={(e) => setDue(e.currentTarget.value)} />
      </Group>
      <Group justify="flex-end"><Button onClick={save} disabled={!description.trim() || !measure.trim()}>Add goal</Button></Group>
    </Stack>
  );
}

function ServiceForm({ plan, goals, onSaved }: { plan: CarePlan; goals: Goal[]; onSaved: () => void }) {
  const medplum = useMedplum();
  const { patientRef } = useChart();
  const [code, setCode] = useState<string | null>(HCBS_SERVICES[0].code);
  const [units, setUnits] = useState<number | string>(480);
  const [provider, setProvider] = useState('');
  const [goalIds, setGoalIds] = useState<string[]>(goals.map((g) => g.id as string));
  const svc = HCBS_SERVICES.find((s) => s.code === code);

  const save = async (): Promise<void> => {
    if (!svc) return;
    try {
      const sr = await medplum.createResource<ServiceRequest>({
        resourceType: 'ServiceRequest',
        status: 'draft',
        intent: 'plan',
        category: [{ coding: [cmCoding(CM_CODES.PLANNED_SERVICE, 'Planned waiver service')] }],
        code: { coding: [{ system: CM_SYSTEMS.HCPCS, code: svc.code, display: svc.display }], text: svc.display },
        subject: patientRef,
        basedOn: [{ reference: `CarePlan/${plan.id}` }],
        quantityQuantity: { value: Number(units), unit: '15 min units' },
        occurrencePeriod: { start: plan.period?.start, end: plan.period?.end },
        performer: provider.trim() ? [{ display: provider.trim() }] : undefined,
        supportingInfo: goals.filter((g) => goalIds.includes(g.id as string)).map((g) => ({ reference: `Goal/${g.id}`, display: g.description.text })),
      });
      await medplum.updateResource<CarePlan>({ ...plan, activity: [...(plan.activity ?? []), { reference: { reference: `ServiceRequest/${sr.id}`, display: svc.display } }] });
      notifySuccess('Service added to the plan');
      onSaved();
    } catch (err) {
      notifyError(err);
    }
  };

  return (
    <Stack>
      <Alert color="gray">Service codes are common HCPCS codes for HCBS waivers, shown for the demo. Confirm South Dakota's codes and unit definitions.</Alert>
      <Select label="Service" data={HCBS_SERVICES.map((s) => ({ value: s.code, label: `${s.code} · ${s.display} (${s.unitMinutes}-min units)` }))} value={code} onChange={setCode} />
      <Group grow>
        <NumberInput label="Units requested for the plan year" min={1} value={units} onChange={setUnits} />
        <TextInput label="Provider agency" placeholder="e.g. Prairie Community Supports" value={provider} onChange={(e) => setProvider(e.currentTarget.value)} />
      </Group>
      <MultiSelect label="Goals this service supports" data={goals.map((g) => ({ value: g.id as string, label: g.description.text ?? '' }))} value={goalIds} onChange={setGoalIds} />
      <Group justify="flex-end"><Button onClick={save} disabled={!svc || !Number(units)}>Add service</Button></Group>
    </Stack>
  );
}
