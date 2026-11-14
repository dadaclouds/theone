import { notifications } from '@mantine/notifications';
import { errorMessage } from '../lib/fhir';

export function notifySuccess(message: string): void {
  notifications.show({ color: 'green', message });
}

export function notifyError(err: unknown): void {
  console.error(err);
  notifications.show({ color: 'red', title: 'Something went wrong', message: errorMessage(err) });
}
