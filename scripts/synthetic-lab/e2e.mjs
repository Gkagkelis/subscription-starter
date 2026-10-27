/*
 * End-to-end έλεγχος του Synthetic Research Lab σε πραγματικό browser.
 *   BASE_URL=http://localhost:3000 SHOTS=./e2e-shots node scripts/synthetic-lab/e2e.mjs
 * Απαιτεί Playwright (npm i -D playwright && npx playwright install chromium).
 * Εκτελεί ΜΟΝΟ demo mode — καμία κλήση AI, κανένα κόστος.
 */
import { mkdirSync } from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const SHOTS = process.env.SHOTS || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const results = [];
async function check(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - t0 });
    console.log(`✓ ${name}`);
  } catch (e) {
    results.push({ name, ok: false, error: String(e?.message || e).split('\n')[0] });
    console.log(`✗ ${name}: ${String(e?.message || e).split('\n')[0]}`);
  }
}
const shot = async (page, name) => SHOTS && page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(String(e)));

await check('Αρχική: έξι λειτουργίες και κατάσταση πληθυσμού 2025', async () => {
  await page.goto(`${BASE}/synthetic-lab`);
  for (const t of ['Νέα Έρευνα', 'Focus Group', 'Σύγκριση Σεναρίων', 'Πληθυσμός & Κοινά', 'Τα Δεδομένα μου', 'Έλεγχος Αξιοπιστίας']) {
    await page.getByRole('heading', { name: t }).waitFor();
  }
  await page.getByText(/Βαθμονομημένο σε επίσημα στοιχεία 2025/).first().waitFor();
  await shot(page, '01-home');
});

let studyUrl = '';
await check('Wizard: από φυσική γλώσσα σε εκτελεσμένη έρευνα', async () => {
  await page.goto(`${BASE}/synthetic-lab/new`);
  await page.getByLabel('Περιγράψτε με απλά λόγια τι θέλετε να ερευνήσετε').fill('Θέλω να δοκιμάσω ένα νέο πρόγραμμα κινητής τηλεφωνίας που κοστίζει 25€ τον μήνα');
  await shot(page, '02-wizard-step1');
  await page.getByRole('button', { name: /Πρότεινε σχέδιο/ }).click();
  await page.getByText('Συνθετικός πληθυσμός').waitFor();
  await page.getByRole('button', { name: 'Γυναίκες' }).click();
  await shot(page, '03-wizard-audience');
  await page.getByRole('button', { name: 'Επόμενο →' }).click();
  await page.getByRole('heading', { name: 'Ερωτηματολόγιο' }).waitFor();
  await page.getByRole('button', { name: '+ Ερώτηση', exact: true }).click();
  // Τράπεζα ερωτήσεων με εμπειρική βάση (ανοιχτά δεδομένα Eurostat· διαθέσιμα πάντα)
  await page.getByRole('button', { name: '+ Ερώτηση με εμπειρική βάση' }).click();
  await page.getByLabel('Αναζήτηση ερωτήσεων').fill('streaming ταινίες');
  await page.getByText('Ανοιχτά δεδομένα').first().waitFor();
  await shot(page, '04a-question-bank');
  await page.getByRole('button', { name: 'Προσθήκη' }).first().click();
  await page.getByText(/Συνδεδεμένη με δείκτη «ict_/).first().waitFor();
  await shot(page, '04-wizard-questionnaire');
  await page.getByRole('button', { name: 'Επόμενο →' }).click();
  await page.getByRole('heading', { name: 'Ερευνητικές παραδοχές' }).waitFor();
  await shot(page, '05-wizard-assumptions');
  await page.getByRole('button', { name: /Συνέχεια στην εκτέλεση/ }).click();
  await page.getByText('Κατανοώ ότι τα αποτελέσματα είναι συνθετική προσομοίωση').click();
  await page.getByRole('button', { name: 'Εκτέλεση έρευνας' }).click();
  await page.waitForURL(/\/synthetic-lab\/studies\/study-/, { timeout: 60000 });
  studyUrl = page.url();
  await page.getByText('Simulated response — not human survey data').first().waitFor();
  await page.getByRole('heading', { name: 'Αποτελέσματα ανά ερώτηση' }).waitFor();
  await page.getByText('Η συγκεκριμένη προσομοίωση δεν έχει ακόμη επικυρωθεί απέναντι σε ανεξάρτητη πραγματική έρευνα').first().waitFor();
  await shot(page, '06-study-results');
});

await check('Εξαγωγή αναφοράς: CSV, JSON, Markdown, Word', async () => {
  for (const [label, ext] of [
    ['CSV απαντήσεων', '.csv'],
    ['JSON', '.json'],
    ['Markdown', '.md'],
    ['Word', '.doc']
  ]) {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: label, exact: true }).click()]);
    if (!dl.suggestedFilename().endsWith(ext)) throw new Error(`λάθος αρχείο ${dl.suggestedFilename()}`);
  }
  const pdf = await page.pdf({ format: 'A4' });
  if (pdf.length < 10000) throw new Error('PDF πολύ μικρό');
});

