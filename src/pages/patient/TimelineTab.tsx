import { PatientTimeline } from '@medplum/react';
import { useChart } from './PatientContext';

export function TimelineTab() {
  const { patient } = useChart();
  return <PatientTimeline patient={patient} />;
}
