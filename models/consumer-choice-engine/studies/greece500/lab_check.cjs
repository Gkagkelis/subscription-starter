// Έλεγχος: το dashboard (JS) αναπαράγει ακριβώς τα αποτελέσματα της CCE (Python) για όλα τα σενάρια × υποθέσεις.
//   node lab_check.cjs <deliverables_dir>
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const d = path.resolve(process.argv[2]);
  const choices = {};
  fs.readFileSync(path.join(d, 'INDIVIDUAL_CHOICES.csv'), 'utf8').trim().split(/\r?\n/).slice(1).forEach(l => {
    const [rid, q, s, a, c] = l.split(','); (choices[q + '|' + s + '|' + a] = choices[q + '|' + s + '|' + a] || {})[rid] = c; });
  const b = await chromium.launch(); const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('file://' + path.join(d, 'INTERACTIVE_LAB', 'index.html'));
  const out = await p.evaluate(() => {
    const G = window.G500, res = [];
    for (const q of G.questions) for (const s of q.scenarios) for (const a of Object.keys(G.assumptions)) {
      const r = window.G500API.runScenario(q.question_id, s, a);
      const ref = G.results[q.question_id] && G.results[q.question_id][a] && G.results[q.question_id][a][s];
      res.push({ q: q.question_id, s, a, status: r.status, has_ref: !!ref, sim: r.sim, p: r.p, ref, choices: r.choices });
    }
    return res;
  });
  let runs = 0, statusMismatch = 0, shareMis = 0, pMis = 0, choiceMis = 0, choiceN = 0, maxP = 0;
  for (const r of out) {
    const answered = r.status === 'EXPERIMENTAL_CROSS_COUNTRY_TRANSFER';
    if (answered !== r.has_ref) { statusMismatch++; continue; }
    if (!answered) continue;
    runs++;
    for (const [alt, v] of Object.entries(r.ref)) {
      if (Math.abs(r.sim[alt] - v.sim) > 0.051) shareMis++;
      maxP = Math.max(maxP, Math.abs(r.p[alt] - v.p));
      if (Math.abs(r.p[alt] - v.p) > 0.006) pMis++;
    }
    const ref = choices[r.q + '|' + r.s + '|' + r.a];
    for (const [rid, c] of Object.entries(r.choices)) { choiceN++; if (ref[rid] !== c) choiceMis++; }
  }
  // διαδραστικότητα: αλλαγή κατηγορίας, υπόθεσης, φίλτρου, τιμής — χωρίς σφάλματα
  await p.selectOption('#cat', 'dl'); await p.selectOption('#as', 'T2'); await p.selectOption('#f_age', '65+');
  await p.selectOption('#cat', 'rf'); await p.click('#allAs'); await p.selectOption('#as', 'T0'); await p.selectOption('#cat', 'sp'); await p.selectOption('#f_seg', { index: 1 });
  const ui = await p.evaluate(() => ({ kpis: document.querySelectorAll('.kpi').length, curvePts: document.querySelectorAll('#curve circle.pt').length, rows: document.querySelectorAll('#ptab tbody tr').length }));
  await p.setViewportSize({ width: 390, height: 900 });
  const hscroll = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  const wide = await p.evaluate(() => [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > window.innerWidth + 1 && !e.closest('.tablewrap')).slice(0, 6).map(e => e.tagName + '.' + e.className + '#' + e.id + ':' + Math.round(e.getBoundingClientRect().right)));
  await p.setViewportSize({ width: 1280, height: 900 }); await p.selectOption('#cat', 'wm');
  await p.screenshot({ path: path.join(process.argv[3] || d, 'lab_screenshot.png'), fullPage: true });
  console.log(JSON.stringify({ evaluated: out.length, answered_runs: runs, status_mismatch: statusMismatch, share_mismatch: shareMis, mean_p_mismatch: pMis, max_mean_p_diff_pp: +maxP.toFixed(4),
    individual_choices_checked: choiceN, individual_choice_mismatch: choiceMis, ui, horizontal_scroll_at_390px: hscroll, wide, page_errors: errs }));
  await b.close();
})();
