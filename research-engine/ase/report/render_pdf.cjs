// HTML → PDF (A4) με το προεγκατεστημένο Chromium.  node render_pdf.cjs <in.html> <out.pdf>
const { chromium } = require('playwright');
(async () => {
  const [inp, out] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto('file://' + require('path').resolve(inp), { waitUntil: 'load' });
  // σε κάθε σελίδα: υποχρεωτική ετικέτα συνθετικής μελέτης + αρίθμηση
  const foot = '<div style="width:100%;font:700 8px Arial,sans-serif;color:#12263a;text-align:center;letter-spacing:.06em">'
    + 'ΣΥΝΘΕΤΙΚΗ ΠΡΟΣΟΜΟΙΩΣΗ — ΟΧΙ ΠΡΑΓΜΑΤΙΚΗ ΕΡΕΥΝΑ ΠΕΔΙΟΥ · <span class="pageNumber"></span>/<span class="totalPages"></span></div>';
  await p.pdf({ path: out, format: 'A4', printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true,
    headerTemplate: '<div></div>', footerTemplate: foot });
  await b.close();
})();
