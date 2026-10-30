/* Interactive Decision Lab — εμφανίζει ΜΟΝΟ εξόδους του Lab (data.js). Κανένας τύπος παραγωγής ποσοστών:
   (α) σενάρια = ήδη εκτελεσμένα σημεία πλέγματος, (β) φίλτρα = μέτρηση στις 500 εγγραφές, (γ) αποφάσεις τεκμηρίωσης. */
(function () {
  const D = window.LAB_DATA;
  const $ = (s, r = document) => r.querySelector(s);
  const el = (t, a = {}, h = '') => { const e = document.createElement(t); Object.entries(a).forEach(([k, v]) => e.setAttribute(k, v)); e.innerHTML = h; return e; };
  const f1 = (x) => (x == null || isNaN(x) ? '—' : x.toFixed(1).replace('.', ','));
  const f0 = (x) => (x == null || isNaN(x) ? '—' : x.toFixed(0));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const NAVY = '#12263a', TEAL = '#0f766e', GREY = '#9aa3ad', AMBER = '#b7791f';
  const N = D.meta.n;

  /* ---------- καρτέλες */
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    document.querySelectorAll('.pane').forEach((p) => (p.hidden = p.id !== b.dataset.tab));
  }));

  /* ---------- εξαγωγή γραφημάτων */
  function exportButtons(card, name) {
    const box = el('span', { class: 'xp' });
    const bs = el('button', { type: 'button' }, 'SVG');
    const bp = el('button', { type: 'button' }, 'PNG');
    box.append(bs, bp);
    const getSvg = () => card.querySelector('svg');
    const ser = () => {
      const s = getSvg().cloneNode(true);
      s.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      const st = document.createElementNS('http://www.w3.org/2000/svg', 'style');
      st.textContent = 'text{font-family:Inter,Arial,sans-serif}.lbl{font-size:12px;fill:#16191d}.val{font-size:12px;font-weight:700;fill:#16191d}.ax{font-size:11px;fill:#6b7380}';
      s.prepend(st);
      const cap = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      const vb = s.viewBox.baseVal;
      cap.setAttribute('x', vb.width - 4); cap.setAttribute('y', vb.height - 2); cap.setAttribute('text-anchor', 'end'); cap.setAttribute('class', 'ax');
      cap.textContent = 'Synthetic research · Greek Synthetic Research Lab';
      s.appendChild(cap);
      return new XMLSerializer().serializeToString(s);
    };
    const dl = (url, fn) => { const a = el('a', { href: url, download: fn }); document.body.appendChild(a); a.click(); a.remove(); };
    bs.onclick = () => dl(URL.createObjectURL(new Blob([ser()], { type: 'image/svg+xml' })), name + '.svg');
    bp.onclick = () => {
      const svg = getSvg(); const vb = svg.viewBox.baseVal; const img = new Image(); const k = 2;
      img.onload = () => { const c = el('canvas'); c.width = vb.width * k; c.height = vb.height * k; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height); dl(c.toDataURL('image/png'), name + '.png'); };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(ser());
    };
    return box;
  }
  function attachExport(cardSel, name) { const card = $(cardSel).closest('.card'); const h = card.querySelector('.ch'); if (h && !h.querySelector('.xp')) h.appendChild(exportButtons(card, name)); }

  /* ---------- γραφήματα */
  function hbars(rows, opt = {}) {
    const W = 640, lw = opt.lw || 220, rh = opt.rh || 28, max = opt.max || 100;
    const H = rows.length * rh + 6, bw = W - lw - 64;
    let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">`;
    rows.forEach((r, i) => {
      const y = 3 + i * rh, w = Math.max(1.5, (bw * (r.v || 0)) / max);
      s += `<g><title>${esc(r.l)}: ${f1(r.v)}%${r.n != null ? ' · n=' + r.n : ''}</title><text x="${lw - 8}" y="${y + rh * 0.62}" text-anchor="end" class="lbl">${esc(r.l)}</text>` +
        `<rect x="${lw}" y="${y + 6}" width="${w}" height="${rh - 12}" rx="3" fill="${r.c || NAVY}"${r.hatch ? ' fill-opacity=".55"' : ''}/>` +
        `<text x="${lw + w + 6}" y="${y + rh * 0.64}" class="val">${f1(r.v)}%</text></g>`;
    });
    return s + '</svg>';
  }
  function curve(points, opt) {
    const W = 1000, H = 270, L = 46, R = 16, T = 12, B = 38, pw = W - L - R, ph = H - T - B;
    const xs = points.map((p) => p.x), x0 = Math.min(...xs), x1 = Math.max(...xs);
    const sx = (x) => L + (pw * (x - x0)) / (x1 - x0 || 1), sy = (v) => T + ph * (1 - v / 100);
    let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">`;
    for (let t = 0; t <= 100; t += 20) s += `<line x1="${L}" x2="${L + pw}" y1="${sy(t)}" y2="${sy(t)}" stroke="#ebebe7"/><text x="${L - 6}" y="${sy(t) + 4}" text-anchor="end" class="ax">${t}</text>`;
    if (opt.band) s += `<rect x="${L}" y="${sy(opt.band[1])}" width="${pw}" height="${sy(opt.band[0]) - sy(opt.band[1])}" fill="#f1efe8"/>`;
    s += `<polyline fill="none" stroke="${GREY}" stroke-width="2.2" points="${points.map((p) => sx(p.x) + ',' + sy(p.v)).join(' ')}"/>`;
    points.forEach((p) => {
      const hl = opt.marks && opt.marks[p.x];
      s += `<g><title>${esc(opt.fmt(p.x))}: ${f1(p.v)}%</title><circle cx="${sx(p.x)}" cy="${sy(p.v)}" r="${hl ? 7 : 4}" fill="${hl ? hl : GREY}" stroke="#fff" stroke-width="1.5"/></g>`;
      s += `<text x="${sx(p.x)}" y="${H - 20}" text-anchor="middle" class="ax">${esc(opt.fmt(p.x))}</text>`;
    });
    s += `<text x="${L + pw / 2}" y="${H - 3}" text-anchor="middle" class="ax">${esc(opt.xlabel)}</text>`;
    return s + '</svg>';
  }

  /* ---------- Σενάρια */
  const FAM = {
    repair: { params: [['repairCost', 'Κόστος επισκευής', (v) => v + '€'], ['newPrice', 'Τιμή νέας συσκευής', (v) => v + '€'], ['repairWarrantyMonths', 'Εγγύηση επισκευής', (v) => (v ? v + ' μήνες' : 'καμία')]],
      metric: (sh) => sh['Επισκευή'], metricLabel: 'Επιλέγει επισκευή', main: 'repairCost' },
    tradein: { params: [['tradeInValue', 'Αξία trade-in', (v) => v + '€']], metric: (sh) => sh['Πολύ πιθανό'] + sh['Μάλλον πιθανό'], metricLabel: 'Πολύ/μάλλον πιθανό να χρησιμοποιήσει trade-in', main: 'tradeInValue' },
    refurb: { params: [['refurbPrice', 'Τιμή refurbished (νέο 599€)', (v) => v + '€'], ['refurbWarrantyMonths', 'Εγγύηση refurbished', (v) => v + ' μήνες']], metric: (sh) => sh['Refurbished smartphone'], metricLabel: 'Επιλέγει refurbished', main: 'refurbPrice' },
    delivery: { params: [['deliveryDays', 'Χρόνος παράδοσης', (v) => (v === 1 ? 'επόμενη ημέρα' : v + ' ημέρες')], ['deliveryFee', 'Χρέωση παράδοσης', (v) => v + '€']], metric: (sh) => sh['Ναι'], metricLabel: 'Ναι', main: 'deliveryFee' },
    install: { params: [['installFee', 'Κόστος εγκατάστασης', (v) => v + '€']], metric: (sh) => sh['Ναι'], metricLabel: 'Ναι', main: 'installFee' }
  };
  const grid = Object.entries(D.grid).map(([id, g]) => ({ id, ...g }));
  let fam = 'repair';
  const state = { A: {}, B: {} };
  const values = (f, k) => [...new Set(grid.filter((g) => g.family === f).map((g) => g.scenario[k]))].sort((a, b) => a - b);
  const findPoint = (f, sc) => grid.find((g) => g.family === f && Object.entries(sc).every(([k, v]) => g.scenario[k] === v));
  const noise = (p) => 1.96 * Math.sqrt(Math.max(p * (1 - p), 1e-9) / N) * 100;

  function buildControls(side) {
    const box = $('#ctl' + side); box.innerHTML = '';
    FAM[fam].params.forEach(([k, lab, fmt]) => {
      const vs = values(fam, k);
      if (state[side][k] == null || !vs.includes(state[side][k])) state[side][k] = side === 'A' ? vs[Math.floor((vs.length - 1) / 3)] : vs[vs.length - 1 - Math.floor((vs.length - 1) / 3)];
      const row = el('label', { class: 'sl' }, `<span>${esc(lab)}</span><b>${esc(fmt(state[side][k]))}</b>`);
      const inp = el('input', { type: 'range', min: 0, max: vs.length - 1, step: 1, value: vs.indexOf(state[side][k]), 'aria-label': lab });
      inp.oninput = () => { state[side][k] = vs[+inp.value]; row.querySelector('b').textContent = fmt(state[side][k]); renderScen(); };
      row.appendChild(inp); box.appendChild(row);
    });
  }
  function outCard(side) {
    const p = findPoint(fam, state[side]);
    const box = $('#out' + side);
    if (!p) { box.innerHTML = '<p class="na">Το σενάριο δεν εκτελέστηκε.</p>'; return null; }
    const m = FAM[fam].metric(p.shares);
    const rows = p.options.map((o, i) => ({ l: o, v: p.shares[o], c: ['#7f8a96', '#a3acb6', '#c2c8cf', '#d9dde1'][i % 4], hatch: true }));
    box.innerHTML = `<div class="big"><span>${esc(FAM[fam].metricLabel)}</span><b>${f1(m)}%</b></div>` +
      `<div class="badge4">Πειραματική έξοδος Tier ${p.tier} — όχι εύρημα</div>` + hbars(rows, { lw: 200, rh: 24 }) +
      `<p class="evl">Τεκμήριο που επέλεξε ο κινητήρας: «${esc((p.evidence[0] || {}).text || 'κανένα σχετικό τεκμήριο')}»</p>`;
    return { p, m };
  }
  function renderScen() {
    const a = outCard('A'), b = outCard('B');
    const dc = $('#diffCard');
    if (a && b) {
      const d = b.m - a.m;
      const nz = Math.sqrt(noise(a.m / 100) ** 2 + noise(b.m / 100) ** 2);
      const inside = Math.abs(d) <= nz;
      dc.innerHTML = `<div class="diff"><div><span>Μεταβολή (εναλλακτικό − baseline)</span><b>${d > 0 ? '+' : ''}${f1(d)} π.μ.</b></div>` +
        `<div class="dv ${inside ? 'in' : 'out'}">${inside ? 'Εντός τυχαίου θορύβου' : 'Εκτός θορύβου, χωρίς συστηματική δομή'} (±${f1(nz)} π.μ.)</div>` +
        `<p>Απόφαση τεκμηρίωσης του Lab: <b>μη εκτιμήσιμο</b>. Οι τεκμηριωμένες διαδρομές απέχουν (Βαθμίδα 5). Η πειραματική διαδρομή δεν βρίσκει σχετικό τεκμήριο και, όπως δείχνει η καμπύλη, δεν αντιδρά συστηματικά στη μεταβολή. <b>Δεν μπορεί να χρησιμοποιηθεί για απόφαση τιμολόγησης.</b></p></div>`;
    }
    // καμπύλη απόκρισης ως προς την κύρια παράμετρο, με τις υπόλοιπες του εναλλακτικού
    const mk = FAM[fam].main;
    const pts = values(fam, mk).map((x) => { const sc = { ...state.B, [mk]: x }; const p = findPoint(fam, sc); return p ? { x, v: FAM[fam].metric(p.shares) } : null; }).filter(Boolean);
    const mean = pts.reduce((s, p) => s + p.v, 0) / pts.length;
    const nz = noise(mean / 100);
    const fmt = FAM[fam].params.find((x) => x[0] === mk)[2];
    const marks = {}; if (state.A[mk] != null && Object.entries(state.A).every(([k, v]) => k === mk || state.B[k] === v)) marks[state.A[mk]] = NAVY; marks[state.B[mk]] = TEAL;
    $('#curve').innerHTML = curve(pts, { fmt, xlabel: FAM[fam].params.find((x) => x[0] === mk)[1], band: [mean - nz, mean + nz], marks });
    $('#curveTitle').textContent = `${FAM[fam].metricLabel} ανά ${FAM[fam].params.find((x) => x[0] === mk)[1].toLowerCase()}`;
    $('.exp', $('#curve').closest('.card')).textContent = 'Πειραματική έξοδος Tier 4';
    $('#curveCap').innerHTML = 'Γκρι ζώνη: τυχαίος θόρυβος 95% γύρω από τον μέσο όρο · σκούρα κουκκίδα: baseline (όταν οι υπόλοιπες παράμετροι συμπίπτουν) · πράσινη: εναλλακτικό · 500 προφίλ ανά σημείο · <span class="synth">Synthetic research · Greek Synthetic Research Lab</span>';
    attachExport('#curve', `curve_${fam}`);
  }
  document.querySelectorAll('.fam button').forEach((b) => b.addEventListener('click', () => {
    fam = b.dataset.fam; document.querySelectorAll('.fam button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    state.A = {}; state.B = {}; buildControls('A'); buildControls('B'); renderScen();
  }));
  buildControls('A'); buildControls('B'); renderScen();

  /* ---------- Σύγκριση προσφορών */
  const attrs = D.design.attributes;
  const fmtA = { price: (v) => v + '€', delivery: (v) => (v === 1 ? 'επόμενη ημέρα' : v + ' ημέρες'), install: (v) => (v === 0 ? 'δωρεάν' : v + '€'), warranty: (v) => v + ' έτη',
    instalments: (v) => (v === 0 ? 'χωρίς' : v + ' άτοκες'), tradein: (v) => (v === 0 ? 'χωρίς' : v + '€'), support: (v) => (v === 0 ? 'τηλεφωνική' : 'στο σπίτι') };
  const offer = { A: { ...D.design.tasks[0].A }, B: { ...D.design.tasks[0].B } };
  function buildOffer(side) {
    const box = $('#off' + side); box.innerHTML = '';
    attrs.forEach((a) => {
      const sel = el('select', { 'aria-label': a.label });
      a.levels.forEach((v) => { const o = el('option', { value: v }, fmtA[a.key](v)); if (v === offer[side][a.key]) o.selected = true; sel.appendChild(o); });
      sel.onchange = () => { offer[side][a.key] = +sel.value; renderOffers(); };
      const row = el('label', { class: 'sel' }, `<span>${esc(a.label)}</span>`); row.appendChild(sel); box.appendChild(row);
    });
  }
  function renderOffers() {
    const better = (x, y, a) => (a.betterWhen === 'lower' ? x < y : x > y);
    let aB = 0, bB = 0, diffN = 0;
    const rows = attrs.map((a) => {
      const x = offer.A[a.key], y = offer.B[a.key];
      if (x !== y) diffN++;
      const w = x === y ? '=' : better(x, y, a) ? 'A' : 'B';
      if (w === 'A') aB++; if (w === 'B') bB++;
      return `<tr><td>${esc(a.label)}</td><td class="${w === 'A' ? 'win' : ''}">${fmtA[a.key](x)}</td><td class="${w === 'B' ? 'win' : ''}">${fmtA[a.key](y)}</td></tr>`;
    }).join('');
    const dom = (aB > 0 && bB === 0) || (bB > 0 && aB === 0);
    $('#offRes').innerHTML = `<div class="ch"><h3>Δομή της σύγκρισης</h3></div><table class="t"><thead><tr><th>Χαρακτηριστικό</th><th>Προσφορά Α</th><th>Προσφορά Β</th></tr></thead><tbody>${rows}</tbody></table>` +
      `<p>${diffN} χαρακτηριστικά διαφέρουν · πλεονεκτήματα Α: ${aB} · Β: ${bB}. ${dom ? '<b>Η μία προσφορά κυριαρχεί:</b> ένα έγκυρο πείραμα επιλογής θα την απέκλειε.' : 'Καμία προσφορά δεν κυριαρχεί: κατάλληλη για πείραμα επιλογής.'}</p>` +
      `<div class="verdict"><b>Τι μπορεί να πει το Lab:</b> δεν μπορεί να εκτιμήσει ποια προσφορά θα προτιμούσαν οι καταναλωτές. Και τα 6 πειράματα επιλογής είναι στη Βαθμίδα 5 στις τεκμηριωμένες διαδρομές, και το πειραματικό μοντέλο δεν διαφέρει από το «καμία επίδραση» (p = ${D.choiceModel.p_value.toFixed(2).replace('.', ',')}). Για να απαντηθεί, χρειάζεται ο ίδιος σχεδιασμός σε πραγματικό δείγμα.</div>`;
  }
  function coefChart() {
    const m = D.choiceModel; const keys = Object.keys(m.coef).filter((k) => k !== 'asc_none');
    const lab = { price: 'Τιμή (ανά 100€)', delivery: 'Παράδοση (ανά ημέρα)', install: 'Εγκατάσταση (ανά 10€)', warranty: 'Εγγύηση (ανά έτος)', instalments: '12 άτοκες δόσεις', tradein: 'Trade-in 50€', support: 'Υποστήριξη στο σπίτι' };
    const W = 1000, rh = 34, L = 230, H = keys.length * rh + 30, pw = W - L - 24;
    const ext = Math.max(...keys.map((k) => Math.abs(m.coef[k]) + 1.96 * m.se[k])) * 1.1;
    const sx = (v) => L + (pw * (v + ext)) / (2 * ext);
    let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img"><line x1="${sx(0)}" x2="${sx(0)}" y1="4" y2="${H - 22}" stroke="#555"/><text x="${sx(0)}" y="${H - 6}" text-anchor="middle" class="ax">0 = καμία επίδραση</text>`;
    keys.forEach((k, i) => {
      const y = 12 + i * rh + rh / 2, b = m.coef[k], se = m.se[k];
      s += `<g><title>${lab[k]}: β=${b.toFixed(3)} · 95% [${(b - 1.96 * se).toFixed(3)}, ${(b + 1.96 * se).toFixed(3)}]</title><text x="${L - 8}" y="${y + 4}" text-anchor="end" class="lbl">${lab[k]}</text>` +
        `<line x1="${sx(b - 1.96 * se)}" x2="${sx(b + 1.96 * se)}" y1="${y}" y2="${y}" stroke="${GREY}" stroke-width="3" stroke-linecap="round"/><circle cx="${sx(b)}" cy="${y}" r="5" fill="${GREY}"/></g>`;
    });
    $('#coef').innerHTML = s + '</svg>';
    $('.exp', $('#coef').closest('.card')).textContent = 'Πειραματική έξοδος Tier 4';
    $('#coefCap').innerHTML = `Conditional logit σε ${m.n_choices} πειραματικές επιλογές · 95% διαστήματα · LR = ${m.LR.toFixed(1).replace('.', ',')}, p = ${m.p_value.toFixed(2).replace('.', ',')} · <span class="synth">Synthetic research · Greek Synthetic Research Lab</span>`;
    attachExport('#coef', 'choice_model_coefficients');
  }
  buildOffer('A'); buildOffer('B'); renderOffers(); coefChart();

  /* ---------- Καταναλωτές & segments */
  const C = D.consumers;
  const items = Object.values(D.ownership.items);
  const FIL = [['gender', 'Φύλο'], ['age_band', 'Ηλικία'], ['area', 'Περιοχή'], ['settlement', 'Τύπος περιοχής'], ['education', 'Εκπαίδευση'], ['income_quintile', 'Εισοδ. πεμπτημόριο'], ['segment', 'Segment']];
  const fsel = {};
  const fbox = $('#filters');
  FIL.forEach(([k, lab]) => {
    const vals = [...new Set(C.map((c) => String(c[k])))].sort();
    const s = el('select', { 'aria-label': lab });
    s.appendChild(el('option', { value: '' }, 'Όλοι'));
    vals.forEach((v) => s.appendChild(el('option', { value: v }, k === 'segment' ? D.segmentNames[v] : k === 'income_quintile' ? v + 'ο' : v)));
    s.onchange = () => { fsel[k] = s.value; renderSegs(); };
    const row = el('label', { class: 'sel' }, `<span>${lab}</span>`); row.appendChild(s); fbox.appendChild(row);
  });
  const reset = el('button', { type: 'button', class: 'reset' }, 'Καθαρισμός φίλτρων');
  reset.onclick = () => { fbox.querySelectorAll('select').forEach((s) => (s.value = '')); Object.keys(fsel).forEach((k) => delete fsel[k]); renderSegs(); };
  fbox.appendChild(reset);
  function renderSegs() {
    const sub = C.filter((c) => Object.entries(fsel).every(([k, v]) => !v || String(c[k]) === v));
    const n = sub.length;
    const rows = items.map((lab, i) => ({ l: lab, v: n ? (100 * sub.filter((c) => c.own[i]).length) / n : NaN, n }));
    $('#ownChart').innerHTML = n ? hbars(rows) : '<p class="na">Καμία εγγραφή με αυτά τα φίλτρα.</p>';
    $('#ownCap').innerHTML = `Βάση: ${n} από ${N} συνθετικά νοικοκυριά${n && n < 50 ? ' · <b>μικρή βάση (&lt; 50): ενδεικτικό</b>' : ''} · ΕΟΠ 2019–2020 με χρονική μεταφορά · <span class="synth">Synthetic research · Greek Synthetic Research Lab</span>`;
    const segRows = D.segments.segments.map((s, i) => ({ l: D.segmentNames[s.segment], v: n ? (100 * sub.filter((c) => c.segment === s.segment).length) / n : NaN, c: [NAVY, TEAL, '#3f7cac', '#8a9aa9', '#c4b998'][i] }));
    $('#segChart').innerHTML = n ? hbars(segRows, { lw: 250, max: 60 }) : '';
    $('#segCap').innerHTML = `Κατανομή segments στη βάση ${n} · k-means στον εξοπλισμό (silhouette) · <span class="synth">Synthetic research · Greek Synthetic Research Lab</span>`;
    attachExport('#ownChart', 'ownership'); attachExport('#segChart', 'segments');
  }
  renderSegs();
  $('#segTable').innerHTML = `<table class="t"><thead><tr><th>Segment</th><th>Μερίδιο</th><th>Συσκ./νοικ.</th>${items.map((i) => `<th>${esc(i)}</th>`).join('')}<th>65+</th><th>Αγροτική</th><th>5ο πεμπτ.</th></tr></thead><tbody>` +
    D.segments.segments.map((s) => `<tr><td><b>${esc(D.segmentNames[s.segment])}</b></td><td>${f0(s.share)}%</td><td>${f1(s.meanDevices)}</td>${items.map((i) => `<td>${f0(s.ownership[i])}</td>`).join('')}<td>${f0(s.age['65+'])}</td><td>${f0(s.settlement['Αγροτική'])}</td><td>${f0(s.income['5'])}</td></tr>`).join('') + '</tbody></table>';

  /* ---------- Χάρτης τεκμηρίωσης */
  const tierCell = (t) => `<td class="tier t${t}">${t ?? '—'}</td>`;
  $('#evTable').innerHTML = '<thead><tr><th>Κωδ.</th><th>Ερώτηση</th><th>R1 autolink</th><th>R2 IQGE ελλην.</th><th>R3 IQGE διεθν.</th><th>Τεκμήριο που επέλεξε η R3</th><th>Κατάσταση</th></tr></thead><tbody>' +
    Object.values(D.evidence).map((e) => `<tr><td>${e.qid}</td><td>${esc(e.short)}</td>${tierCell(e.R1_tier)}${tierCell(e.R2_tier)}${tierCell(e.R3_tier)}<td class="ev">${esc((e.R3_evidence[0] || {}).text || '—')}</td><td>${e.R1_tier <= 3 || e.R2_tier <= 3 || e.R3_tier <= 3 ? '<span class="ok">υπολογίσιμο</span>' : '<span class="no">μη εκτιμήσιμο</span>'}</td></tr>`).join('') + '</tbody>';
  $('#bridges').innerHTML = '<table class="t"><thead><tr><th>Ερώτηση-γέφυρα</th><th>Πηγή</th><th>Δημοσιευμένο (εκτός μοντέλου)</th><th>Πειραματική διαδρομή Lab</th></tr></thead><tbody>' +
    D.bridges.map((b) => `<tr><td>${esc(b.text.slice(0, 110))}…</td><td>${esc(b.source)}</td><td>${Object.entries(b.published).map(([k, v]) => `${esc(k)} ${v}%`).join('<br>')}</td><td>${Object.entries(b.tier4_output).map(([k, v]) => `${esc(k)} ${f1(v)}%`).join('<br>')}</td></tr>`).join('') + '</tbody></table>';
})();
