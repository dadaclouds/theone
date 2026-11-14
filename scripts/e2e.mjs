// End-to-end walkthrough of the main clinical workflows against a running app + Medplum server.
//   APP_URL=http://localhost:3000 node scripts/e2e.mjs
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { mkdirSync } from 'node:fs';

const APP = process.env.APP_URL ?? 'http://localhost:3000';
const EMAIL = process.env.DEMO_EMAIL ?? 'dr.chen@example.com';
const PASSWORD = process.env.DEMO_PASSWORD ?? 'Riverside-demo-2026!';
const OUT = process.env.SHOT_DIR ?? 'test-results';
const ONLY = process.env.ONLY;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
page.on('response', (r) => r.status() >= 400 && r.url().includes('/fhir/') && errors.push(`HTTP ${r.status()} ${r.request().method()} ${r.url()}`));

let step = 0;
const results = [];
async function check(name, fn) {
  if (ONLY && !name.toLowerCase().includes(ONLY.toLowerCase())) return;
  step++;
  const before = errors.length;
  try {
    await fn();
    results.push(`PASS ${name}`);
  } catch (err) {
    results.push(`FAIL ${name}: ${err.message.split('\n')[0]}`);
  }
  await page.screenshot({ path: `${OUT}/${String(step).padStart(2, '0')}-${name.replace(/\W+/g, '-').toLowerCase()}.png`, fullPage: false });
  if (errors.length > before) results.push(...errors.slice(before).map((e) => `   ! ${e}`));
}
const expectVisible = (locator, timeout = 10000) => locator.first().waitFor({ state: 'visible', timeout });
const toast = (text) => expectVisible(page.getByText(text));
const modal = () => page.locator('.mantine-Modal-content');

await check('sign in', async () => {
  await page.goto(`${APP}/`);
  await page.getByLabel('Email', { exact: false }).fill(EMAIL);
  await page.getByRole('button', { name: /next|continue|sign in/i }).first().click();
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expectVisible(page.getByText("Today's schedule"), 20000);
});

await check('dashboard', async () => {
  await expectVisible(page.getByText('Robert Hernandez'));
  await expectVisible(page.getByText('Results to review'));
});

await check('patient list + search', async () => {
  await page.getByRole('link', { name: 'Patients' }).or(page.getByText('Patients', { exact: true })).first().click();
  await expectVisible(page.getByText('Margaret O\'Brien'));
  await page.getByLabel('Filter patients').fill('Hernandez');
  await expectVisible(page.getByRole('cell', { name: 'Robert Hernandez' }));
  await page.getByRole('cell', { name: 'Robert Hernandez' }).click();
  await expectVisible(page.getByTestId('patient-banner').getByText('Penicillin'));
});

await check('chart summary', async () => {
  await expectVisible(page.getByTestId('summary-problems').getByText('Essential (primary) hypertension'));
  await expectVisible(page.getByTestId('summary-meds').getByText(/metformin/));
  await expectVisible(page.getByText('Latest vitals'));
});

await check('allergy alert blocks prescribing', async () => {
  await page.getByRole('tab', { name: 'Medications' }).click();
  await page.getByRole('button', { name: 'Prescribe' }).click();
  await modal().getByLabel('Medication').fill('amoxicillin 500');
  await page.getByRole('option', { name: /amoxicillin 500 MG Oral Capsule/ }).click();
  await expectVisible(page.getByTestId('allergy-alert'));
  const disabled = await modal().getByRole('button', { name: 'Prescribe' }).isDisabled();
  if (!disabled) throw new Error('Prescribe should be disabled until override');
  await page.keyboard.press('Escape');
});

await check('vitals trends', async () => {
  await page.getByRole('tab', { name: 'Vitals' }).click();
  await expectVisible(page.getByText('Flowsheet'));
  await expectVisible(page.locator('.recharts-line').first());
});

await check('labs tab', async () => {
  await page.getByRole('tab', { name: 'Labs' }).click();
  await expectVisible(page.getByText('Lipid panel'));
});

