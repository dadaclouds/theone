import { Alert, Anchor, Badge, Button, Card, Grid, Group, Loader, Center, Menu, Modal, Stack, Text, Textarea, Title } from '@mantine/core';
import { IconArrowLeft, IconCheck, IconPrinter, IconTemplate } from '@tabler/icons-react';
import { createReference } from '@medplum/core';
import type { Appointment, Claim, Condition, Coverage, DocumentReference, Encounter, Patient, Practitioner, Provenance, Reference } from '@medplum/fhirtypes';
import { useMedplum, useMedplumProfile } from '@medplum/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { StatusBadge } from '../../components/common';
import { notifyError, notifySuccess } from '../../components/notify';
import { buildClaim, buildSelfPayCoverage, type ChargeLine } from '../../lib/billing';
import { ADDENDUM_LOINC, SYSTEMS } from '../../lib/constants';
import { conceptText, encodeBase64, formatDateTime, patientName, patientSummaryLine, profileDisplay } from '../../lib/fhir';
import { useAsync } from '../../lib/hooks';
import { buildNoteDocument, EMPTY_NOTE, isNoteEmpty, markdownToSoap, NOTE_TEMPLATES, readNoteText, SOAP_SECTIONS, type SoapNote } from '../../lib/notes';
import { NoteView } from '../patient/NotesTab';
import { EncounterSidebar } from './EncounterSidebar';

export function EncounterPage() {
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const navigate = useNavigate();
  const { patientId = '', encounterId = '' } = useParams();

  const { data, reload } = useAsync(async () => {
    const opts = { cache: 'no-cache' as const };
    const [patient, encounter, notes, diagnoses] = await Promise.all([
      medplum.readResource('Patient', patientId, opts),
      medplum.readResource('Encounter', encounterId, opts),
      medplum.searchResources('DocumentReference', { encounter: `Encounter/${encounterId}`, _sort: 'date', _count: '50' }, opts),
      medplum.searchResources('Condition', { encounter: `Encounter/${encounterId}`, category: 'encounter-diagnosis', _count: '50' }, opts),
    ]);
    return { patient, encounter, notes, diagnoses: diagnoses.filter((d) => d.verificationStatus?.coding?.[0]?.code !== 'entered-in-error') };
  }, [medplum, patientId, encounterId]);

  if (!data) {
    return (
      <Center h={300}>
        <Loader />
      </Center>
    );
  }
  return <EncounterView key={data.encounter.meta?.versionId} {...data} reload={reload} profile={profile as Practitioner} navigate={navigate} />;
}

interface EncounterViewProps {
  readonly patient: Patient;
  readonly encounter: Encounter;
  readonly notes: DocumentReference[];
  readonly diagnoses: Condition[];
  readonly reload: () => void;
  readonly profile: Practitioner | undefined;
  readonly navigate: ReturnType<typeof useNavigate>;
}

