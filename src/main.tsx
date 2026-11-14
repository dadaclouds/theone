import { MantineProvider, createTheme } from '@mantine/core';
import '@mantine/core/styles.css';
import { Notifications } from '@mantine/notifications';
import '@mantine/notifications/styles.css';
import '@mantine/spotlight/styles.css';
import { MedplumClient } from '@medplum/core';
import { MedplumProvider } from '@medplum/react';
import '@medplum/react/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider, createBrowserRouter } from 'react-router';
import { App } from './App';
import './index.css';
import { getBaseUrl } from './lib/server';

import { APP_NAME } from './lib/branding';

document.title = APP_NAME;

const medplum = new MedplumClient({
  baseUrl: getBaseUrl(),
  clientId: import.meta.env.MEDPLUM_CLIENT_ID || undefined,
  cacheTime: 30000,
  autoBatchTime: 50,
  onUnauthenticated: () => {
    if (window.location.pathname !== '/signin') {
      window.location.href = '/signin';
    }
  },
});

const theme = createTheme({
  primaryColor: 'blue',
  defaultRadius: 'md',
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  headings: { fontWeight: '600' },
});

const router = createBrowserRouter([{ path: '*', element: <App /> }]);

createRoot(document.getElementById('root') as HTMLDivElement).render(
  <StrictMode>
    <MedplumProvider medplum={medplum} navigate={(path) => router.navigate(path)}>
      <MantineProvider theme={theme}>
        <Notifications position="bottom-right" />
        <RouterProvider router={router} />
      </MantineProvider>
    </MedplumProvider>
  </StrictMode>
);
