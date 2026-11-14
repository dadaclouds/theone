# Medplum EHR

A full outpatient electronic health record (EHR) web app built on the open-source
[Medplum](https://www.medplum.com) FHIR backend. Everything is stored as standard FHIR R4
resources, so the data is portable and interoperable from day one.

## Features

| Area | What clinicians can do |
| --- | --- |
| **Dashboard** | Today's schedule, visits in progress, my open tasks, unsigned notes, results-to-review count |
| **Patients** | Search by name / MRN / DOB, register patients (duplicate check, auto MRN), demographics, emergency contact, insurance |
| **Chart** | Allergy banner, summary, encounters, notes, problems, medications, allergies, vitals (trend charts + flowsheet), labs, immunizations, documents (file upload), appointments, secure messages, billing, full timeline |
| **Visits** | SOAP note with templates and 2-second autosave, vitals with BMI and abnormal flags, ICD-10 diagnoses, e-prescribing with **drug-allergy and duplicate-therapy alerts**, lab orders, immunizations, E/M + procedure coding, follow-up booking, **sign & lock** with electronic signature (Provenance), addenda |
| **Results** | Lab result entry (or interface feed) → automatic review task → results inbox with abnormal-first triage |
| **Scheduling** | Day schedule per provider, booking with conflict detection, check-in / no-show / cancel, start visit from appointment |
| **Tasks** | Care-team work queue (refills, follow-up calls, general), assignment, due dates, overdue flags |
| **Messaging** | Patient message threads |
| **Billing** | Claims (superbills) generated on visit signing, submit / void, CSV export |
| **Admin** | Users, invite clinicians, audit events |

## FHIR data model

| Concept | Resource(s) |
| --- | --- |
| Patient, MRN | `Patient` (`identifier` system `https://medplum-ehr.local/fhir/mrn`) |
| Insurance | `Coverage` + payer `Organization` (self-pay `Coverage` created when needed) |
| Visit | `Encounter` (`in-progress` → `finished`, linked to `Appointment`) |
| Visit note | `DocumentReference` (LOINC 11506-3, Markdown SOAP, `docStatus` preliminary → final), addenda via `relatesTo: appends` |
| Signature | `Provenance` with `signature` |
| Problems / diagnoses | `Condition` (`problem-list-item` / `encounter-diagnosis`, ICD-10-CM + SNOMED) |
| Allergies | `AllergyIntolerance` (incl. SNOMED 716186003 "No known allergy") |
| Prescriptions | `MedicationRequest` (RxNorm) |
| Vitals | `Observation` (US Core vital-signs, LOINC, BP as 85354-9 panel) |
| Lab orders / results | `ServiceRequest` → `DiagnosticReport` + `Observation` (LOINC, reference ranges, interpretation) |
| Immunizations | `Immunization` (CVX) |
| Scheduling | `Appointment` |
| Work queue / inbox | `Task` (`review-result`, `refill-request`, `follow-up`, `general`) |
| Messages | `Communication` |
| Billing | `Claim` (CPT + ICD-10, fee schedule in `src/lib/catalog.ts`) |

Code pickers use a curated starter catalog (`src/lib/catalog.ts`) so the app works on any
Medplum project without loading terminologies; anything not in the catalog is saved as free
text and labelled "not coded".

## Getting started

Requirements: Node 22.18+.

```bash
npm install
cp .env.defaults .env      # set MEDPLUM_BASE_URL (default http://localhost:8103/)
npm run dev                # http://localhost:3000
```

The server URL can also be changed on the sign-in screen.

The portal name (header, sign-in page and browser tab) comes from `MEDPLUM_APP_NAME` in `.env`;
restart `npm run dev` or rebuild after changing it.

### Backend options

* **Medplum hosted** – set `MEDPLUM_BASE_URL=https://api.medplum.com/`, create a project at
  app.medplum.com, and sign in.
* **Self-hosted** – run the Medplum server (Docker or source,
  see https://www.medplum.com/docs/self-hosting) with Postgres + Redis. Add this app's
  origin to the server's `allowedOrigins`.

### Demo data

```bash
MEDPLUM_BASE_URL=http://localhost:8103/ npm run seed
```

Creates the project **Riverside Family Medicine**, two clinicians and eight patients with
realistic histories, labs, appointments today, tasks and messages. On a fresh self-hosted
server it uses the default super-admin (`admin@example.com` / `medplum_admin`, override with
`MEDPLUM_ADMIN_EMAIL` / `MEDPLUM_ADMIN_PASSWORD`); otherwise it self-registers.

Sign in as `dr.chen@example.com` / `Riverside-demo-2026!` (or `dr.okafor@example.com`, same password).

## Tests

```bash
npm test                   # unit tests for clinical logic (allergy screening, vitals, notes, labs, billing)
npm run typecheck
npm run e2e                # 22-step browser walkthrough; needs the app + seeded server running and Playwright installed
```

## Before using with real patients

This is a complete, working foundation, not a certified EHR. Before production:

* **Access control** – add Medplum `AccessPolicy` resources per role (physician, nurse, front desk, billing).
* **Compliance** – HIPAA hosting with a BAA, MFA, session timeouts, backup/DR, audit review.
* **Terminology** – load full SNOMED CT / RxNorm / LOINC / ICD-10 into Medplum, or swap `CodeInput` for Medplum's ValueSet-backed `CodingInput`.
* **Clinical decision support** – the allergy screen is name/class matching; integrate a commercial drug-interaction database for production.
* **Integrations** – e-prescribing (Medplum offers DoseSpot/ScriptSure), lab interfaces (e.g. Health Gorilla), clearinghouse for claims (837P), patient portal.
* **Certification** – ONC Health IT certification if you need it for incentive programs.

## Project layout

```
src/
  lib/           FHIR builders & clinical logic (pure, unit tested)
  components/    shell, pickers, clinical forms (prescribe, allergy, labs, vitals, …)
  pages/         dashboard, patients, schedule, inbox, tasks, messages, billing, admin
  pages/patient/ chart and its tabs
  pages/encounter/ visit documentation
scripts/
  seed.ts        demo data
  e2e.mjs        browser walkthrough
```