const unique = Date.now().toString().slice(-5);
const lastName = `Testpatient${unique}`;
await check('register patient', async () => {
  await page.goto(`${APP}/patients/new`);
  await page.getByLabel('First name').fill('Jane');
  await page.getByLabel('Last name').fill(lastName);
  await page.getByLabel('Date of birth').fill('1988-02-14');
  await page.getByRole('textbox', { name: 'Sex' }).click();
  await page.getByRole('option', { name: 'Female' }).click();
  await page.getByLabel('Phone').first().fill('(503) 555-0100');
  await page.getByLabel('Payer').fill('Aetna');
  await page.getByLabel('Member ID').fill('AET-TEST-1');
  await page.getByRole('button', { name: 'Register patient' }).click();
  await expectVisible(page.getByTestId('patient-banner').getByText(`Jane ${lastName}`));
  await expectVisible(page.getByText('Allergies not reviewed'));
});

await check('record NKA', async () => {
  await page.getByRole('tab', { name: 'Allergies' }).click();
  await page.getByRole('button', { name: 'No known allergies' }).click();
  await expectVisible(page.getByTestId('patient-banner').getByText('No known allergies'));
});

await check('visit: note autosave', async () => {
  await page.getByRole('button', { name: 'Start visit' }).click();
  await expectVisible(page.getByText('Visit note'));
  await page.getByRole('button', { name: 'Insert template' }).click();
  await page.getByRole('menuitem', { name: 'Acute visit' }).click();
  await page.getByLabel('Subjective').fill('CC: Sore throat x 3 days.\nHPI: Fever to 101, no cough.');
  await page.getByLabel('Assessment').fill('Acute pharyngitis.');
  await expectVisible(page.getByTestId('save-status').getByText(/Draft saved/), 15000);
});

await check('visit: vitals', async () => {
  await page.getByTestId('encounter-diagnoses').locator('..').locator('..');
  await page.getByRole('button', { name: 'Record' }).click();
  const m = modal();
  await m.getByLabel('Systolic BP').fill('124');
  await m.getByLabel('Diastolic BP').fill('80');
  await m.getByLabel('Heart rate').fill('92');
  await m.getByLabel('Temperature').fill('100.9');
  await m.getByLabel('Weight').fill('150');
  await m.getByLabel('Height').fill('66');
  await expectVisible(m.getByText('BMI 24.2'));
  await m.getByRole('button', { name: 'Save vitals' }).click();
  await expectVisible(page.getByText(/BP 124\/80/));
});

await check('visit: diagnosis', async () => {
  await page.getByTestId('encounter-diagnoses').getByRole('button', { name: 'Add' }).click();
  await modal().getByLabel('Diagnosis').fill('pharyngitis');
  await page.getByRole('option', { name: /Acute pharyngitis/ }).click();
  await modal().getByRole('button', { name: 'Save' }).click();
  await expectVisible(page.getByTestId('encounter-diagnoses').getByText('J02.9', { exact: true }));
  if (await page.getByTestId('encounter-diagnoses').getByText('uncoded').count()) throw new Error('Diagnosis saved without ICD-10 code');
});

await check('visit: prescribe', async () => {
  await page.getByRole('button', { name: 'Rx' }).click();
  await modal().getByLabel('Medication').fill('amoxicillin 500');
  await page.getByRole('option', { name: /amoxicillin 500 MG Oral Capsule/ }).click();
  await modal().getByLabel('Frequency').click();
  await page.getByRole('option', { name: 'Twice daily' }).click();
  await modal().getByRole('button', { name: 'Prescribe' }).click();
  await expectVisible(page.getByText('1 tablet oral twice daily'));
});

await check('visit: order lab', async () => {
  await page.getByRole('button', { name: 'Lab', exact: true }).click();
  await modal().getByLabel(/CBC panel/).check();
  await modal().getByRole('button', { name: /Place 1 order/ }).click();
  await expectVisible(page.getByText('CBC panel - Blood by Automated count'));
});

