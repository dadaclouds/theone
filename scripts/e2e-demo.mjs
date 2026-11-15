// End-to-end check of the FOCOS case-management demo story.
// Needs: app (npm run dev), Medplum, mock FOCOS (npm run focos-mock), seed + seed:demo.
//   DEMO_EMAIL=... node scripts/e2e-demo.mjs
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');

const APP = process.env.APP_URL ?? 'http://localhost:3000';
const FOCOS = process.env.FOCOS_URL ?? 'http://localhost:4100';
const EMAIL = process.env.DEMO_EMAIL ?? 'dr.chen@example.com';
const PASSWORD = process.env.DEMO_PASSWORD ?? 'Riverside-demo-2026!';
const OUT = process.env.SHOT_DIR ?? 'test-results/demo';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
page.on('response', (r) => r.status() >= 400 && errors.push(`HTTP ${r.status()} ${r.request().method()} ${r.url()}`));

const results = [];
let step = 0;
let stop = false;
async function check(name, fn) {
  if (stop) { results.push(`SKIP ${name}`); return; }
  step++;
  const before = errors.length;
  try { await fn(); results.push(`PASS ${name}`); } catch (err) { results.push(`FAIL ${name}: ${err.message.split('\n')[0]}`); stop = true; }
  await page.screenshot({ path: `${OUT}/${String(step).padStart(2, '0')}-${name.replace(/\W+/g, '-').toLowerCase()}.png`, fullPage: true });
  if (errors.length > before) results.push(...errors.slice(before).map((e) => `   ! ${e}`));
}
const see = (l, timeout = 10000) => l.first().waitFor({ state: 'visible', timeout });
const modal = () => page.locator('.mantine-Modal-content');
const tab = (name) => page.getByRole('tab', { name });

const mid = `SD9${String(Date.now()).slice(-6)}`;
const family = `Demo${mid.slice(-4)}`;
const goalText = 'Make a grocery list independently';

await check('sign in', async () => {
  await page.goto(`${APP}/signin`);
  await page.locator('input[name="email"]').fill(EMAIL);
  await page.getByRole('button', { name: /next|continue|sign in/i }).first().click();
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await see(page.getByText("Today's schedule"), 20000);
});

await check('seeded participant shows plan, visits and cap alert', async () => {
  await page.getByLabel('Search participants').fill('SD4471023');
  await page.getByRole('option', { name: /Alex Rivera/ }).click();
  await tab('Services & visits').click();
  await see(page.getByTestId('cap-alert'));
  await see(page.getByTestId('visits-card').getByText('Jordan Lee'));
  await tab('Support plan').click();
  await see(page.getByText('Prepare a simple meal independently'));
});

await check('register participant with Medicaid ID', async () => {
  await page.goto(`${APP}/patients/new`);
  await page.getByLabel('First name').fill('Riley');
  await page.getByLabel('Last name').fill(family);
  await page.getByLabel('Date of birth').fill('2001-03-09');
  await page.getByRole('textbox', { name: 'Sex' }).click();
  await page.getByRole('option', { name: 'Female' }).click();
  await page.getByLabel('Medicaid ID').fill(mid);
  await page.getByRole('button', { name: 'Register participant' }).click();
  await see(page.getByTestId('patient-banner').getByText(`Medicaid ${mid}`));
});

await check('screening scores level of care', async () => {
  await tab('Eligibility').click();
  await page.getByRole('button', { name: 'New screening' }).click();
  const m = modal();
  await see(m.getByText('Self-care (bathing, dressing, eating)'));
  // Answer each domain: pick the n-th option group in order.
  // 2 + 1 + 1 + 2 + 1 + 2 = 9 -> Tier 2
  const answers = ['Needs regular hands-on help', 'Needs prompting or occasional help', 'Needs prompting or occasional help', 'Needs regular hands-on help', 'Needs prompting or occasional help', 'Needs regular hands-on help'];
  const groups = m.getByRole('radiogroup');
  const count = await groups.count();
  if (count !== answers.length) throw new Error(`expected ${answers.length} rated domains, found ${count}`);
  for (let i = 0; i < answers.length; i++) await groups.nth(i).getByLabel(answers[i], { exact: true }).check({ force: true });
  await m.getByLabel(/Qualifying developmental disability diagnosis documented/).check({ force: true });
  await m.getByRole('button', { name: 'Submit screening' }).click();
  await see(page.getByTestId('loc-card').getByText('Tier 2 - Moderate support'));
  await see(page.getByTestId('loc-card').getByText('9 / 18'));
});

