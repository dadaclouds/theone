import { AppShell, Avatar, Badge, Burger, Group, Menu, NavLink, ScrollArea, Text, UnstyledButton } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconCalendar,
  IconGavel,
  IconChecklist,
  IconHome,
  IconInbox,
  IconLogout,
  IconMessages,
  IconReceipt,
  IconSettings,
  IconStethoscope,
  IconUser,
  IconUsers,
} from '@tabler/icons-react';
import { useMedplum, useMedplumProfile } from '@medplum/react';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { APP_NAME } from '../lib/branding';
import { CM_CODES, CM_SYSTEMS } from '../lib/casemgmt/constants';
import { TASK_CODES, SYSTEMS, WORK_QUEUE_EXCLUDED } from '../lib/constants';
import { toQuery } from '../lib/search';
import { profileDisplay } from '../lib/fhir';
import { PatientSearch } from './PatientSearch';

/** Dispatch this window event after changing work-queue items so the nav badges update immediately. */
export const COUNTS_CHANGED = 'ehr:counts-changed';
export const notifyCountsChanged = (): void => void window.dispatchEvent(new Event(COUNTS_CHANGED));

interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
  countKey?: 'inbox' | 'tasks' | 'approvals';
}

const NAV: NavItem[] = [
  { label: 'Dashboard', href: '/', icon: <IconHome size={18} /> },
  { label: 'Participants', href: '/patients', icon: <IconUsers size={18} /> },
  { label: 'Schedule', href: '/schedule', icon: <IconCalendar size={18} /> },
  { label: 'Approvals', href: '/approvals', icon: <IconGavel size={18} />, countKey: 'approvals' },
  { label: 'Results inbox', href: '/inbox', icon: <IconInbox size={18} />, countKey: 'inbox' },
  { label: 'Tasks', href: '/tasks', icon: <IconChecklist size={18} />, countKey: 'tasks' },
  { label: 'Messages', href: '/messages', icon: <IconMessages size={18} /> },
  { label: 'Billing', href: '/billing', icon: <IconReceipt size={18} /> },
  { label: 'Admin', href: '/admin', icon: <IconSettings size={18} /> },
];

export function Shell({ children }: { children: ReactNode }) {
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const navigate = useNavigate();
  const location = useLocation();
  const [opened, { toggle, close }] = useDisclosure();
  const [counts, setCounts] = useState<{ inbox: number; tasks: number; approvals: number }>({ inbox: 0, tasks: 0, approvals: 0 });
  const project = medplum.getProject();

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      const open = 'requested,received,accepted,in-progress,ready';
      const [inbox, tasks, approvals] = await Promise.all([
        medplum.search('Task', { code: `${SYSTEMS.TASK_TYPE}|${TASK_CODES.REVIEW_RESULT}`, status: open, _summary: 'count' }, { cache: 'no-cache' }),
        medplum.search('Task', toQuery({ 'code:not': WORK_QUEUE_EXCLUDED, status: open, _summary: 'count' }), { cache: 'no-cache' }),
        medplum.search('Task', { code: `${CM_SYSTEMS.CASE_MGMT}|${CM_CODES.AUTH_APPROVAL}`, status: open, _summary: 'count' }, { cache: 'no-cache' }),
      ]);
      if (!cancelled) {
        setCounts({ inbox: inbox.total ?? 0, tasks: tasks.total ?? 0, approvals: approvals.total ?? 0 });
      }
    };
    const refresh = (): void => void load().catch(console.error);
    refresh();
    const timer = setInterval(refresh, 30000);
    window.addEventListener(COUNTS_CHANGED, refresh);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener(COUNTS_CHANGED, refresh);
    };
  }, [medplum, location.pathname]);

  const isActive = (href: string): boolean =>
    href === '/' ? location.pathname === '/' : location.pathname.startsWith(href);

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 230, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header px="md">
        <Group h="100%" justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <UnstyledButton onClick={() => navigate('/')}>
              <Group gap={6} wrap="nowrap">
                <IconStethoscope size={24} color="var(--mantine-color-blue-6)" />
                <Text fw={700} size="lg" visibleFrom="xs">
                  {APP_NAME}
                </Text>
              </Group>
            </UnstyledButton>
          </Group>
          <PatientSearch onSelect={(p) => navigate(`/patients/${p.id}`)} w={{ base: 180, sm: 360 }} />
          <Menu position="bottom-end" width={240}>
            <Menu.Target>
              <UnstyledButton aria-label="User menu">
                <Group gap="xs" wrap="nowrap">
                  <Avatar radius="xl" size="sm" color="blue">
                    {(profileDisplay(profile) ?? '?').charAt(0)}
                  </Avatar>
                  <Text size="sm" visibleFrom="md">
                    {profileDisplay(profile)}
                  </Text>
                </Group>
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>{project?.name ?? 'Project'}</Menu.Label>
              <Menu.Item leftSection={<IconUser size={16} />} onClick={() => navigate('/profile')}>
                My profile
              </Menu.Item>
              <Menu.Divider />
              <Menu.Item
                leftSection={<IconLogout size={16} />}
                onClick={async () => {
                  await medplum.signOut();
                  navigate('/signin');
                }}
              >
                Sign out
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="xs">
        <ScrollArea>
          {NAV.map((item) => (
            <NavLink
              key={item.href}
              label={item.label}
              leftSection={item.icon}
              active={isActive(item.href)}
              onClick={() => {
                navigate(item.href);
                close();
              }}
              rightSection={
                item.countKey && counts[item.countKey] > 0 ? (
                  <Badge size="sm" circle={counts[item.countKey] < 10} color="red">
                    {counts[item.countKey]}
                  </Badge>
                ) : undefined
              }
              style={{ borderRadius: 8 }}
            />
          ))}
        </ScrollArea>
      </AppShell.Navbar>
      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}
