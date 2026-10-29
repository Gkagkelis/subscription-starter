// PHASE 8: HTML → PDF (A4) με Chromium/Playwright + έλεγχος υπερχείλισης σελίδων + στιγμιότυπα για οπτικό έλεγχο.
//   node scripts/synthetic-lab/pasok/p8_pdf.cjs <report.html> <out.pdf> [shots_dir]
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [html, pdf, shots] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1200, height: 1000 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.resolve(html));
  await p.emulateMedia({ media: 'print' });
  const over = await p.evaluate(() => [...document.querySelectorAll('section.page')].map((s, i) => ({ i: i + 1, sh: s.scrollHeight, ch: s.clientHeight })).filter((x) => x.sh > x.ch + 2));
  const nPages = await p.evaluate(() => document.querySelectorAll('section.page').length);
  await p.pdf({ path: pdf, format: 'A4', printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 }, preferCSSPageSize: true });
  if (shots) {
    await p.emulateMedia({ media: 'screen' });
    await p.addStyleTag({ content: '.topbar{display:none!important}' });
    const els = await p.$$('section.page');
    for (let i = 0; i < els.length; i++) await els[i].screenshot({ path: path.join(shots, `p${String(i + 1).padStart(2, '0')}.png`) });
    const m = await b.newPage({ viewport: { width: 390, height: 844 } });
    await m.goto('file://' + path.resolve(html));
    await m.screenshot({ path: path.join(shots, 'mobile.png') });
    const sw = await m.evaluate(() => document.documentElement.scrollWidth);
    console.log('mobile scrollWidth', sw);
  }
  console.log(JSON.stringify({ pages: nPages, overflow: over, errors: errs }));
  await b.close();
})();
