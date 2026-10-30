// HTML → PDF (A4) και προαιρετικά PNG ανά σελίδα για οπτικό έλεγχο.  node render_pdf.cjs <in.html> <out.pdf> [png_dir]
const { chromium } = require('playwright');
(async () => {
  const [inp, out, pngDir] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 900, height: 1270 } });
  await p.goto('file://' + require('path').resolve(inp), { waitUntil: 'load' });
  await p.pdf({ path: out, format: 'A4', printBackground: true, preferCSSPageSize: true });
  if (pngDir) {
    const n = await p.$$eval('section.page', s => s.length);
    for (let i = 0; i < n; i++) {
      const el = (await p.$$('section.page'))[i];
      await el.screenshot({ path: `${pngDir}/p${String(i + 1).padStart(2, '0')}.png` });
    }
    const over = await p.$$eval('section.page', ss => ss.map((s, i) => [i + 1, s.scrollHeight - s.clientHeight]).filter(x => x[1] > 2));
    console.log('overflow', JSON.stringify(over));
  }
  await b.close();
})();
