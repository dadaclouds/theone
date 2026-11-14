import { Alert, Button, Group, Select, Stack, Text, TextInput } from '@mantine/core';
import type { Appointment, Patient, Practitioner, Reference } from '@medplum/fhirtypes';
import { useMedplum, useMedplumProfile } from '@medplum/react';
import { useEffect, useState } from 'react';
import { patientName, profileDisplay, toLocalDateString } from '../../lib/fhir';
import { useAsync } from '../../lib/hooks';
import { toQuery } from '../../lib/search';
import { PatientSearch } from '../PatientSearch';
import { notifyError } from '../notify';

export const APPOINTMENT_TYPES = ['Office visit', 'Follow-up', 'Annual physical', 'Sick visit', 'Telehealth', 'Procedure', 'New patient'];

interface AppointmentFormProps {
  readonly patient?: Reference<Patient>;
  readonly defaultStart?: Date;
  readonly onSaved: (appointment: Appointment) => void;
}

export function AppointmentForm({ patient: fixedPatient, defaultStart, onSaved }: AppointmentFormProps) {
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const [patient, setPatient] = useState<Reference<Patient> | undefined>(fixedPatient);
  const initial = defaultStart ?? nextSlot();
  const [date, setDate] = useState(toLocalDateString(initial));
  const [time, setTime] = useState(`${String(initial.getHours()).padStart(2, '0')}:${String(initial.getMinutes()).padStart(2, '0')}`);
  const [duration, setDuration] = useState('30');
  const [type, setType] = useState('Office visit');
  const [reason, setReason] = useState('');
  const [practitionerId, setPractitionerId] = useState<string | null>(profile?.resourceType === 'Practitioner' ? (profile.id as string) : null);
  const [conflicts, setConflicts] = useState<Appointment[]>([]);
  const [saving, setSaving] = useState(false);

  const { data: practitioners = [] } = useAsync(() => medplum.searchResources('Practitioner', { _count: '100' }), [medplum]);

  const start = new Date(`${date}T${time}`);
  const end = new Date(start.getTime() + Number(duration) * 60000);

  useEffect(() => {
    if (!practitionerId || Number.isNaN(start.getTime())) {
      setConflicts([]);
      return;
    }
    medplum
      .searchResources('Appointment', toQuery({
        practitioner: `Practitioner/${practitionerId}`,
        date: [`lt${end.toISOString()}`, `ge${new Date(start.getTime() - 4 * 3600000).toISOString()}`],
        'status:not': 'cancelled',
      }), { cache: 'no-cache' })
      .then((appts) => setConflicts(appts.filter((a) => a.start && a.end && new Date(a.start) < end && new Date(a.end) > start)))
      .catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medplum, practitionerId, date, time, duration]);

  const save = async (): Promise<void> => {
    if (!patient || !practitionerId) return;
    setSaving(true);
    try {
      const practitioner = practitioners.find((p) => p.id === practitionerId) as Practitioner;
      const appt = await medplum.createResource<Appointment>({
        resourceType: 'Appointment',
        status: 'booked',
        appointmentType: { text: type },
        serviceType: [{ text: type }],
        description: reason || undefined,
        start: start.toISOString(),
        end: end.toISOString(),
        minutesDuration: Number(duration),
        created: new Date().toISOString(),
        participant: [
          { actor: patient, status: 'accepted', required: 'required' },
          { actor: { reference: `Practitioner/${practitionerId}`, display: profileDisplay(practitioner) }, status: 'accepted', required: 'required' },
        ],
      });
      onSaved(appt);
    } catch (err) {
      notifyError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack>
      {fixedPatient ? (
        <Text size="sm">Patient: <b>{fixedPatient.display}</b></Text>
      ) : patient ? (
        <Group justify="space-between">
          <Text size="sm">Patient: <b>{patient.display}</b></Text>
          <Button size="xs" variant="subtle" onClick={() => setPatient(undefined)}>Change</Button>
        </Group>
      ) : (
        <PatientSearch label="Patient" onSelect={(p) => setPatient({ reference: `Patient/${p.id}`, display: patientName(p) })} />
      )}
      <Select
        label="Provider"
        data={practitioners.map((p) => ({ value: p.id as string, label: profileDisplay(p) ?? p.id ?? '' }))}
        value={practitionerId}
        onChange={setPractitionerId}
        comboboxProps={{ withinPortal: true }}
      />
      <Group grow>
        <TextInput label="Date" type="date" value={date} onChange={(e) => setDate(e.currentTarget.value)} />
        <TextInput label="Time" type="time" step={300} value={time} onChange={(e) => setTime(e.currentTarget.value)} />
        <Select label="Duration" data={['15', '20', '30', '45', '60'].map((d) => ({ value: d, label: `${d} min` }))} value={duration} onChange={(v) => setDuration(v ?? '30')} />
      </Group>
      <Select label="Visit type" data={APPOINTMENT_TYPES} value={type} onChange={(v) => setType(v ?? 'Office visit')} />
      <TextInput label="Reason for visit" value={reason} onChange={(e) => setReason(e.currentTarget.value)} />
      {conflicts.length > 0 && (
        <Alert color="orange" title="Scheduling conflict">
          Provider already has {conflicts.length} appointment(s) overlapping this time.
        </Alert>
      )}
      <Group justify="flex-end">
        <Button onClick={save} loading={saving} disabled={!patient || !practitionerId}>
          Book appointment
        </Button>
      </Group>
    </Stack>
  );
}

function nextSlot(): Date {
  const d = new Date();
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  return d;
}
