const STORAGE_KEY = 'ehr_base_url';

/** Base URL of the Medplum server. Can be overridden at sign-in (stored per browser). */
export function getBaseUrl(): string {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    // storage unavailable
  }
  return stored || import.meta.env.MEDPLUM_BASE_URL || 'https://api.medplum.com/';
}

export function setBaseUrl(url: string): void {
  const normalized = url.trim().replace(/\/?$/, '/');
  try {
    localStorage.setItem(STORAGE_KEY, normalized);
  } catch {
    // storage unavailable
  }
}
