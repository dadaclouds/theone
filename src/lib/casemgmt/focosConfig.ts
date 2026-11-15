import { FocosClient } from './focos';

/**
 * DEMO ONLY: the FOCOS API key is exposed to the browser via Vite env vars so the demo can run
 * without a backend. In production, calls to FOCOS run server-side (Medplum Bot or integration
 * service) and the key lives in a secrets store.
 */
export function getFocosClient(): FocosClient | undefined {
  const baseUrl = import.meta.env.MEDPLUM_FOCOS_API_URL?.trim();
  const apiKey = import.meta.env.MEDPLUM_FOCOS_API_KEY?.trim();
  return baseUrl && apiKey ? new FocosClient({ baseUrl, apiKey }) : undefined;
}

export function getFocosEvvUrl(): string | undefined {
  return import.meta.env.MEDPLUM_FOCOS_API_URL?.trim() || undefined;
}
