// Client for the FOCOS Connect API (the slice the case-management layer integrates with).
// In the demo it talks to focos-mock/server.mjs. In production this runs server-side (a Medplum
// Bot or integration service) so the API credential never reaches a browser.

export interface FocosGoal {
  id: string;
  description: string;
  measure: string;
  unit?: string;
}

export interface FocosAuthorizationInput {
  externalRef: string;
  authorizationNumber: string;
  participant: { medicaidId: string; firstName: string; lastName: string };
  serviceCode: string;
  serviceDescription: string;
  authorizedUnits: number;
  startDate: string;
  endDate: string;
  provider?: { name: string };
  goals: FocosGoal[];
  status?: 'Active' | 'Inactive';
}

export interface FocosAuthorization extends FocosAuthorizationInput {
  id: string;
  unitMinutes: number;
  usedUnits: number;
  availableUnits: number;
}

export interface FocosVisit {
  id: string;
  authorizationId: string;
  authorizationNumber: string;
  externalRef: string;
  medicaidId: string;
  serviceCode: string;
  renderingProvider: string;
  actualStart: string;
  actualEnd: string;
  minutes: number;
  units: number;
  verificationMethod: string;
  gps: { lat: number; lng: number; accuracyMeters?: number } | null;
  participantSignature: boolean;
  notes: string;
  goalData: { goalId: string; value: number }[];
  status: string;
  recordedAt: string;
}

export interface FocosConfig {
  baseUrl: string;
  apiKey: string;
}

export class FocosClient {
  constructor(private readonly config: FocosConfig) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.config.baseUrl.replace(/\/$/, '')}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', 'X-API-Key': this.config.apiKey, ...(init.headers ?? {}) },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`FOCOS ${res.status}: ${(body as { error?: string }).error ?? res.statusText}`);
    }
    return body as T;
  }

  upsertAuthorization(input: FocosAuthorizationInput): Promise<FocosAuthorization> {
    return this.request('/api/authorizations', { method: 'POST', body: JSON.stringify(input) });
  }

  listAuthorizations(medicaidId?: string): Promise<FocosAuthorization[]> {
    return this.request(`/api/authorizations${medicaidId ? `?medicaidId=${encodeURIComponent(medicaidId)}` : ''}`);
  }

  listVisits(params: { medicaidId?: string; since?: string } = {}): Promise<FocosVisit[]> {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
    return this.request(`/api/visits${q.size ? `?${q}` : ''}`);
  }
}
