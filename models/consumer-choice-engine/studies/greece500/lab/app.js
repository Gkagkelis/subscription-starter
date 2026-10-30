/* Greece 500 Choice Lab — υπολογίζει πιθανότητες και επιλογές από τους ατομικούς συντελεστές και τα σταθερά τυχαία σφάλματα
   που εξήγαγε η CCE 0.1 (studies/greece500/analyze.py). Ίδιοι κανόνες με το Python: μετατροπή ευρώ → μονάδες μοντέλου,
   πύλη πεδίου εκπαίδευσης, softmax για πιθανότητες, argmax(v + ε) για επιλογή. Κανένα ποσοστό δεν είναι γραμμένο εδώ. */
(function () {
  "use strict";
  const G = window.G500;
  const COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"];
  const AS_COL = { T0: "#2a78d6", T1: "#1baf7a", T2: "#eb6834", T3: "#eda100" };
  const SC = {};
  G.scenarios.forEach(r => { SC[r.question_id + "|" + r.scenario_id] = JSON.parse(r.alternatives); });
  const QBY = {}; G.questions.forEach(q => { QBY[q.question_id] = q; });
  const CATS = [
    { id: "wm", label: "Πλυντήρια", model: "swiss-ce-washing-machine" },
    { id: "sp", label: "Smartphones", model: "swiss-ce-smartphone" },
    { id: "rf", label: "Νέο vs refurbished smartphone", model: "refurb-smartphone-us2019" },
    { id: "dl", label: "Παράδοση εντός ημέρας", model: "delivery-us2022" }];
  const ALT_NAME = { A: "Προσφορά A", B: "Προσφορά B", refurb_A: "Refurbished A", refurb_B: "Refurbished B", new: "Νέο", ground: "Επίγεια", drone: "Drone" };
  const $ = id => document.getElementById(id);
  const fmt1 = x => (x == null || isNaN(x)) ? "—" : x.toFixed(1).replace(".", ",");
  const eur = x => (Math.round(x * 100) / 100).toLocaleString("el-GR", { minimumFractionDigits: Number.isInteger(x) ? 0 : 2, maximumFractionDigits: 2 }) + " €";

  // ------------------------------------------------------------------ πυρήνας (ίδιος με cce/engine.py + cce/transfer.py)
  function toModel(mk, alts, f) {
    const money = G.models[mk].money;
    return alts.map(a => { const b = {}; for (const [k, v] of Object.entries(a)) { if (money[k]) { b[money[k][0]] = v * f / money[k][1]; } else b[k] = v; } return b; });
  }
  function gate(mk, ctx, altsM) {
    const dom = G.models[mk].domain, reasons = [];
    if (!dom.categories.includes(ctx.category)) return { status: "NOT_SUPPORTED", reasons: ["Κατηγορία εκτός πεδίου"] };
    const extra = mk === "delivery-us2022" ? (G.dl_ranges[ctx.category] || {}) : {};
    for (const a of altsM) {
      if (!dom.alternatives.includes(a.alt_id)) return { status: "NOT_SUPPORTED", reasons: ["Άγνωστη εναλλακτική " + a.alt_id] };
      for (const [k, v] of Object.entries(a)) {
        if (k === "alt_id") continue;
        if (!dom.attributes[k]) return { status: "NOT_SUPPORTED", reasons: ["Χαρακτηριστικό χωρίς συντελεστή: " + k] };
        const [lo, hi] = dom.attributes[k].range;
        if (!(lo <= v && v <= hi)) reasons.push(`${ALT_NAME[a.alt_id] || a.alt_id}: ${k} = ${(+v).toFixed(3)} εκτός εύρους εκπαίδευσης [${lo}, ${hi}]`);
        if (extra[k] && !(extra[k][0] - 1e-9 <= v && v <= extra[k][1] + 1e-9)) reasons.push(`${ALT_NAME[a.alt_id] || a.alt_id}: ${k} = ${(+v).toFixed(3)} εκτός εύρους της κατηγορίας [${extra[k][0]}, ${extra[k][1]}]`);
      }
    }
    return reasons.length ? { status: "EXTRAPOLATION_REJECTED", reasons } : { status: "EXPERIMENTAL_CROSS_COUNTRY_TRANSFER", reasons: [] };
  }
  function xrow(a, terms, prof) {
    return terms.map(t => {
      if (t.kind === "attr") return +(a[t.col] || 0);
      if (t.kind === "asc") return a.alt_id === t.alt ? 1 : 0;
      const pv = prof[t.cov];
      const cv = ("cov_value" in t) ? (pv === t.cov_value ? 1 : 0) : +pv;
      const base = t.kind === "attr_x_cov" ? +(a[t.col] || 0) : (a.alt_id === t.alt ? 1 : 0);
      return base * cv;
    });
  }
  function run(mk, ctx, altsEur, aid, taskKey, people) {
    const f = G.assumptions[aid].factors[mk];
    const altsM = toModel(mk, altsEur, f);
    const g = gate(mk, ctx, altsM);
    if (g.status !== "EXPERIMENTAL_CROSS_COUNTRY_TRANSFER") return { ...g, altsM };
    const M = G.models[mk];
    const byName = {}; M.terms.forEach(t => { byName[t.name] = t; });
    const terms = M.features.map(n => byName[n]);
    const ids = altsM.map(a => a.alt_id);
    const E = G.eps[taskKey];
    const idx = ids.map(i => E.labels.indexOf(i));
    const rows = [];
    for (const p of people) {
      const b = M.betas[p.respondent_id];
      const prof = { ...ctx, ...p };
      const v = altsM.map(a => xrow(a, terms, prof).reduce((s, x, k) => s + x * b[k], 0));
      const mx = Math.max(...v);
      const e = v.map(x => Math.exp(x - mx)); const z = e.reduce((s, x) => s + x, 0);
      const pr = e.map(x => x / z);
      const eps = E.e[p.respondent_id];
      let best = 0; for (let j = 1; j < v.length; j++) if (v[j] + eps[idx[j]] > v[best] + eps[idx[best]]) best = j;
      rows.push({ id: p.respondent_id, p: pr, choice: ids[best], person: p });
    }
    const n = rows.length || 1;
    const sim = {}, mp = {};
    ids.forEach((id, j) => { sim[id] = 100 * rows.filter(r => r.choice === id).length / n; mp[id] = 100 * rows.reduce((s, r) => s + r.p[j], 0) / n; });
    return { status: g.status, reasons: [], altsM, ids, rows, sim, mp };
  }
  window.G500API = {
    runScenario(qid, sid, aid) {
      const q = QBY[qid];
      const r = run(q.model, q.context, SC[qid + "|" + sid], aid, qid, G.panel);
      return { status: r.status, sim: r.sim, p: r.mp, choices: r.rows ? Object.fromEntries(r.rows.map(x => [x.id, x.choice])) : null };
    }
  };

  // ------------------------------------------------------------------ επεξεργασία προσφορών
  const LV = {
    repair: { none: [0, 0], limited: [1, 0], full: [0, 1] }, recy: { none: [0, 0], limited: [1, 0], full: [0, 1] },
    env: { low: [0, 0], medium: [1, 0], very_high: [0, 1] }, energy: { G: [0, 0, 0], E: [1, 0, 0], C: [0, 1, 0], A: [0, 0, 1] }
  };
  const LVN = { repair: { none: "Καθόλου", limited: "Περιορισμένη", full: "Πλήρης" }, recy: { none: "Όχι", limited: "Περιορισμένα", full: "Ναι" },
    env: { low: "Πολύ χαμηλό", medium: "Μεσαίο", very_high: "Πολύ υψηλό" }, energy: { G: "G", E: "E", C: "C", A: "A" },
    cond: { new: "Νέο", used: "Μεταχειρισμένο", refurbished: "Refurbished", open_box: "Open box" }, seller: { unauthorized: "Μη εξουσιοδοτημένος τρίτος", authorized: "Εξουσιοδοτημένος τρίτος", oem: "Κατασκευαστής" } };
  function dec(a, kind) {
    if (kind === "product") {
      const pick = (o, ks) => Object.keys(o).find(k => o[k].every((x, i) => x === a[ks[i]]));
      return { price_eur: a.price_eur, life_years: a.life_years, repair: pick(LV.repair, ["repair_limited", "repair_full"]), recy: pick(LV.recy, ["recy_limited", "recy_full"]),
        env: pick(LV.env, ["env_impact_medium", "env_impact_very_high"]), energy: pick(LV.energy, ["energy_E", "energy_C", "energy_A"]) };
    }
    if (kind === "refurb") return { price_eur: a.price_eur, cond: a.alt_id === "new" ? "new" : a.cond_open_box ? "open_box" : a.cond_refurbished ? "refurbished" : "used",
      seller: a.seller_oem ? "oem" : a.seller_authorized ? "authorized" : "unauthorized" };
    return { fee_eur: a.fee_eur, minutes: Math.round(a.wait_hours * 60), privacy_risk: a.privacy_risk };
  }
  function enc(id, s, kind) {
    if (kind === "product") {
      const [rl, rf] = LV.repair[s.repair], [yl, yf] = LV.recy[s.recy], [em, eh] = LV.env[s.env], [e1, e2, e3] = LV.energy[s.energy];
      return { alt_id: id, price_eur: +s.price_eur, life_years: +s.life_years, repair_limited: rl, repair_full: rf, recy_limited: yl, recy_full: yf,
        env_impact_medium: em, env_impact_very_high: eh, energy_E: e1, energy_C: e2, energy_A: e3 };
    }
    if (kind === "refurb") return { alt_id: id, price_eur: +s.price_eur, cond_refurbished: +(s.cond === "refurbished"), cond_open_box: +(s.cond === "open_box"),
      seller_authorized: +(s.seller === "authorized"), seller_oem: +(s.seller === "oem") };
    return { alt_id: id, fee_eur: +s.fee_eur, wait_hours: s.minutes / 60, privacy_risk: +s.privacy_risk };
  }
  const KIND = { "swiss-ce-washing-machine": "product", "swiss-ce-smartphone": "product", "refurb-smartphone-us2019": "refurb", "delivery-us2022": "delivery" };

  // ------------------------------------------------------------------ κατάσταση
  const S = { cat: "wm", q: null, sid: null, as: "T0", state: [], filt: {} };
  function people() {
    return G.panel.filter(p => Object.entries(S.filt).every(([k, v]) => !v || String(p[k]) === v));
  }
  function currentAlts() { const mk = QBY[S.q].model; return S.state.map(s => enc(s.id, s, KIND[mk])); }

  function fillSelect(el, opts, val) { el.innerHTML = opts.map(([v, l]) => `<option value="${v}">${l}</option>`).join(""); if (val != null) el.value = val; }
  function initControls() {
    fillSelect($("cat"), CATS.map(c => [c.id, c.label]), S.cat);
    fillSelect($("as"), Object.entries(G.assumptions).map(([k, v]) => [k, k + " · " + v.label]), S.as);
    const uniq = k => [...new Set(G.panel.map(p => String(p[k])))].sort();
    fillSelect($("f_gender"), [["", "Όλα"], ...uniq("gender").map(v => [v, v])]);
    fillSelect($("f_age"), [["", "Όλες"], ...uniq("age_band").map(v => [v, v])]);
    fillSelect($("f_region"), [["", "Όλες"], ...uniq("region").map(v => [v, v])]);
    fillSelect($("f_inc"), [["", "Όλα"], ...uniq("income_quintile").map(v => [v, v + "ο πεμπτημόριο"])]);
    $("cat").onchange = () => { S.cat = $("cat").value; setCat(); };
    $("q").onchange = () => { const [q, sid] = $("q").value.split("|"); setScenario(q, sid); };
    $("as").onchange = () => { S.as = $("as").value; render(); };
    [["f_gender", "gender"], ["f_age", "age_band"], ["f_region", "region"], ["f_inc", "income_quintile"], ["f_seg", null]].forEach(([id, k]) => {
      $(id).onchange = () => { const key = k || segKey(); S.filt = Object.fromEntries(Object.entries(S.filt).filter(([kk]) => kk !== key)); if ($(id).value) S.filt[key] = $(id).value; render(); };
    });
    $("allAs").onchange = render;
    $("dlSvg").onclick = () => download("greece500_curve.svg", new Blob([svgText()], { type: "image/svg+xml" }));
    $("dlPng").onclick = pngExport;
    $("dlCsv").onclick = () => download("greece500_curve.csv", new Blob([curveCsv()], { type: "text/csv" }));
  }
  function segKey() { return S.cat === "sp" ? "segment_smartphone" : "segment_washing_machine"; }
  function setCat() {
    const mk = CATS.find(c => c.id === S.cat).model;
    const qs = G.questions.filter(q => q.model === mk);
    const opts = []; qs.forEach(q => q.scenarios.forEach(s => opts.push([q.question_id + "|" + s, `${q.question_id} · ${q.text} — ${s}`])));
    fillSelect($("q"), opts);
    const seg = S.cat === "sp" ? "segment_smartphone" : "segment_washing_machine";
    fillSelect($("f_seg"), [["", "Όλα"], ...[...new Set(G.panel.map(p => p[seg]))].sort().map(v => [v, v])]);
    $("f_seg").disabled = !(S.cat === "wm" || S.cat === "sp");
    S.filt = Object.fromEntries(Object.entries(S.filt).filter(([k]) => !k.startsWith("segment_")));
    $("f_seg").value = "";
    const first = qs.find(q => q.kind === "price_curve" || q.kind === "fee_curve" || q.kind === "discount_curve") || qs[0];
    const mid = first.scenarios[Math.floor(first.scenarios.length / 2)];
    $("q").value = first.question_id + "|" + mid;
    setScenario(first.question_id, mid);
  }
  function setScenario(q, sid) {
    S.q = q; S.sid = sid;
    const mk = QBY[q].model;
    S.state = SC[q + "|" + sid].map(a => ({ id: a.alt_id, ...dec(a, KIND[mk]) }));
    form(); render();
  }
  function form() {
    const mk = QBY[S.q].model, kind = KIND[mk], dom = G.models[mk].domain.attributes;
    const h = S.state.map((s, i) => {
      let f = "";
      const sel = (k, opts) => `<label>${{ life_years: "Διάρκεια ζωής (έτη)", repair: "Επισκευασιμότητα", recy: "Ανακυκλώσιμο", env: "Αποτύπωμα παραγωγής", energy: "Ενεργειακή κλάση", cond: "Κατάσταση", seller: "Πωλητής", privacy_risk: "Προστασία δεδομένων" }[k]}<select data-i="${i}" data-k="${k}">${opts.map(([v, l]) => `<option value="${v}" ${String(s[k]) === String(v) ? "selected" : ""}>${l}</option>`).join("")}</select></label>`;
      const num = (k, lab, step, min, max) => `<label>${lab} <span class="pv" id="pv_${i}_${k}">${k === "minutes" ? s[k] + "′" : eur(+s[k])}</span><input type="range" data-i="${i}" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${s[k]}"></label>`;
      if (kind === "product") {
        const lifeLv = S.cat === "wm" ? [5, 10, 15] : [2, 4, 8];
        f = num("price_eur", "Τιμή", S.cat === "wm" ? 10 : 5, S.cat === "wm" ? 99 : 29, S.cat === "wm" ? 1299 : 799)
          + sel("life_years", lifeLv.map(v => [v, v])) + sel("repair", Object.entries(LVN.repair)) + sel("energy", Object.entries(LVN.energy)) + sel("recy", Object.entries(LVN.recy)) + sel("env", Object.entries(LVN.env));
      } else if (kind === "refurb") {
        f = num("price_eur", "Τιμή", 1, 0, 700) + (s.id === "new" ? "" : sel("cond", Object.entries(LVN.cond).filter(([k]) => k !== "new")) + sel("seller", Object.entries(LVN.seller)));
      } else {
        f = num("fee_eur", "Χρέωση", 0.25, 0, 12) + num("minutes", "Χρόνος", 5, 5, 1440) + (s.id === "drone" ? sel("privacy_risk", [[0, "Ναι"], [1, "Όχι"]]) : "");
      }
      return `<div class="offer"><h3><i style="background:${COLORS[i]}"></i>${ALT_NAME[s.id] || s.id}</h3><div class="fields">${f}</div></div>`;
    }).join("");
    $("offerForm").innerHTML = h;
    $("offerForm").querySelectorAll("select,input").forEach(el => {
      el.oninput = () => {
        const i = +el.dataset.i, k = el.dataset.k;
        S.state[i][k] = el.type === "range" ? +el.value : (isNaN(+el.value) ? el.value : (["repair", "recy", "env", "energy", "cond", "seller"].includes(k) ? el.value : +el.value));
        const pv = document.getElementById(`pv_${i}_${k}`); if (pv) pv.textContent = k === "minutes" ? el.value + "′" : eur(+el.value);
        render();
      };
    });
  }

  // ------------------------------------------------------------------ απόδοση
  function focusAlt(ids) { return ids.includes("A") ? "A" : ids.includes("refurb_A") ? "refurb_A" : "drone"; }
  function render() {
    const q = QBY[S.q], mk = q.model;
    const ppl = people();
    $("nfilt").textContent = `${ppl.length} από 500 προφίλ στο φίλτρο`;
    const r = run(mk, q.context, currentAlts(), S.as, S.q, ppl);
    if (r.status !== "EXPERIMENTAL_CROSS_COUNTRY_TRANSFER") {
      $("status").innerHTML = `<span class="badge no">${r.status}</span><ul class="hint">${r.reasons.map(x => `<li>${x}</li>`).join("")}</ul><p class="hint">Το σενάριο είναι εκτός του πεδίου εκπαίδευσης στην υπόθεση ${S.as}: δεν παράγεται απάντηση.</p>`;
      $("kpis").innerHTML = ""; $("bars").innerHTML = ""; $("match").textContent = ""; $("ptab").innerHTML = "";
    } else {
      $("status").innerHTML = `<span class="badge ok">EXPERIMENTAL_CROSS_COUNTRY_TRANSFER · ${G.models[mk].domain.populations.join(", ")} → GR · συντελεστής ${G.assumptions[S.as].factors[mk].toFixed(3).replace(".", ",")} μον./€</span>`;
      $("kpis").innerHTML = r.ids.map((id, j) => `<div class="kpi" style="border-top-color:${COLORS[j]}"><b>${fmt1(r.sim[id])}%</b><span>${ALT_NAME[id] || id} · κληρωμένες επιλογές<br>μέση πιθανότητα ${fmt1(r.mp[id])}%</span></div>`).join("");
      $("bars").innerHTML = stackSvg(r);
      // σύγκριση με τα αποτελέσματα της μελέτης όταν το σενάριο είναι ακριβώς ένα από τα σενάρια της μελέτης και χωρίς φίλτρο
      const same = JSON.stringify(currentAlts()) === JSON.stringify(SC[S.q + "|" + S.sid]);
      const ref = G.results[S.q] && G.results[S.q][S.as] && G.results[S.q][S.as][S.sid];
      if (same && ppl.length === 500 && ref) {
        const ok = r.ids.every(id => Math.abs(r.sim[id] - ref[id].sim) < 0.05);
        $("match").innerHTML = ok ? `✓ Ταυτίζεται με RESULTS.csv (${S.q} · ${S.sid} · ${S.as})` : `✕ Διαφορά από RESULTS.csv`;
      } else $("match").textContent = same ? "" : "Τροποποιημένο σενάριο: υπολογίζεται ζωντανά με τους ίδιους συντελεστές.";
      table(r);
    }
    curve();
  }
  function stackSvg(r) {
    const W = 520, H = 34; let x = 0;
    const segs = r.ids.map((id, j) => { const w = W * r.sim[id] / 100; const s = `<rect x="${x}" y="4" width="${Math.max(0, w - 2)}" height="${H - 8}" rx="3" fill="${COLORS[j]}"><title>${ALT_NAME[id] || id}: ${fmt1(r.sim[id])}%</title></rect>`; x += w; return s; }).join("");
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Κατανομή επιλογών">${segs}</svg>`;
  }
  function table(r) {
    const seg = S.cat === "sp" ? "segment_smartphone" : "segment_washing_machine";
    const head = `<tr><th>ID</th><th>Φύλο</th><th>Ηλικία</th><th>Περιφέρεια</th><th>Εισόδημα</th>${S.cat === "wm" || S.cat === "sp" ? "<th>Segment</th>" : ""}${r.ids.map(id => `<th>p(${ALT_NAME[id] || id})</th>`).join("")}<th>Επιλογή</th></tr>`;
    const rows = r.rows.slice(0, 500).map(x => `<tr><td>${x.id}</td><td>${x.person.gender}</td><td>${x.person.age_band}</td><td>${x.person.region}</td><td>${x.person.income_quintile}</td>${S.cat === "wm" || S.cat === "sp" ? `<td>${x.person[seg]}</td>` : ""}${x.p.map(p => `<td class="n">${(100 * p).toFixed(1).replace(".", ",")}%</td>`).join("")}<td>${ALT_NAME[x.choice] || x.choice}</td></tr>`).join("");
    $("ptab").innerHTML = `<thead>${head}</thead><tbody>${rows}</tbody>`;
  }

  // ------------------------------------------------------------------ καμπύλη απόκρισης
  let CURVE = null;
  function grid() {
    const mk = QBY[S.q].model, kind = KIND[mk];
    if (kind === "product") { const a = S.cat === "wm" ? [349, 999, 50] : [149, 549, 25]; return { key: "price_eur", alt: 0, xs: range(...a), lab: "Τιμή της προσφοράς A (€)" }; }
    if (kind === "refurb") { const iA = S.state.findIndex(s => s.id === "refurb_A"), iN = S.state.findIndex(s => s.id === "new"); const np = +S.state[iN].price_eur; return { key: "price_eur", alt: iA, xs: range(0, 80, 10).map(d => Math.round(np * (1 - d / 100) * 100) / 100), lab: `Τιμή του Refurbished A (€) · νέο ${eur(np)}` }; }
    const iD = S.state.findIndex(s => s.id === "drone"); return { key: "fee_eur", alt: iD, xs: range(0, 5, 0.25), lab: "Χρέωση drone (€)" };
  }
  function range(a, b, s) { const o = []; for (let x = a; x <= b + 1e-9; x += s) o.push(Math.round(x * 100) / 100); return o; }
  function curve() {
    const q = QBY[S.q], mk = q.model, gd = grid(), ppl = people();
    const ids = S.state.map(s => s.id), focus = focusAlt(ids);
    const series = [];
    const runAt = (x, aid) => { const st = S.state.map(s => ({ ...s })); st[gd.alt][gd.key] = x; return run(mk, q.context, st.map(s => enc(s.id, s, KIND[mk])), aid, S.q, ppl); };
    if ($("allAs").checked) {
      for (const aid of Object.keys(G.assumptions)) {
        const rs = gd.xs.map(x => runAt(x, aid));
        series.push({ name: `${aid} · ${focusName(focus)}`, color: AS_COL[aid], ys: rs.map(r => r.sim ? r.sim[focus] : null), dash: false });
      }
    } else {
      const rs = gd.xs.map(x => runAt(x, S.as));
      ids.forEach((id, j) => series.push({ name: `${ALT_NAME[id] || id} · κληρωμένες`, color: COLORS[j], ys: rs.map(r => r.sim ? r.sim[id] : null), dash: false }));
      series.push({ name: `${focusName(focus)} · μέση πιθανότητα`, color: "#52514e", ys: rs.map(r => r.mp ? r.mp[focus] : null), dash: true });
    }
    const nrej = series[0].ys.filter(y => y == null).length;
    $("curveNote").textContent = `${ppl.length} προφίλ · ${nrej ? nrej + " σημεία εκτός πεδίου εκπαίδευσης (δεν σχεδιάζονται)" : "όλα τα σημεία εντός πεδίου"}`;
    CURVE = { xs: gd.xs, lab: gd.lab, series };
    $("curve").innerHTML = lineSvg(CURVE);
    bindTips();
  }
  function focusName(f) { return ALT_NAME[f] || f; }
  function lineSvg(c) {
    const W = 1100, H = 340, L = 54, R = 16, T = 30, B = 46, pw = W - L - R, ph = H - T - B;
    const sx = i => L + pw * i / (c.xs.length - 1), sy = v => T + ph * (1 - v / 100);
    let o = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Καμπύλη απόκρισης"><rect width="${W}" height="${H}" fill="#ffffff"/>`;
    for (let t = 0; t <= 100; t += 20) o += `<line x1="${L}" x2="${L + pw}" y1="${sy(t)}" y2="${sy(t)}" stroke="#ecebe7"/><text x="${L - 8}" y="${sy(t) + 4}" text-anchor="end" font-size="11" fill="#6b7380">${t}%</text>`;
    const every = Math.ceil(c.xs.length / 12);
    c.xs.forEach((x, i) => { if (i % every === 0) o += `<text x="${sx(i)}" y="${H - 26}" text-anchor="middle" font-size="11" fill="#6b7380">${eur(x)}</text>`; });
    o += `<text x="${L + pw / 2}" y="${H - 6}" text-anchor="middle" font-size="11.5" fill="#52514e">${c.lab}</text>`;
    let lx = L;
    c.series.forEach(s => { o += `<line x1="${lx}" x2="${lx + 16}" y1="12" y2="12" stroke="${s.color}" stroke-width="3" ${s.dash ? 'stroke-dasharray="5 3"' : ""}/><text x="${lx + 21}" y="16" font-size="11.5" fill="#52514e">${s.name}</text>`; lx += 30 + s.name.length * 6.4; });
    c.series.forEach(s => {
      let path = "", pen = false;
      s.ys.forEach((y, i) => { if (y == null) { pen = false; return; } path += (pen ? "L" : "M") + sx(i).toFixed(1) + "," + sy(y).toFixed(1); pen = true; });
      o += `<path d="${path}" fill="none" stroke="${s.color}" stroke-width="${s.dash ? 1.6 : 2.2}" ${s.dash ? 'stroke-dasharray="5 4"' : ""}/>`;
      if (!s.dash) s.ys.forEach((y, i) => { if (y != null) o += `<circle class="pt" cx="${sx(i)}" cy="${sy(y)}" r="9" fill="transparent" data-t="${s.name} · ${eur(c.xs[i])}: ${fmt1(y)}%"/><circle cx="${sx(i)}" cy="${sy(y)}" r="3.6" fill="${s.color}" stroke="#fff" stroke-width="1.4" pointer-events="none"/>`; });
    });
    return o + "</svg>";
  }
  let tip;
  function bindTips() {
    if (!tip) { tip = document.createElement("div"); tip.className = "tip"; document.body.appendChild(tip); }
    document.querySelectorAll("#curve .pt").forEach(p => {
      p.onmousemove = e => { tip.style.display = "block"; tip.style.left = e.clientX + 12 + "px"; tip.style.top = e.clientY - 28 + "px"; tip.textContent = p.dataset.t; };
      p.onmouseleave = () => { tip.style.display = "none"; };
    });
  }
  function svgText() { return $("curve").innerHTML; }
  function curveCsv() {
    const head = ["x_eur", ...CURVE.series.map(s => '"' + s.name + '"')].join(",");
    return head + "\n" + CURVE.xs.map((x, i) => [x, ...CURVE.series.map(s => s.ys[i] == null ? "" : s.ys[i].toFixed(2))].join(",")).join("\n") + "\n";
  }
  function download(name, blob) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
  function pngExport() {
    const img = new Image(); const blob = new Blob([svgText()], { type: "image/svg+xml" }); const url = URL.createObjectURL(blob);
    img.onload = () => { const c = document.createElement("canvas"); c.width = 2200; c.height = 680; const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height); c.toBlob(b => download("greece500_curve.png", b)); URL.revokeObjectURL(url); };
    img.src = url;
  }

  initControls();
  setCat();
})();
