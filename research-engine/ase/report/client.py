"""Αναφορά πελάτη (ελληνικά) από results.csv / crosstabs.csv. Επαναχρησιμοποιήσιμη για κάθε μελέτη.

Περιεχόμενα: εξώφυλλο (τίτλος, πελάτης, περίοδος, ταυτότητα Lab, δήλωση συνθετικής μελέτης), σύνοψη, βασικά ευρήματα,
γραφήματα ανά ενότητα, συγκρίσεις σεναρίων, δημογραφικές διασταυρώσεις, συνθετικά τμήματα (όταν υπάρχουν ≥ 4 Likert),
επιχειρηματικές επιπτώσεις, συμπεράσματα, μεθοδολογία. Κάθε ράβδος γραφήματος φέρει data-qid/data-code/data-pct ώστε να
ελέγχεται αυτόματα η αντιστοίχιση με τα αποτελέσματα. Δεν εμφανίζεται περιθώριο σφάλματος· δεν εμφανίζονται πάροχοι LLM
ανά γράφημα (ανήκουν στο εσωτερικό audit)."""
from __future__ import annotations

import html
import json

import numpy as np
import pandas as pd

from ..study import DISCLOSURE, SYNTH_LABEL
from ..util import read_json, read_table

esc = html.escape
C = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"]   # επικυρωμένη κατηγορική παλέτα (dataviz)
VAR_GR = {"age_band": "Ηλικία", "gender": "Φύλο", "region": "Περιφέρεια", "income_quintile": "Εισοδηματικό πεμπτημόριο", "education": "Εκπαίδευση"}
LVL_GR = {"male": "Άνδρες", "female": "Γυναίκες", "less_than_primary": "Χωρίς πρωτοβάθμια", "primary": "Πρωτοβάθμια", "lower_secondary": "Γυμνάσιο",
          "upper_secondary": "Λύκειο", "tertiary": "Τριτοβάθμια"}


def f1(x):
    return f"{float(x):.1f}".replace(".", ",")


def hbar(qid, rows, maxv=100):
    """rows: [(code, label, pct)]"""
    W, L, RH = 720, 300, 26
    h = RH * len(rows) + 4
    o = [f'<svg class="chart" viewBox="0 0 {W} {h}" role="img" aria-label="Κατανομή απαντήσεων {esc(qid)}">']
    for i, (code, lab, pct) in enumerate(rows):
        y = 2 + i * RH
        w = max(1.5, (W - L - 70) * float(pct) / maxv)
        o.append(f'<g><title>{esc(lab)}: {f1(pct)}%</title><text x="{L - 10}" y="{y + RH * .64}" text-anchor="end" class="lbl">{esc(lab[:48])}</text>'
                 f'<rect data-qid="{esc(qid)}" data-code="{esc(str(code))}" data-pct="{pct}" x="{L}" y="{y + 5}" width="{w:.1f}" height="{RH - 10}" rx="3" fill="{C[0]}"/>'
                 f'<text x="{L + w + 8}" y="{y + RH * .66}" class="val">{f1(pct)}%</text></g>')
    o.append("</svg>")
    return "".join(o)


