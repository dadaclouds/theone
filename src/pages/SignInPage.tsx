import { Anchor, Button, Center, Collapse, Group, Stack, Text, TextInput, Title } from '@mantine/core';
import { IconStethoscope } from '@tabler/icons-react';
import { SignInForm } from '@medplum/react';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { APP_NAME } from '../lib/branding';
import { getBaseUrl, setBaseUrl } from '../lib/server';

export function SignInPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [showServer, setShowServer] = useState(false);
  const [server, setServer] = useState(getBaseUrl());

  return (
    <Center mih="100vh" bg="gray.0" p="md">
      <Stack w={420} maw="100%">
        <Group justify="center" gap="xs">
          <IconStethoscope size={32} color="var(--mantine-color-blue-6)" />
          <Title order={2}>{APP_NAME}</Title>
        </Group>
        <SignInForm
            onSuccess={() => navigate(params.get('next') || '/')}
            disableGoogleAuth
          >
            <Title order={4} ta="center" mb="xs">
              Clinician sign in
            </Title>
          </SignInForm>
        <Text size="xs" c="dimmed" ta="center">
          Server: {getBaseUrl()} ·{' '}
          <Anchor size="xs" onClick={() => setShowServer((v) => !v)}>
            change
          </Anchor>
        </Text>
        <Collapse in={showServer}>
          <Group align="flex-end">
            <TextInput
              style={{ flex: 1 }}
              label="Medplum server URL"
              value={server}
              onChange={(e) => setServer(e.currentTarget.value)}
            />
            <Button
              variant="light"
              onClick={() => {
                setBaseUrl(server);
                window.location.reload();
              }}
            >
              Save
            </Button>
          </Group>
        </Collapse>
      </Stack>
    </Center>
  );
}