await check('Πολιτικό αίτημα μπλοκάρεται', async () => {
  await page.goto(`${BASE}/synthetic-lab/new`);
  await page.getByLabel('Περιγράψτε με απλά λόγια τι θέλετε να ερευνήσετε').fill('Πώς να πείσουμε τους αναποφάσιστους ψηφοφόρους στις εκλογές');
  await page.getByRole('button', { name: /Πρότεινε σχέδιο/ }).click();
  await page.getByText(/δεν υποστηρίζει σχεδιασμό εκλογικής πειθούς/).waitFor();
  await shot(page, '07-blocked');
});

await check('Focus group: έναρξη, παύση, συνέχεια, ολοκλήρωση, σύνθεση', async () => {
  await page.goto(`${BASE}/synthetic-lab/focus-group`);
  await page.getByLabel('Ερευνητικό θέμα').fill('Συνδρομητική υπηρεσία φρέσκων λαχανικών 15€/εβδομάδα');
  await page.getByRole('button', { name: 'Δημιουργία focus group' }).click();
  await page.waitForURL(/\/synthetic-lab\/focus-group\/fg-/);
  await page.getByRole('button', { name: /Έναρξη συζήτησης/ }).click();
  await page.waitForTimeout(1600);
  await page.getByRole('button', { name: /Παύση/ }).click();
  await page.getByText('Σε παύση').first().waitFor();
  await shot(page, '08-focus-paused');
  await page.getByRole('button', { name: /Συνέχεια/ }).click();
  await page.getByText('Ολοκληρώθηκε').first().waitFor({ timeout: 60000 });
  await page.getByRole('heading', { name: 'Σύνθεση' }).waitFor();
  await shot(page, '09-focus-done');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Transcript (Markdown)' }).click()]);
  if (!dl.suggestedFilename().endsWith('.md')) throw new Error('transcript');
});

await check('Σύγκριση σεναρίων Α/Β/Γ με ευαισθησία', async () => {
  await page.goto(`${BASE}/synthetic-lab/scenarios`);
  await page.getByRole('button', { name: 'Σύγκριση σεναρίων' }).click();
  await page.waitForURL(/\/synthetic-lab\/scenarios\/scn-/, { timeout: 60000 });
  await page.getByText('Προσομοιωμένη προτίμηση — όχι μερίδιο αγοράς, όχι πρόβλεψη πωλήσεων.').waitFor();
  await page.getByRole('heading', { name: 'Ευαισθησία στις παραδοχές' }).waitFor();
  await shot(page, '10-scenarios');
});

await check('Πληθυσμός: έτος βάσης, ακεραιότητα, προφίλ με προέλευση', async () => {
  await page.goto(`${BASE}/synthetic-lab/population`);
  await page.getByText('13/13 περιφέρειες').waitFor();
  await page.getByText(/synthpop_GRCr1\d\d\.dat\.gz/).first().waitFor();
  await shot(page, '11-population');
});

await check('Δεδομένα: registry με άδειες και εξαιρέσεις', async () => {
  await page.goto(`${BASE}/synthetic-lab/data`);
  await page.getByText('CC BY 4.0 (δεδομένα)', { exact: false }).first().waitFor();
  await page.getByText('Σκόπιμα εκτός χρήσης').first().waitFor();
  await page.getByText('Απαιτεί εγγραφή').first().waitFor();
  await page.getByText('Πληθυσμός 1/1/2025 ανά περιφέρεια, ηλικία, φύλο').first().waitFor();
  await shot(page, '12-data');
});

await check('Έλεγχος αξιοπιστίας: held-out backtest', async () => {
  await page.goto(`${BASE}/synthetic-lab/validation`);
  await page.getByRole('button', { name: /Εκτέλεση ελέγχου αξιοπιστίας|Επανεκτέλεση ελέγχου/ }).click();
  await page.getByText('Μέσο MAE μοντέλου').waitFor({ timeout: 120000 });
  await page.getByRole('button', { name: 'Λεπτομέρειες' }).first().click();
  await shot(page, '13-validation');
});

await check('Responsive (κινητό)', async () => {
  const m = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await m.goto(studyUrl || `${BASE}/synthetic-lab`);
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await m.screenshot({ path: SHOTS ? path.join(SHOTS, '14-mobile.png') : undefined, fullPage: false });
  if (overflow > 2) throw new Error(`οριζόντια κύλιση ${overflow}px`);
  await m.close();
});

await check('Χωρίς σφάλματα JavaScript στη σελίδα', async () => {
  if (consoleErrors.length) throw new Error(consoleErrors.slice(0, 3).join(' | '));
});

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} E2E έλεγχοι πέρασαν.`);
process.exit(failed.length ? 1 : 0);