CSS = """
:root { --navy:#12263a; --teal:#0f766e; --ink:#16191d; --ink2:#4b5360; --muted:#8b939d; --line:#e4e6e9; --soft:#f6f5f1; color-scheme: light; }
* { box-sizing: border-box; } body { margin:0; background:#fff; color:var(--ink); font:13.5px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif; }
main { max-width: 900px; margin: 0 auto; padding: 0 28px 40px; }
@page { size: A4; margin: 16mm 0; }
@media print { .sec { break-before: page; } .card, table, svg { break-inside: avoid; } * { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
.cover { background: linear-gradient(160deg,#12263a 0%,#12263a 60%,#0f766e 140%); color:#fff; padding: 46px 40px 34px; margin: 0 -28px; min-height: 860px; display:flex; flex-direction:column; }
@page :first { margin: 0; }
@media print { .cover { margin: 0 -14mm; min-height: 297mm; padding: 26mm 20mm 18mm; break-after: page; } main { padding: 0 14mm; } @page { margin: 16mm 0; } }
.cover .k { font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:#c9d4de; } .cover h1 { font-size:40px; line-height:1.08; margin:90px 0 14px; }
.cover .sub { font-size:17px; color:#d7e2ea; } .cover .meta { margin-top:auto; display:grid; grid-template-columns:repeat(3,1fr); gap:12px; border-top:1px solid rgba(255,255,255,.25); padding-top:14px; }
.cover .meta span { display:block; font-size:10px; letter-spacing:.08em; text-transform:uppercase; color:#a8b8c6; } .cover .meta b { font-size:16px; }
.disc { margin-top:26px; background:rgba(255,255,255,.08); border-left:4px solid #5eead4; padding:12px 16px; font-size:13.5px; }
.synth { margin-top:22px; display:inline-block; background:#fff; color:#12263a; font-weight:800; letter-spacing:.04em; padding:8px 14px; border-radius:6px; font-size:14px; }
.synthbar { background:#12263a; color:#fff; text-align:center; font-weight:700; font-size:11px; letter-spacing:.06em; padding:5px; margin:18px -28px 0; }
.preview { background:#fdf1e3; color:#8a4b0f; border:1px solid #f0c98f; padding:10px 14px; border-radius:8px; font-weight:700; margin:14px 0; }
h2 { color:var(--navy); font-size:24px; margin:30px 0 6px; border-bottom:2px solid var(--navy); padding-bottom:6px; } h3 { color:var(--navy); font-size:15px; margin:18px 0 4px; }
.lead { font-size:15px; } .card { border:1px solid var(--line); border-radius:10px; padding:10px 14px; margin:10px 0; }
.chart { width:100%; height:auto; } .chart .lbl { font-size:12.5px; fill:var(--ink); } .chart .val { font-size:12.5px; font-weight:700; fill:var(--ink); }
.cap { font-size:10.5px; color:var(--muted); border-top:1px solid var(--line); padding-top:4px; margin-top:4px; }
table.t { width:100%; border-collapse:collapse; font-size:11.5px; font-variant-numeric:tabular-nums; margin:6px 0; } table.t th, table.t td { padding:4px 6px; border-bottom:1px solid var(--line); text-align:right; }
table.t th:first-child, table.t td:first-child { text-align:left; } table.t th { color:var(--ink2); border-bottom:1.5px solid var(--navy); font-size:10.5px; }
.kpis { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; } .kpi { border:1px solid var(--line); border-top:4px solid var(--teal); border-radius:8px; padding:10px 12px; }
.kpi b { font-size:22px; color:var(--navy); display:block; } .kpi span { font-size:11.5px; color:var(--ink2); }
ul.f li { margin-bottom:6px; } .meth { font-size:12.5px; } .quote { font-style:italic; color:var(--ink2); border-left:3px solid var(--line); padding-left:10px; margin:4px 0; }
"""


def _segments(study, run_id):
    df = study.responses(run_id)
    lik = [q.id for q in study.qn.questions if q.type == "likert"]
    if len(lik) < 4:
        return None
    d = df[(df["question_id"].isin(lik)) & (df["status"] == "ANSWERED")].copy()
    d["v"] = d["response"].map(lambda s: float(json.loads(s)))
    m = d.pivot_table(index="respondent_id", columns="question_id", values="v").dropna()
    if len(m) < 30:
        return None
    X = ((m - m.mean()) / m.std().replace(0, 1)).to_numpy()
    rng = np.random.default_rng(20261031)
    best = None
    for _ in range(10):
        Cc = X[rng.choice(len(X), 3, replace=False)]
        for _ in range(100):
            lab = np.argmin(((X[:, None] - Cc[None]) ** 2).sum(2), 1)
            Cc = np.array([X[lab == k].mean(0) if (lab == k).any() else Cc[k] for k in range(3)])
        sse = ((X - Cc[lab]) ** 2).sum()
        if best is None or sse < best[0]:
            best = (sse, lab)
    m["seg"] = best[1]
    qtext = {q.id: q.text for q in study.qn.questions}
    out = []
    for k, g in m.groupby("seg"):
        dev = (g[lik].mean() - m[lik].mean()).sort_values()
        out.append({"size_pct": round(100 * len(g) / len(m), 1), "higher": [qtext[i][:70] for i in dev.index[-2:][::-1]], "lower": [qtext[i][:70] for i in dev.index[:2]]})
    return sorted(out, key=lambda x: -x["size_pct"])


