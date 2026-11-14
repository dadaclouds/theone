import { Badge, Card, Center, Group, Stack, Text, Title, type BadgeProps } from '@mantine/core';
import type { ReactNode } from 'react';

const STATUS_COLORS: Record<string, string> = {
  active: 'green',
  booked: 'blue',
  arrived: 'teal',
  fulfilled: 'gray',
  finished: 'gray',
  completed: 'gray',
  'in-progress': 'orange',
  planned: 'blue',
  draft: 'yellow',
  preliminary: 'yellow',
  final: 'green',
  amended: 'green',
  requested: 'blue',
  received: 'blue',
  accepted: 'cyan',
  ready: 'cyan',
  cancelled: 'red',
  noshow: 'red',
  'entered-in-error': 'red',
  stopped: 'red',
  'on-hold': 'yellow',
  resolved: 'gray',
  inactive: 'gray',
  revoked: 'red',
  rejected: 'red',
  failed: 'red',
  routine: 'gray',
  urgent: 'orange',
  asap: 'red',
  stat: 'red',
  high: 'red',
  low: 'gray',
  moderate: 'orange',
  severe: 'red',
  mild: 'yellow',
};

export function StatusBadge({ status, ...rest }: { status: string | undefined } & BadgeProps) {
  if (!status) {
    return null;
  }
  return (
    <Badge variant="light" color={STATUS_COLORS[status] ?? 'gray'} {...rest}>
      {status.replace(/-/g, ' ')}
    </Badge>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <Group justify="space-between" mb="md" align="flex-end" wrap="wrap">
      <div>
        <Title order={2}>{title}</Title>
        {subtitle && (
          <Text c="dimmed" size="sm">
            {subtitle}
          </Text>
        )}
      </div>
      {actions && <Group gap="xs">{actions}</Group>}
    </Group>
  );
}

export function SectionCard({
  title,
  actions,
  children,
  ...rest
}: {
  title: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  'data-testid'?: string;
}) {
  return (
    <Card withBorder padding="md" radius="md" data-testid={rest['data-testid']}>
      <Group justify="space-between" mb="sm" wrap="nowrap">
        <Title order={5}>{title}</Title>
        {actions && <Group gap={4}>{actions}</Group>}
      </Group>
      {children}
    </Card>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <Center py="md">
      <Stack gap={4} align="center">
        <Text c="dimmed" size="sm">
          {children}
        </Text>
      </Stack>
    </Center>
  );
}
