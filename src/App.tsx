import { Loader, Center } from '@mantine/core';
import { useMedplum, useMedplumProfile } from '@medplum/react';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { Shell } from './components/Shell';
import { AdminPage } from './pages/AdminPage';
import { BillingPage } from './pages/BillingPage';
import { DashboardPage } from './pages/DashboardPage';
import { EncounterPage } from './pages/encounter/EncounterPage';
import { InboxPage } from './pages/InboxPage';
import { MessagesPage } from './pages/MessagesPage';
import { NewPatientPage } from './pages/NewPatientPage';
import { PatientListPage } from './pages/PatientListPage';
import { ProfilePage } from './pages/ProfilePage';
import { PatientPage } from './pages/patient/PatientPage';
import { SchedulePage } from './pages/SchedulePage';
import { SignInPage } from './pages/SignInPage';
import { TasksPage } from './pages/TasksPage';

export function App() {
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const location = useLocation();

  if (medplum.isLoading()) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }

  if (!profile) {
    return (
      <Routes>
        <Route path="/signin" element={<SignInPage />} />
        <Route path="*" element={<Navigate to={`/signin?next=${encodeURIComponent(location.pathname)}`} replace />} />
      </Routes>
    );
  }

  return (
    <Shell>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/signin" element={<Navigate to="/" replace />} />
        <Route path="/patients" element={<PatientListPage />} />
        <Route path="/patients/new" element={<NewPatientPage />} />
        <Route path="/patients/:patientId/edit" element={<NewPatientPage />} />
        <Route path="/patients/:patientId/encounters/:encounterId" element={<EncounterPage />} />
        <Route path="/patients/:patientId/:tab?" element={<PatientPage />} />
        <Route path="/schedule" element={<SchedulePage />} />
        <Route path="/inbox" element={<InboxPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/billing" element={<BillingPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}