def render_report(study, run_id, res: pd.DataFrame, xt: pd.DataFrame, preview: bool, sensitivity: dict | None = None) -> str:
    cfg, rep = study.cfg, cfg_report(study.cfg)
    man = read_json(study.internal / "runs" / run_id / "execution_manifest.json")
    panel = read_json(study.internal / "panel_report.json")
    n = int((man.get("status_counts") or {}).get("COMPLETE", man["respondents_completed"]))   # ολοκληρωμένα ερωτηματολόγια
    n_prof = int(man["respondents_completed"])
    comp = man.get("completes")
    period = rep.get("period") or man["finished_at"][:10]
    P = []
    P.append(f'''<section class="cover"><div class="k">Greek Synthetic Research Lab · Adaptive Synthetic Research Engine</div>
<div class="synth">{SYNTH_LABEL}</div>
<h1>{esc(cfg["study"]["title"])}</h1><div class="sub">{esc(cfg["study"].get("subtitle", ""))}</div>
<div class="disc"><b>Σημαντικό:</b> {esc(DISCLOSURE)}</div>
{'<div class="preview">ΠΡΟΕΠΙΣΚΟΠΗΣΗ — DRY RUN / ΔΟΚΙΜΑΣΤΙΚΗ ΕΚΤΕΛΕΣΗ. Τα αποτελέσματα δεν αποτελούν ευρήματα της μελέτης.</div>' if preview else ''}
<div class="meta"><div><span>Πελάτης</span><b>{esc(cfg["study"].get("client", "—"))}</b></div><div><span>Περίοδος</span><b>{esc(period)}</b></div>
<div><span>Ολοκληρωμένα ερωτηματολόγια</span><b>{f"{n:,}".replace(",", ".")}</b></div></div></section>''')
    closed = res[res["type"].isin(["single_choice", "likert", "scenario", "dce", "multiple_choice", "ranking"])]
    finds = []
    for qid in (rep.get("key_questions") or list(dict.fromkeys(closed["question_id"]))[:6]):
        g = closed[closed["question_id"] == qid]
        if g.empty:
            continue
        top = g.sort_values("pct", ascending=False).iloc[0]
        qq = study.qn.by_id().get(qid)
        var = f" ({esc(qq.raw['variant_label'])})" if qq is not None and qq.raw.get("variant_label") else ""
        finds.append(f"Στην ερώτηση «{esc(top['question'])}»{var}, η συχνότερη απάντηση ήταν «{esc(top['option_label'])}» ({f1(top['pct'])}% των {int(top['n_base'])} συνθετικών ερωτωμένων).")
    P.append(f'''<section class="sec"><h2>Σύνοψη</h2><p class="lead">{esc(cfg["study"].get("summary_intro", "Η μελέτη προσομοιώνει πώς θα απαντούσαν συνθετικοί καταναλωτές με τα δημογραφικά χαρακτηριστικά του πληθυσμού-στόχου."))}</p>
<div class="kpis"><div class="kpi"><b>{n}</b><span>ολοκληρωμένα συνθετικά ερωτηματολόγια</span></div><div class="kpi"><b>{res["question_id"].nunique()}</b><span>ερωτήσεις με αποτελέσματα</span></div>
<div class="kpi"><b>{esc(geo_label(panel["target_population"]["geography"]))}</b><span>γεωγραφική κάλυψη</span></div></div>
<h3>Βασικά ευρήματα</h3><ul class="f">{"".join(f"<li>{x}</li>" for x in finds)}</ul></section>''')
    for b in study.qn.blocks:
        qs = [q for q in study.qn.questions if q.block == b["id"] and q.id in set(res["question_id"])]
        if not qs:
            continue
        body = [f'<section class="sec"><h2>{esc(b["title"])}</h2>']
        for q in qs:
            g = res[res["question_id"] == q.id]
            body.append(f'<div class="card"><h3>{esc(q.text)}</h3>')
            if q.scenario:
                body.append(f'<p class="cap" style="border:0">Υποθετικό σενάριο: {esc(q.scenario["text"])}</p>')
            if q.type in ("single_choice", "likert", "scenario", "dce", "multiple_choice", "ranking"):
                body.append(hbar(q.id, [(r.option_code, r.option_label, r.pct) for r in g.itertuples()]))
                note = {"multiple_choice": "% που επέλεξε κάθε επιλογή (πολλαπλές απαντήσεις)", "ranking": "% που κατέταξε κάθε στοιχείο πρώτο"}.get(q.type, "% των απαντήσεων")
                body.append(f'<div class="cap">{note} · βάση: {int(g["n_base"].iloc[0])} συνθετικοί ερωτώμενοι</div>')
            elif q.type == "numeric":
                st = dict(zip(g["option_code"], g["stat"]))
                body.append(f'<table class="t"><tr><th>Μέσος όρος</th><th>Διάμεσος</th><th>25ο εκατοστημόριο</th><th>75ο εκατοστημόριο</th></tr><tr><td>{f1(st["mean"])}</td><td>{f1(st["median"])}</td><td>{f1(st["p25"])}</td><td>{f1(st["p75"])}</td></tr></table>')
            elif q.type == "open":
                df = study.responses(run_id)
                ex = df[(df["question_id"] == q.id) & (df["status"] == "ANSWERED")]["response"].head(3).map(json.loads)
                body += [f'<div class="quote">«{esc(t)}»</div>' for t in ex]
                body.append(f'<div class="cap">Ενδεικτικές συνθετικές απαντήσεις · βάση: {int(g["n_base"].iloc[0])}</div>')
            body.append("</div>")
        body.append("</section>")
        P.append("".join(body))
    groups = {}
    for q in study.qn.questions:
        if q.raw.get("sensitivity_group") and q.id in set(res["question_id"]):
            groups.setdefault(q.raw["sensitivity_group"], []).append(q)
    if groups:
        S = ['<section class="sec"><h2>Σύγκριση σεναρίων</h2><p>Ίδια ερώτηση σε διαφορετικές παραλλαγές του υποθετικού σεναρίου.</p>']
        for gname, qs in groups.items():
            codes = [o for o in qs[0].options]
            S.append(f'<h3>{esc(gname)}</h3><table class="t"><tr><th>Παραλλαγή</th>' + "".join(f"<th>{esc(o.label[:28])}</th>" for o in codes) + "</tr>")
            for q in qs:
                g = res[res["question_id"] == q.id].set_index("option_code")
                S.append(f'<tr><td>{esc(q.raw.get("variant_label", q.id))}</td>' + "".join(f"<td>{f1(g.loc[o.code, 'pct']) if o.code in g.index else '—'}%</td>" for o in codes) + "</tr>")
            S.append("</table>")
        S.append('<div class="cap">% των απαντήσεων ανά παραλλαγή</div></section>')
        P.append("".join(S))
    xq = rep.get("crosstab_questions") or list(dict.fromkeys(closed[closed["type"].isin(["single_choice", "likert", "scenario"])]["question_id"]))[:3]
    if len(xt):
        X = ['<section class="sec"><h2>Δημογραφικές διασταυρώσεις</h2>']
        for qid in xq:
            q = study.qn.by_id().get(qid)
            g = res[res["question_id"] == qid]
            if q is None or g.empty:
                continue
            top = g.sort_values("pct", ascending=False).iloc[0]
            X.append(f'<h3>{esc(q.text)}</h3><p class="cap" style="border:0">% «{esc(top["option_label"])}» ανά ομάδα</p><table class="t"><tr><th>Ομάδα</th><th>Βάση</th><th>%</th></tr>')
            for var in ("age_band", "gender", "income_quintile"):
                s = xt[(xt["question_id"] == qid) & (xt["variable"] == var) & (xt["option_code"].astype(str) == str(top["option_code"]))]
                for r in s.itertuples():
                    X.append(f'<tr><td>{VAR_GR[var]}: {esc(LVL_GR.get(str(r.level), str(r.level)))}</td><td>{int(r.n_base)}</td><td>{f1(r.pct)}%</td></tr>')
            X.append("</table>")
        X.append('<div class="cap">Μικρές βάσεις υποομάδων δίνουν ασταθή ποσοστά· οι διαφορές πρέπει να ερμηνεύονται με προσοχή.</div></section>')
        P.append("".join(X))
    seg = _segments(study, run_id)
    if seg:
        P.append('<section class="sec"><h2>Συνθετικά καταναλωτικά τμήματα</h2><p>Ομαδοποίηση των συνθετικών ερωτωμένων με βάση τις απαντήσεις τους στις κλίμακες στάσεων.</p>'
                 + "".join(f'<div class="card"><h3>Τμήμα {i + 1} · {f1(s["size_pct"])}%</h3><p>Υψηλότερα από τον μέσο όρο: {esc("; ".join(s["higher"]))}<br>Χαμηλότερα: {esc("; ".join(s["lower"]))}</p></div>' for i, s in enumerate(seg))
                 + "</section>")
    if sensitivity:
        S = ['<section class="sec"><h2>Ευαισθησία συμπερασμάτων</h2><p>Για ερωτήσεις που αφορούν τη συγκεκριμένη μάρκα, δείχνουμε πόσο θα άλλαζε το μερίδιο των θετικών απαντήσεων '
             'αν η γενική στάση του κοινού απέναντι στη μάρκα ήταν χαμηλότερη ή υψηλότερη από αυτή που υποθέτει η προσομοίωση. Μικρό εύρος σημαίνει ότι το συμπέρασμα είναι σταθερό· '
             'μεγάλο εύρος σημαίνει ότι εξαρτάται από τη θέση της μάρκας στην αγορά, την οποία μια πραγματική μέτρηση θα προσδιόριζε.</p>',
             '<table class="t"><tr><th>Ερώτηση</th><th>Θετικές απαντήσεις</th><th>Χαμηλότερη βάση</th><th>Βασική εκτίμηση</th><th>Υψηλότερη βάση</th></tr>']
        qby = study.qn.by_id()
        for qid, v in sensitivity.items():
            sh = v["share_by_logit_shift"]
            S.append(f'<tr><td>{esc(qby[qid].text[:90])}</td><td>{esc(" / ".join(v["labels"])[:60])}</td><td>{f1(sh.get("-1.0", sh.get("-1")))}%</td>'
                     f'<td>{f1(sh.get("0.0", sh.get("0")))}%</td><td>{f1(sh.get("1.0", sh.get("1")))}%</td></tr>')
        S.append('</table><div class="cap">Χαμηλότερη/υψηλότερη βάση: μετατόπιση της στάσης απέναντι στη μάρκα κατά μία μονάδα στην κλίμακα logit. Δεν είναι διάστημα εμπιστοσύνης.</div></section>')
        P.append("".join(S))
    imp = rep.get("implications") or []
    con = rep.get("conclusions") or []
    P.append('<section class="sec"><h2>Επιχειρηματικές επιπτώσεις</h2>' + ("<ul class='f'>" + "".join(f"<li>{esc(x)}</li>" for x in imp) + "</ul>" if imp else
             "<p>Οι επιπτώσεις διατυπώνονται από την ερευνητική ομάδα μετά την πλήρη εκτέλεση και τον εσωτερικό έλεγχο ποιότητας.</p>")
             + "<h2>Συμπεράσματα</h2>" + ("<ul class='f'>" + "".join(f"<li>{esc(x)}</li>" for x in con) + "</ul>" if con else "<p>Βλ. βασικά ευρήματα.</p>") + "</section>")
    fm = panel["frame_manifest"]
    P.append(f'''<section class="sec meth"><h2>Μεθοδολογία</h2><p><b>{esc(DISCLOSURE)}</b></p>
<p><b>Συνθετικό πάνελ.</b> {n_prof} συνθετικά προφίλ ενηλίκων ({esc(str(panel["target_population"]["population"]))}). Τα δημογραφικά (ηλικία, φύλο, περιφέρεια, εκπαίδευση, νοικοκυριό, εισόδημα) προέρχονται από συνεκτικές εγγραφές του GLOPOP-S, βαθμονομημένες στον επίσημο πληθυσμό 2025 (Eurostat/ΕΛΣΤΑΤ), με δειγματοληψία quotas (μέγιστη απόκλιση από τους στόχους {f1(panel["max_abs_deviation_pp"])} μονάδες). {_sample_text(n, n_prof, comp)}</p>
<p><b>Προσομοίωση απαντήσεων.</b> Για κάθε ερώτηση, ένα μοντέλο τεχνητής νοημοσύνης εκτιμά πώς θα απαντούσε ένα πρόσωπο με το συγκεκριμένο προφίλ, με βάση το προφίλ, τις προηγούμενες απαντήσεις του και, όπου υπάρχει, δημόσιο ερευνητικό υπόβαθρο για το θέμα, το οποίο λειτουργεί ως πλαίσιο και όχι ως πηγή ποσοστών. Η απάντηση κάθε προσώπου επιλέγεται από αυτή την εκτίμηση με αναπαραγώγιμη τυχαιότητα. Ερωτήσεις για προσωπική εμπειρία απαντώνται ως υποθετικά χαρακτηριστικά σεναρίου. Όπου υπάρχει κατάλληλο εμπειρικό μοντέλο, χρησιμοποιείται εντός των ορίων του.</p>
<p><b>Ερμηνεία.</b> Τα ποσοστά περιγράφουν το συνθετικό πάνελ· δεν αποτελούν επαληθευμένες εκτιμήσεις του πραγματικού πληθυσμού και δεν συνοδεύονται από περιθώριο σφάλματος δειγματοληψίας. Η δημογραφική ομοιότητα του πάνελ με τον πληθυσμό δεν τεκμηριώνει την εγκυρότητα των απαντήσεων. Τα σενάρια για εταιρείες είναι υποθετικά ερευνητικά παραδείγματα και όχι περιγραφές πραγματικών πολιτικών.</p>
<p class="cap">Πηγές πληθυσμού: {esc(fm["glopop"]["attribution"])}; {esc("; ".join(s["source"] for s in fm["targets_sources"]))}.</p></section>''')
    return f'<!doctype html><html lang="el"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{esc(cfg["study"]["title"])}</title><style>{CSS}</style></head><body><main>{"".join(P)}<div class="synthbar">{SYNTH_LABEL}</div></main></body></html>'


