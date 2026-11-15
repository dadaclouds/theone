/**
 * Mock FOCOS Connect service for demos and integration tests.
 *
 * Mimics the slice of the FOCOS Connect API that the case-management layer integrates with:
 *   - authorizations pushed down from case management (Division-approved services)
 *   - EVV-verified visits pulled back up (with goal data collected during the visit)
 * It also serves a phone-style EVV simulator at http://localhost:4100/ so a presenter can
 * "perform" a visit live. Replace this with the real FOCOS API in production.
 *
 *   node focos-mock/server.mjs            (PORT=4100, FOCOS_API_KEY=demo-focos-key)
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT ?? 4100);
const API_KEY = process.env.FOCOS_API_KEY ?? 'demo-focos-key';
const DATA_FILE = new URL('./data.json', import.meta.url);
const UNIT_MINUTES = 15;

const db = existsSync(DATA_FILE) ? JSON.parse(readFileSync(DATA_FILE, 'utf8')) : { authorizations: [], visits: [] };
const save = () => writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));

function usedUnits(authId) {
  return db.visits.filter((v) => v.authorizationId === authId && v.status === 'Completed').reduce((s, v) => s + v.units, 0);
}
function withBalance(a) {
  const used = usedUnits(a.id);
  return { ...a, usedUnits: used, availableUnits: a.authorizedUnits - used };
}

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, {
    'Content-Type': type,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}
async function readJson(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}
const required = (obj, fields) => fields.filter((f) => obj[f] === undefined || obj[f] === null || obj[f] === '');

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (req.method === 'OPTIONS') return send(res, 204, {});
    if (req.method === 'GET' && url.pathname === '/') {
      // The simulator stands in for the FOCOS EVV app, which holds its own credentials.
      const html = readFileSync(new URL('./evv.html', import.meta.url), 'utf8').replace('__FOCOS_API_KEY__', API_KEY);
      return send(res, 200, html, 'text/html; charset=utf-8');
    }
    if (url.pathname === '/api/health') return send(res, 200, { ok: true, service: 'focos-mock' });

    if (url.pathname.startsWith('/api/') && req.headers['x-api-key'] !== API_KEY) {
      return send(res, 401, { error: 'Invalid or missing X-API-Key' });
    }

    // ---- Authorizations ----
    if (req.method === 'POST' && url.pathname === '/api/authorizations') {
      const b = await readJson(req);
      const missing = [...required(b, ['externalRef', 'serviceCode', 'authorizedUnits', 'startDate', 'endDate', 'authorizationNumber']),
        ...required(b.participant ?? {}, ['medicaidId', 'firstName', 'lastName']).map((f) => `participant.${f}`)];
      if (missing.length) return send(res, 400, { error: `Missing fields: ${missing.join(', ')}` });
      const existing = db.authorizations.find((a) => a.externalRef === b.externalRef);
      const auth = {
        ...(existing ?? { id: `AUTH-${randomUUID().slice(0, 8).toUpperCase()}`, createdAt: new Date().toISOString() }),
        externalRef: b.externalRef,
        authorizationNumber: b.authorizationNumber,
        participant: b.participant,
        serviceCode: b.serviceCode,
        serviceDescription: b.serviceDescription ?? b.serviceCode,
        unitMinutes: UNIT_MINUTES,
        authorizedUnits: Number(b.authorizedUnits),
        startDate: b.startDate,
        endDate: b.endDate,
        provider: b.provider ?? { name: 'Unassigned provider' },
        goals: b.goals ?? [],
        status: b.status ?? 'Active',
        updatedAt: new Date().toISOString(),
      };
      if (existing) Object.assign(existing, auth); else db.authorizations.push(auth);
      save();
      return send(res, existing ? 200 : 201, withBalance(auth));
    }
    if (req.method === 'GET' && url.pathname === '/api/authorizations') {
      const mid = url.searchParams.get('medicaidId');
      return send(res, 200, db.authorizations.filter((a) => !mid || a.participant.medicaidId === mid).map(withBalance));
    }

    // ---- EVV visits ----
    if (req.method === 'POST' && url.pathname === '/api/visits') {
      const b = await readJson(req);
      const missing = required(b, ['authorizationId', 'actualStart', 'actualEnd', 'renderingProvider']);
      if (missing.length) return send(res, 400, { error: `Missing fields: ${missing.join(', ')}` });
      const auth = db.authorizations.find((a) => a.id === b.authorizationId);
      if (!auth) return send(res, 404, { error: 'Authorization not found' });
      const minutes = Math.max(0, Math.round((new Date(b.actualEnd) - new Date(b.actualStart)) / 60000));
      const units = Math.floor(minutes / UNIT_MINUTES);
      const visit = {
        id: `VISIT-${randomUUID().slice(0, 8).toUpperCase()}`,
        authorizationId: auth.id,
        authorizationNumber: auth.authorizationNumber,
        externalRef: auth.externalRef,
        medicaidId: auth.participant.medicaidId,
        serviceCode: auth.serviceCode,
        renderingProvider: b.renderingProvider,
        actualStart: b.actualStart,
        actualEnd: b.actualEnd,
        minutes,
        units,
        verificationMethod: b.gps ? 'EVV GPS' : 'Manual',
        gps: b.gps ?? null,
        participantSignature: !!b.participantSignature,
        notes: b.notes ?? '',
        goalData: (b.goalData ?? []).filter((g) => g.goalId && g.value !== '' && g.value !== undefined),
        status: 'Completed',
        recordedAt: new Date().toISOString(),
      };
      db.visits.push(visit);
      save();
      return send(res, 201, { ...visit, authorization: withBalance(auth) });
    }
    if (req.method === 'GET' && url.pathname === '/api/visits') {
      const since = url.searchParams.get('since');
      const mid = url.searchParams.get('medicaidId');
      return send(res, 200, db.visits.filter((v) => (!since || v.recordedAt > since) && (!mid || v.medicaidId === mid)));
    }
    send(res, 404, { error: 'Not found' });
  } catch (err) {
    send(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => console.log(`Mock FOCOS Connect on http://localhost:${PORT} (EVV simulator at /)`));
