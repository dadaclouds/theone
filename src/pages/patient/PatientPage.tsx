import { Alert, Center, Loader, ScrollArea, Stack, Tabs } from '@mantine/core';
import { getReferenceString } from '@medplum/core';
import type { Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router';
import { errorMessage, patientName } from '../../lib/fhir';
import { useAsync } from '../../lib/hooks';
import { AllergiesTab } from './AllergiesTab';
import { AppointmentsTab } from './AppointmentsTab';
import { BillingTab } from './BillingTab';
import { DocumentsTab } from './DocumentsTab';
import { EligibilityTab } from './EligibilityTab';
import { EncountersTab } from './EncountersTab';
import { ImmunizationsTab } from './ImmunizationsTab';
import { LabsTab } from './LabsTab';
import { MedicationsTab } from './MedicationsTab';
import { MessagesTab } from './MessagesTab';
import { NotesTab } from './NotesTab';
import { PatientBanner } from './PatientBanner';
import { ChartContext, type ChartData } from './PatientContext';
import { ProblemsTab } from './ProblemsTab';
import { ServicesTab } from './ServicesTab';
import { SummaryTab } from './SummaryTab';
import { SupportPlanTab } from './SupportPlanTab';
import { TimelineTab } from './TimelineTab';
import { VitalsTab } from './VitalsTab';

const TABS = [
  { value: 'summary', label: 'Summary', component: SummaryTab },
  { value: 'eligibility', label: 'Eligibility', component: EligibilityTab },
  { value: 'support-plan', label: 'Support plan', component: SupportPlanTab },
  { value: 'services', label: 'Services & visits', component: ServicesTab },
  { value: 'encounters', label: 'Encounters', component: EncountersTab },
  { value: 'notes', label: 'Notes', component: NotesTab },
  { value: 'problems', label: 'Problems', component: ProblemsTab },
  { value: 'medications', label: 'Medications', component: MedicationsTab },
  { value: 'allergies', label: 'Allergies', component: AllergiesTab },
  { value: 'vitals', label: 'Vitals', component: VitalsTab },
  { value: 'labs', label: 'Labs', component: LabsTab },
  { value: 'immunizations', label: 'Immunizations', component: ImmunizationsTab },
  { value: 'documents', label: 'Documents', component: DocumentsTab },
  { value: 'appointments', label: 'Appointments', component: AppointmentsTab },
  { value: 'messages', label: 'Messages', component: MessagesTab },
  { value: 'billing', label: 'Billing', component: BillingTab },
  { value: 'timeline', label: 'Timeline', component: TimelineTab },
];

export function PatientPage() {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const { patientId = '', tab = 'summary' } = useParams();

  const { data, error, reload } = useAsync(async () => {
    const patient = (await medplum.readResource('Patient', patientId)) as Patient & { id: string };
    const ref = getReferenceString(patient);
    const opts = { cache: 'no-cache' as const };
    const [allergies, problems, medications, coverages] = await Promise.all([
      medplum.searchResources('AllergyIntolerance', { patient: ref, _count: '100' }, opts),
      medplum.searchResources('Condition', { subject: ref, category: 'problem-list-item', _count: '100', _sort: '-_lastUpdated' }, opts),
      medplum.searchResources('MedicationRequest', { subject: ref, _count: '100', _sort: '-authoredon' }, opts),
      medplum.searchResources('Coverage', { beneficiary: ref, status: 'active', _sort: '-_lastUpdated' }, opts),
    ]);
    return { patient, allergies, problems, medications, coverage: coverages.find((c) => c.type?.coding?.[0]?.code !== 'pay') };
  }, [medplum, patientId]);

  const chart: ChartData | undefined = useMemo(
    () =>
      data
        ? {
            ...data,
            patientRef: { reference: `Patient/${data.patient.id}`, display: patientName(data.patient) },
            refresh: reload,
          }
        : undefined,
    [data, reload]
  );

  if (error && !data) {
    return <Alert color="red">Unable to load patient: {errorMessage(error)}</Alert>;
  }
  if (!chart || chart.patient.id !== patientId) {
    return (
      <Center h={300}>
        <Loader />
      </Center>
    );
  }

  const Active = TABS.find((t) => t.value === tab)?.component ?? SummaryTab;

  return (
    <ChartContext.Provider value={chart}>
      <Stack gap="sm">
        <PatientBanner />
        <Tabs value={tab} onChange={(v) => navigate(`/patients/${patientId}/${v}`)} className="no-print">
          <ScrollArea type="auto" offsetScrollbars>
            <Tabs.List style={{ flexWrap: 'nowrap' }}>
              {TABS.map((t) => (
                <Tabs.Tab key={t.value} value={t.value}>
                  {t.label}
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </ScrollArea>
        </Tabs>
        <Active key={tab} />
      </Stack>
    </ChartContext.Provider>
  );
}
