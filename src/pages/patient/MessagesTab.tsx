import { Card } from '@mantine/core';
import { MessageThread } from '../../components/MessageThread';
import { useChart } from './PatientContext';

export function MessagesTab() {
  const { patientRef } = useChart();
  return (
    <Card withBorder>
      <MessageThread patient={patientRef} />
    </Card>
  );
}