await check('eligibility determination enrolls in waiver', async () => {
  await page.getByRole('button', { name: 'Determine eligibility' }).click();
  await modal().getByRole('button', { name: 'Save determination' }).click();
  await see(page.getByTestId('enrollment-card').getByText('CHOICES Waiver'));
});

await check('create ISP with goal and service', async () => {
  await tab('Support plan').click();
  await page.getByRole('button', { name: 'Create ISP' }).click();
  await modal().getByLabel('What is important to the person').fill('Riley wants to live on her own and do her own shopping.');
  await modal().getByRole('button', { name: 'Create plan' }).click();
  await see(page.getByTestId('isp-card'));
  await page.getByRole('button', { name: 'Add goal' }).click();
  await modal().getByLabel('Goal').fill(goalText);
  await modal().getByRole('button', { name: 'Add goal' }).click();
  await see(page.getByTestId('goals-card').getByText(goalText));
  await page.getByRole('button', { name: 'Add service' }).click();
  await modal().getByLabel('Provider agency').fill('Prairie Community Supports');
  await modal().getByRole('button', { name: 'Add service' }).click();
  await see(page.getByTestId('service-row').getByText('Planned'));
});

await check('request authorization routes to Division', async () => {
  await page.getByRole('button', { name: 'Request authorization' }).click();
  await see(page.getByTestId('service-row').getByText('Pending Division approval'));
});

await check('Division approves and authorization is created in FOCOS', async () => {
  await page.getByRole('link', { name: 'Approvals' }).or(page.getByText('Approvals', { exact: true })).first().click();
  const row = page.getByTestId('approval-row').filter({ hasText: family });
  await row.getByRole('button', { name: 'Approve' }).click();
  await modal().getByRole('button', { name: 'Approve and send to FOCOS' }).click();
  await see(page.getByText(/Approved SD-\d{4}-\d{5} and sent to FOCOS/));
  await see(page.getByText('No authorizations waiting for review'));
  const approvalsNav = page.locator('.mantine-NavLink-root', { hasText: 'Approvals' });
  for (let i = 0; i < 20 && (await approvalsNav.locator('.mantine-Badge-root').count()) > 0; i++) await page.waitForTimeout(250);
  if ((await approvalsNav.locator('.mantine-Badge-root').count()) > 0) throw new Error('Approvals badge did not clear after approval');
  const auths = await (await fetch(`${FOCOS}/api/authorizations?medicaidId=${mid}`, { headers: { 'X-API-Key': 'demo-focos-key' } })).json();
  if (auths.length !== 1 || auths[0].goals[0]?.description !== goalText) throw new Error('authorization not found in FOCOS with its goal');
});

await check('direct support staff completes the visit in FOCOS EVV', async () => {
  const evv = await browser.newPage({ viewport: { width: 420, height: 900 } });
  await evv.goto(FOCOS);
  const option = evv.locator('#auth option').filter({ hasText: family });
  await option.first().waitFor({ state: 'attached', timeout: 10000 });
  await evv.locator('#auth').selectOption(await option.first().getAttribute('value'));
  await evv.getByRole('button', { name: 'Start visit' }).click();
  await evv.getByLabel(goalText).fill('45');
  await evv.locator('#minutes').fill('90');
  await evv.locator('#notes').fill('Wrote a list of 6 items with one prompt.');
  await evv.getByRole('button', { name: /Stop visit/ }).click();
  await evv.getByText('Visit verified and submitted').waitFor({ timeout: 10000 });
  await evv.screenshot({ path: `${OUT}/evv-simulator.png` });
  await evv.close();
});

await check('visit flows back: units used and goal progress', async () => {
  await page.getByLabel('Search participants').fill(mid);
  await page.getByRole('option', { name: new RegExp(family) }).click();
  await tab('Services & visits').click();
  await see(page.getByTestId('visits-card').getByText('Wrote a list of 6 items with one prompt.'), 15000);
  await see(page.getByTestId('auth-balances').getByText('6 / 480 units used'));
  await tab('Support plan').click();
  await see(page.getByTestId('goals-card').getByText('Latest 45%'));
});

await browser.close();
console.log(results.join('\n'));
const failed = results.filter((r) => r.startsWith('FAIL')).length;
console.log(`\n${results.filter((r) => r.startsWith('PASS')).length} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