def _sample_text(n, n_prof, comp) -> str:
    """Σύντομη, επαγγελματική περιγραφή του δείγματος (λεπτομέρειες αντικαταστάσεων μόνο στο εσωτερικό audit)."""
    if comp:
        basis = {"natural_incidence": "Η δημογραφική σύνθεση των ολοκληρωμένων ερωτηματολογίων προκύπτει από το κριτήριο συμμετοχής και δεν εξαναγκάστηκε στα quotas του γενικού πληθυσμού.",
                 "general_population": "Κάθε προφίλ που δεν πληρούσε το κριτήριο συμμετοχής αντικαταστάθηκε από προφίλ της ίδιας δημογραφικής ομάδας.",
                 "documented_target": "Η επιλογή των προφίλ στοχεύει στη δημογραφική σύνθεση του κοινού-στόχου όπως ορίστηκε στη μελέτη."}.get(comp.get("quota_basis"), "")
        return (f"Το δείγμα ορίστηκε σε ολοκληρωμένα ερωτηματολόγια: {n} ολοκληρωμένα από {n_prof} προφίλ, με αντικατάσταση όσων δεν πληρούσαν "
                f"το κριτήριο συμμετοχής. {basis}")
    if n != n_prof:
        return f"Από αυτά, {n} πληρούσαν το κριτήριο συμμετοχής και ολοκλήρωσαν το ερωτηματολόγιο."
    return ""


def geo_label(g):
    if isinstance(g, dict):
        return ", ".join(g.get("regions", [])) or "Πανελλαδική"
    return "Πανελλαδική" if g in (None, "nationwide") else str(g)


def cfg_report(cfg):
    return cfg.get("report") or {}