await check('visit: coding + sign', async () => {
  await page.getByRole('textbox', { name: 'E/M level' }).click();
  await page.getByRole('option', { name: /99213/ }).click();
  await expectVisible(page.getByText('Estimated charges $105.00'));
  await page.getByRole('button', { name: /Sign & close visit/ }).click();
  await expectVisible(page.getByText(/Signed notes are locked/), 15000);
  await expectVisible(page.getByTestId('encounter-billing').getByText('99213'));
});

await check('result entry -> inbox -> review', async () => {
  await page.getByRole('link', { name: `Jane ${lastName}` }).or(page.getByText(`Jane ${lastName}`)).first().click();
  await page.getByRole('tab', { name: 'Labs' }).click();
  await page.getByRole('button', { name: 'Enter results' }).click();
  const m = modal();
  await m.getByLabel('WBC result').fill('14.2');
  await m.getByLabel('Hemoglobin result').fill('13.1');
  await m.getByRole('button', { name: 'File results' }).click();
  await expectVisible(page.getByText('1 abnormal'));
  await page.goto(`${APP}/inbox`);
  await page.getByText(`Jane ${lastName}`).first().click();
  await expectVisible(page.getByRole('cell', { name: 'WBC' }));
  await page.getByRole('button', { name: 'Mark reviewed' }).click();
  await toast('Marked reviewed');
});

await check('messaging', async () => {
  await page.goto(`${APP}/messages`);
  await expectVisible(page.getByText('Robert Hernandez').first());
  await page.getByText('Robert Hernandez').first().click();
  await page.getByLabel('Message').fill('Your lipid panel came back — let us discuss at your visit.');
  await page.getByRole('button', { name: 'Send' }).click();
  await expectVisible(page.getByText('Your lipid panel came back'));
});

await check('schedule + book appointment', async () => {
  await page.goto(`${APP}/schedule`);
  await expectVisible(page.getByText('Thomas Nguyen'));
  await page.getByRole('button', { name: 'New appointment' }).click();
  await modal().getByLabel('Patient').fill(lastName);
  await page.getByRole('option', { name: new RegExp(lastName) }).click();
  await modal().getByRole('button', { name: 'Book appointment' }).click();
  await toast('Appointment booked');
});

await check('start visit from schedule', async () => {
  const row = page.getByRole('row', { name: /Thomas Nguyen/ });
  await expectVisible(row.getByRole('button', { name: 'Start visit' }));
  if (await row.getByRole('button', { name: 'Check in' }).isVisible()) {
    await row.getByRole('button', { name: 'Check in' }).click();
    await toast('Marked arrived');
  }
  await page.getByRole('row', { name: /Thomas Nguyen/ }).getByRole('button', { name: 'Start visit' }).click();
  await expectVisible(page.getByText('Visit note'));
});

await check('tasks', async () => {
  await page.goto(`${APP}/tasks`);
  await expectVisible(page.getByText('Albuterol inhaler refill request'));
  await page.getByRole('button', { name: 'New task' }).click();
  await modal().getByLabel('Description').fill('Fax records to cardiology');
  await modal().getByRole('button', { name: 'Create task' }).click();
  await expectVisible(page.getByText('Fax records to cardiology'));
});

await check('billing', async () => {
  await page.goto(`${APP}/billing`);
  await expectVisible(page.getByText(`Jane ${lastName}`));
  await expectVisible(page.getByRole('row', { name: new RegExp(lastName) }).getByRole('cell', { name: 'J02.9', exact: true }));
  await page.getByRole('row', { name: new RegExp(lastName) }).getByRole('button', { name: 'Submit' }).click();
  await toast('Claim submitted');
});

await check('admin', async () => {
  await page.goto(`${APP}/admin`);
  await expectVisible(page.getByText('dr.okafor@example.com').or(page.getByText('James Okafor')));
});

await browser.close();
console.log(results.join('\n'));
const failed = results.filter((r) => r.startsWith('FAIL')).length;
console.log(`\n${results.filter((r) => r.startsWith('PASS')).length} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