function EncounterView({ patient, encounter, notes, diagnoses, reload, profile, navigate }: EncounterViewProps) {
  const medplum = useMedplum();
  const patientRef: Reference<Patient> = { reference: `Patient/${patient.id}`, display: patientName(patient) };
  const encounterRef: Reference<Encounter> = { reference: `Encounter/${encounter.id}`, display: encounter.type?.[0]?.text };
  const authorRef = profile ? ({ reference: `${profile.resourceType}/${profile.id}`, display: profileDisplay(profile) } as Reference<Practitioner>) : undefined;

  const primaryNote = notes.find((n) => !n.relatesTo?.length && n.status !== 'entered-in-error');
  const addenda = notes.filter((n) => n.relatesTo?.some((r) => r.code === 'appends'));
  const signed = encounter.status === 'finished' || primaryNote?.docStatus === 'final';

  const [note, setNote] = useState<SoapNote>(() => (primaryNote ? markdownToSoap(readNoteText(primaryNote)) : { ...EMPTY_NOTE, subjective: encounter.reasonCode?.[0]?.text ? `CC: ${encounter.reasonCode[0].text}\n` : '' }));
  const [docRef, setDocRef] = useState<DocumentReference | undefined>(primaryNote);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string | undefined>(primaryNote?.meta?.lastUpdated);
  const [saving, setSaving] = useState(false);
  const [signing, setSigning] = useState(false);
  const [charges, setCharges] = useState<ChargeLine[]>([]);
  const [addendumOpen, setAddendumOpen] = useState(false);
  const [addendum, setAddendum] = useState('');
  const savingRef = useRef(false);

  const saveDraft = useCallback(async (): Promise<DocumentReference | undefined> => {
    if (signed || savingRef.current) return docRef;
    if (isNoteEmpty(note) && !docRef) return undefined;
    savingRef.current = true;
    setSaving(true);
    try {
      const resource = buildNoteDocument({
        patient: patientRef,
        encounter: encounterRef,
        author: authorRef,
        note,
        title: `${encounter.type?.[0]?.text ?? 'Visit'} note`,
        existing: docRef,
      });
      const saved = docRef ? await medplum.updateResource(resource) : await medplum.createResource(resource);
      setDocRef(saved);
      setDirty(false);
      setSavedAt(saved.meta?.lastUpdated);
      return saved;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medplum, note, docRef, signed]);

  // Autosave the draft 2 seconds after the clinician stops typing.
  useEffect(() => {
    if (!dirty || signed) return undefined;
    const t = setTimeout(() => saveDraft().catch(notifyError), 2000);
    return () => clearTimeout(t);
  }, [dirty, note, saveDraft, signed]);

  const update = (key: keyof SoapNote, value: string): void => {
    setNote((n) => ({ ...n, [key]: value }));
    setDirty(true);
  };

  const applyTemplate = (tpl: SoapNote): void => {
    setNote((n) => ({
      subjective: n.subjective.trim() ? `${n.subjective}\n${tpl.subjective}` : tpl.subjective,
      objective: n.objective.trim() ? `${n.objective}\n${tpl.objective}` : tpl.objective,
      assessment: n.assessment.trim() ? n.assessment : tpl.assessment,
      plan: n.plan.trim() ? `${n.plan}\n${tpl.plan}` : tpl.plan,
    }));
    setDirty(true);
  };

  const sign = async (): Promise<void> => {
    if (isNoteEmpty(note)) {
      notifyError(new Error('The note is empty.'));
      return;
    }
    if (diagnoses.length === 0) {
      notifyError(new Error('Add at least one diagnosis before signing.'));
      return;
    }
    setSigning(true);
    try {
      const draft = (await saveDraft()) as DocumentReference;
      const now = new Date().toISOString();
      const final = await medplum.updateResource<DocumentReference>({
        ...draft,
        docStatus: 'final',
        authenticator: authorRef,
        date: now,
      });
      if (authorRef) {
        await medplum.createResource<Provenance>({
          resourceType: 'Provenance',
          target: [createReference(final), encounterRef],
          recorded: now,
          activity: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-DataOperation', code: 'UPDATE', display: 'revise' }], text: 'Note signed' },
          agent: [{ type: { coding: [{ system: SYSTEMS.PROVENANCE_PARTICIPANT, code: 'author' }] }, who: authorRef }],
          signature: [{
            type: [{ system: SYSTEMS.SIGNATURE_TYPE, code: '1.2.840.10065.1.12.1.1', display: "Author's Signature" }],
            when: now,
            who: authorRef,
            sigFormat: 'text/plain',
            data: encodeBase64(`Electronically signed by ${authorRef.display} at ${now}`),
          }],
        });
      }
      const finished = await medplum.updateResource<Encounter>({
        ...encounter,
        status: 'finished',
        period: { ...encounter.period, end: now },
        diagnosis: diagnoses.map((d, i) => ({ condition: { reference: `Condition/${d.id}`, display: conceptText(d.code) }, rank: i + 1 })),
      });
      for (const apptRef of finished.appointment ?? []) {
        const appt = await medplum.readResource('Appointment', apptRef.reference?.split('/')[1] as string);
        if (appt.status !== 'fulfilled') {
          await medplum.updateResource<Appointment>({ ...appt, status: 'fulfilled' });
        }
      }
      if (charges.length > 0 && authorRef) {
        await createClaim(finished, charges);
      }
      notifySuccess('Visit signed and closed');
      reload();
    } catch (err) {
      notifyError(err);
    } finally {
      setSigning(false);
    }
  };

  const createClaim = async (enc: Encounter, lines: ChargeLine[]): Promise<Claim> => {
    let coverage = await medplum.searchOne('Coverage', { beneficiary: `Patient/${patient.id}`, status: 'active', _sort: '-_lastUpdated' });
    if (!coverage) {
      coverage = await medplum.createResource<Coverage>(buildSelfPayCoverage(patientRef));
    }
    return medplum.createResource(
      buildClaim({
        patient: patientRef,
        provider: authorRef as Reference<Practitioner>,
        encounter: { reference: `Encounter/${enc.id}` },
        coverage: { reference: `Coverage/${coverage.id}`, display: coverage.payor?.[0]?.display ?? 'Self-pay' },
        diagnoses,
        lines,
        serviceDate: (enc.period?.start ?? new Date().toISOString()).slice(0, 10),
      })
    );
  };

  const saveAddendum = async (): Promise<void> => {
    if (!addendum.trim() || !primaryNote) return;
    try {
      const now = new Date().toISOString();
      await medplum.createResource<DocumentReference>({
        resourceType: 'DocumentReference',
        status: 'current',
        docStatus: 'final',
        type: { coding: [{ system: SYSTEMS.LOINC, ...ADDENDUM_LOINC }], text: 'Addendum' },
        category: [{ coding: [{ system: SYSTEMS.DOC_CATEGORY, code: 'clinical-note', display: 'Clinical Note' }] }],
        subject: patientRef,
        author: authorRef ? [authorRef] : undefined,
        authenticator: authorRef,
        date: now,
        description: `Addendum to ${primaryNote.description}`,
        relatesTo: [{ code: 'appends', target: createReference(primaryNote) }],
        context: { encounter: [encounterRef] },
        content: [{ attachment: { contentType: 'text/markdown', data: encodeBase64(`## Subjective\n\n${addendum.trim()}\n`), creation: now } }],
      });
      setAddendum('');
      setAddendumOpen(false);
      notifySuccess('Addendum signed');
      reload();
    } catch (err) {
      notifyError(err);
    }
  };

  return (
    <Stack gap="sm">
      <Card withBorder padding="sm">
        <Group justify="space-between" wrap="wrap">
          <Group gap="sm">
            <Button variant="subtle" px={6} onClick={() => navigate(`/patients/${patient.id}/encounters`)} aria-label="Back to chart" className="no-print">
              <IconArrowLeft size={18} />
            </Button>
            <div>
              <Group gap="xs">
                <Anchor fw={700} size="lg" c="inherit" onClick={() => navigate(`/patients/${patient.id}`)}>{patientName(patient)}</Anchor>
                <StatusBadge status={encounter.status} />
              </Group>
              <Text size="sm" c="dimmed">
                {patientSummaryLine(patient)} · {encounter.type?.[0]?.text} · {formatDateTime(encounter.period?.start)}
                {encounter.participant?.[0]?.individual?.display ? ` · ${encounter.participant[0].individual.display}` : ''}
              </Text>
            </div>
          </Group>
          <Group gap="xs" className="no-print">
            {!signed && (
              <Text size="xs" c="dimmed" data-testid="save-status">
                {saving ? 'Saving…' : dirty ? 'Unsaved changes' : savedAt ? `Draft saved ${formatDateTime(savedAt)}` : ''}
              </Text>
            )}
            <Button variant="default" leftSection={<IconPrinter size={16} />} onClick={() => window.print()}>Print</Button>
            {!signed && (
              <>
                <Button variant="default" onClick={() => saveDraft().then(() => notifySuccess('Draft saved')).catch(notifyError)} loading={saving}>
                  Save draft
                </Button>
                <Button color="green" leftSection={<IconCheck size={16} />} onClick={sign} loading={signing}>
                  Sign &amp; close visit
                </Button>
              </>
            )}
            {signed && primaryNote && (
              <Button variant="light" onClick={() => setAddendumOpen(true)}>Add addendum</Button>
            )}
          </Group>
        </Group>
      </Card>
      <Grid>
        <Grid.Col span={{ base: 12, lg: 8 }}>
          {signed && primaryNote ? (
            <Stack>
              <Alert color="green" icon={<IconCheck />}>
                Signed by {primaryNote.authenticator?.display ?? 'provider'} · {formatDateTime(primaryNote.date)}. Signed notes are locked; use an addendum for corrections.
              </Alert>
              <NoteView note={primaryNote} />
              {addenda.map((a) => <NoteView key={a.id} note={a} />)}
            </Stack>
          ) : signed ? (
            <Alert color="gray">This encounter was closed without a note.</Alert>
          ) : (
            <Card withBorder>
              <Group justify="space-between" mb="sm">
                <Title order={4}>Visit note</Title>
                <Menu>
                  <Menu.Target>
                    <Button variant="light" size="xs" leftSection={<IconTemplate size={14} />}>Insert template</Button>
                  </Menu.Target>
                  <Menu.Dropdown>
                    {NOTE_TEMPLATES.map((t) => (
                      <Menu.Item key={t.name} onClick={() => applyTemplate(t.note)}>{t.name}</Menu.Item>
                    ))}
                  </Menu.Dropdown>
                </Menu>
              </Group>
              <Stack gap="sm">
                {SOAP_SECTIONS.map((s) => (
                  <Textarea
                    key={s.key}
                    className="note-textarea"
                    label={s.title}
                    placeholder={s.placeholder}
                    autosize
                    minRows={s.key === 'subjective' ? 5 : 3}
                    value={note[s.key]}
                    onChange={(e) => update(s.key, e.currentTarget.value)}
                  />
                ))}
              </Stack>
              {diagnoses.length > 0 && (
                <Group gap={4} mt="sm">
                  <Text size="xs" c="dimmed">Diagnoses:</Text>
                  {diagnoses.map((d) => <Badge key={d.id} variant="light">{conceptText(d.code)}</Badge>)}
                </Group>
              )}
            </Card>
          )}
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 4 }} className="no-print">
          <EncounterSidebar
            patient={patient}
            patientRef={patientRef}
            encounter={encounter}
            encounterRef={encounterRef}
            diagnoses={diagnoses}
            signed={signed}
            charges={charges}
            onChargesChange={setCharges}
            onDiagnosesChanged={reload}
            onInsertText={(section, text) => update(section, note[section].trim() ? `${note[section].trimEnd()}\n${text}` : text)}
          />
        </Grid.Col>
      </Grid>
      <Modal opened={addendumOpen} onClose={() => setAddendumOpen(false)} title="Add addendum" size="lg">
        <Stack>
          <Textarea autosize minRows={4} value={addendum} onChange={(e) => setAddendum(e.currentTarget.value)} placeholder="Addendum text" />
          <Group justify="flex-end"><Button onClick={saveAddendum} disabled={!addendum.trim()}>Sign addendum</Button></Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
