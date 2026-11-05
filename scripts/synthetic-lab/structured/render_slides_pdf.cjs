// HTML διαφάνειες (16:9, μέγεθος σελίδας από CSS) → PDF με το προεγκατεστημένο Chromium.
//   node render_slides_pdf.cjs <in.html> <out.pdf>
// Επέκταση του research-engine/ase/report/render_pdf.cjs για παρουσιάσεις: το υποσέλιδο (με την ετικέτα συνθετικής μελέτης και
// την αρίθμηση) είναι μέρος κάθε διαφάνειας, όχι κεφαλίδα/υποσέλιδο του εκτυπωτή.
const { chromium } = require('playwright');
(async () => {
  const [inp, out] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto('file://' + require('path').resolve(inp), { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.pdf({ path: out, printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
  await b.close();
})();
