import { Alert, Anchor, Badge, Button, Card, Group, Progress, Stack, Table, Text, Tooltip } from '@mantine/core';
import { IconAlertTriangle, IconExternalLink, IconRefresh } from '@tabler/icons-react';
import type { Encounter, ServiceRequest } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';
import { EmptyState, SectionCard } from '../../components/common';
import { notifyError, notifySuccess } from '../../components/notify';
import { CM_CODES, CM_SYSTEMS, EXT, UNIT_ALERT_THRESHOLD } from '../../lib/casemgmt/constants';
import type { FocosAuthorization } from '../../lib/casemgmt/focos';
import { getFocosClient, getFocosEvvUrl } from '../../lib/casemgmt/focosConfig';
import { identifierValue, medicaidId, serviceCode, unitUsage } from '../../lib/casemgmt/mapping';
import { syncParticipantFromFocos } from '../../lib/casemgmt/workflow';
import { formatDate, formatDateTime } from '../../lib/fhir';
import { useAsync } from '../../lib/hooks';
import { useChart } from './PatientContext';

const ext = (e: Encounter, url: string) => e.extension?.find((x) => x.url === url);

export function ServicesTab() {
  const medplum = useMedplum();
  const { patient, patientRef } = useChart();
  const focos = getFocosClient();
  const mid = medicaidId(patient);
  const ref = patientRef.reference as string;
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string>();

  const { data, reload } = useAsync(async () => {
    const opts = { cache: 'no-cache' as const };
    const [auths, encounters, alerts, focosAuths] = await Promise.all([
      medplum.searchResources('ServiceRequest', { subject: ref, status: 'active', category: `${CM_SYSTEMS.CASE_MGMT}|${CM_CODES.PLANNED_SERVICE}` }, opts),
      medplum.searchResources('Encounter', { subject: ref, _sort: '-date', _count: '500' }, opts),
      medplum.searchResources('Task', { patient: ref, code: `${CM_SYSTEMS.CASE_MGMT}|${CM_CODES.AUTH_CAP_ALERT}`, status: 'requested,in-progress' }, opts),
      focos && mid ? focos.listAuthorizations(mid).catch(() => undefined) : Promise.resolve(undefined),
    ]);
    const visits = encounters.filter((e) => identifierValue(e, CM_SYSTEMS.FOCOS_VISIT));
    return { auths, visits, alerts, focosAuths };
  }, [medplum, ref, mid]);

  const sync = async (quiet = false): Promise<void> => {
    if (!focos) return;
    setSyncing(true);
    try {
      const s = await syncParticipantFromFocos(medplum, focos, patient);
      setLastSync(new Date().toISOString());
      if (!quiet) notifySuccess(`Synced ${s.visits} visit(s) and ${s.observations} goal measurement(s) from FOCOS`);
      reload();
    } catch (err) {
      if (!quiet) notifyError(err);
    } finally {
      setSyncing(false);
    }
  };

  // Pull the latest verified visits whenever the tab opens.
  useEffect(() => {
    sync(true).catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient.id]);

  if (!focos) {
    return <Alert color="yellow">FOCOS integration is not configured. Set MEDPLUM_FOCOS_API_URL and MEDPLUM_FOCOS_API_KEY in .env.</Alert>;
  }
  if (!mid) {
    return <Alert color="yellow">Add the participant's Medicaid ID (Edit demographics) to link them to FOCOS.</Alert>;
  }

  const balance = (sr: ServiceRequest): FocosAuthorization | undefined => data?.focosAuths?.find((a) => a.externalRef === `ServiceRequest/${sr.id}`);

  return (
    <Stack>
      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          Service delivery and EVV run in FOCOS Connect. {lastSync ? `Last synced ${formatDateTime(lastSync)}.` : ''}
        </Text>
        <Group gap="xs">
          {getFocosEvvUrl() && (
            <Button component="a" href={getFocosEvvUrl()} target="_blank" variant="default" leftSection={<IconExternalLink size={16} />}>
              Open FOCOS EVV (demo)
            </Button>
          )}
          <Button leftSection={<IconRefresh size={16} />} loading={syncing} onClick={() => sync()}>Sync from FOCOS</Button>
        </Group>
      </Group>
      {(data?.alerts ?? []).map((a) => (
        <Alert key={a.id} color={a.priority === 'urgent' ? 'red' : 'orange'} icon={<IconAlertTriangle />} title="Authorization nearing unit cap" data-testid="cap-alert">
          {a.description}
        </Alert>
      ))}
      <SectionCard title="Active authorizations" data-testid="auth-balances">
        {(data?.auths ?? []).length === 0 ? <EmptyState>No approved authorizations. Request them from the Support plan tab.</EmptyState> : (
          <Stack gap="sm">
            {data?.auths.map((sr) => {
              const b = balance(sr);
              const authorized = b?.authorizedUnits ?? sr.quantityQuantity?.value ?? 0;
              const used = b?.usedUnits ?? 0;
              const { ratio, remaining } = unitUsage(authorized, used);
              const end = sr.occurrencePeriod?.end;
              const daysLeft = end ? Math.ceil((new Date(end).getTime() - Date.now()) / 86400000) : undefined;
              return (
                <Card key={sr.id} withBorder padding="sm">
                  <Group justify="space-between" wrap="nowrap">
                    <div>
                      <Text fw={600} size="sm">{serviceCode(sr)} · {sr.code?.text}</Text>
                      <Text size="xs" c="dimmed">
                        Auth {identifierValue(sr, CM_SYSTEMS.AUTHORIZATION_NUMBER)} · {formatDate(sr.occurrencePeriod?.start)} to {formatDate(end)} · {sr.performer?.[0]?.display ?? 'Provider TBD'}
                      </Text>
                    </div>
                    <Stack gap={2} align="flex-end">
                      <Text size="sm" fw={600}>{used} / {authorized} units used</Text>
                      <Text size="xs" c="dimmed">{remaining} left{daysLeft !== undefined ? ` · ${daysLeft} days left` : ''}</Text>
                    </Stack>
                  </Group>
                  <Progress mt="xs" value={Math.min(100, ratio * 100)} color={ratio >= 1 ? 'red' : ratio >= UNIT_ALERT_THRESHOLD ? 'orange' : 'blue'} />
                  {!b && <Text size="xs" c="orange" mt={4}>Not found in FOCOS yet.</Text>}
                </Card>
              );
            })}
          </Stack>
        )}
      </SectionCard>
      <SectionCard title="Verified visits from FOCOS EVV" data-testid="visits-card">
        {(data?.visits ?? []).length === 0 ? <EmptyState>No visits yet. Visits appear after direct support staff complete them in FOCOS EVV.</EmptyState> : (
          <Table.ScrollContainer minWidth={760}>
            <Table verticalSpacing="xs">
              <Table.Thead>
                <Table.Tr><Table.Th>Date</Table.Th><Table.Th>Service</Table.Th><Table.Th>Staff</Table.Th><Table.Th>Minutes</Table.Th><Table.Th>Units</Table.Th><Table.Th>Verification</Table.Th><Table.Th>Notes</Table.Th></Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data?.visits.map((e) => {
                  const gps = ext(e, EXT.EVV_GPS)?.valueString;
                  return (
                    <Table.Tr key={e.id}>
                      <Table.Td>{formatDateTime(e.period?.start)}</Table.Td>
                      <Table.Td>{e.type?.[0]?.text}</Table.Td>
                      <Table.Td>{e.participant?.[0]?.individual?.display}</Table.Td>
                      <Table.Td>{e.length?.value}</Table.Td>
                      <Table.Td>{ext(e, EXT.EVV_UNITS)?.valueInteger}</Table.Td>
                      <Table.Td>
                        <Group gap={4}>
                          {gps && <Tooltip label={`GPS ${gps}`}><Anchor size="xs" href={`https://www.openstreetmap.org/?mlat=${gps.split(',')[0]}&mlon=${gps.split(',')[1]}#map=16/${gps.replace(',', '/')}`} target="_blank"><Badge size="xs" color="green" variant="light">GPS</Badge></Anchor></Tooltip>}
                          {ext(e, EXT.EVV_SIGNATURE)?.valueBoolean && <Badge size="xs" color="green" variant="light">Signed</Badge>}
                        </Group>
                      </Table.Td>
                      <Table.Td><Text size="xs" lineClamp={2}>{ext(e, EXT.EVV_NOTES)?.valueString}</Text></Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </SectionCard>
    </Stack>
  );
}
