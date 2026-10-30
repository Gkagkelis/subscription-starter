"""CCE — πίνακες επικύρωσης (markdown) απευθείας από τα artifacts και τα αρχεία ελέγχων, ώστε η τεκμηρίωση να μην
αντιγράφει αριθμούς με το χέρι.
    python3 -I cce_cli.py summarize artifacts/*.json
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

NAMES = {"majority": "Μερίδια πλειοψηφίας", "price_only_logit": "Logit μόνο τιμής", "conditional_logit": "Conditional logit (baseline)", "mixed_logit": "Mixed logit (candidate)"}


def f(x, d=3):
    return f"{x:.{d}f}".replace(".", ",")


def table(art):
    ev = art["validation"]["source_population"]["metrics"]
    ci = art["validation"]["source_population"]["bootstrap_test"]
    sel = art["selected"]
    L = [f"#### {art['model_id']} — {art['dataset']['manifest']['title']}",
         f"Δεδομένα: {art['dataset']['manifest']['n_respondents']} ερωτώμενοι, {art['dataset']['manifest']['n_situations']} καταστάσεις επιλογής · "
         f"split ανά ερωτώμενο train/val/test = {art['split']['train']}/{art['split']['validation']}/{art['split']['test']} · επιλέχθηκε στο validation: **{sel}** · "
         f"κατάσταση artifact: **{art['status']}**", "",
         "| Μοντέλο | Val log loss | Test log loss | Test accuracy | Test Brier | Test ECE |", "|---|---|---|---|---|---|"]
    for n in ("majority", "price_only_logit", "conditional_logit", "mixed_logit"):
        if n in ev:
            v, t = ev[n]["validation"], ev[n]["test"]
            mark = " ✔" if n == sel else ""
            L.append(f"| {NAMES[n]}{mark} | {f(v['log_loss'])} | {f(t['log_loss'])} | {f(t['accuracy'])} | {f(t['brier'])} | {f(t['ece'])} |")
    lo, hi = ci["chosen"]["log_loss_ci95"]
    L += ["", f"Test log loss επιλεγμένου: 95% CI (bootstrap ανά ερωτώμενο) [{f(lo)}, {f(hi)}]."]
    for k, v in ci.items():
        if k.startswith("vs_"):
            a, b = v["diff_ci95"]
            verdict = "καλύτερο" if b < 0 else ("χειρότερο" if a > 0 else "χωρίς στατιστικά σαφή διαφορά")
            L.append(f"- Διαφορά έναντι {NAMES[k[3:]]}: {f(v['diff_vs_other'])} [{f(a)}, {f(b)}] → {verdict}.")
    return "\n".join(L)


def wtp(art, price_feat):
    """WTP από το conditional logit (σταθεροί συντελεστές): −β_k / β_τιμής, σε μονάδες τιμής του dataset."""
    cl = art["candidates"]["conditional_logit"]
    b = dict(zip(cl["features"], cl["coef"]))
    return {k: -v / b[price_feat] for k, v in b.items() if k != price_feat and not k.startswith("asc")}


def checks_table(paths):
    L = ["| Artifact | A επισκευή | B trade-in | C εγγύηση | D παράδοση | Τιμή (μονοτονία) | E κυριαρχία | F επαναληψιμότητα | Ελλ. σενάριο επισκευής | Ατομική συνέπεια πάνελ (500) |",
         "|---|---|---|---|---|---|---|---|---|---|"]
    for p in paths:
        c = json.loads(Path(p).read_text(encoding="utf-8"))
        b = c["behavior"]
        price = next((b[k]["status"] for k in b if k not in ("A_repair_cost", "B_trade_in", "C_warranty", "D_delivery", "E_dominance", "F_repeatability")), "—")
        pc = c.get("panel_consistency", {})
        L.append(f"| {c['model_id']} | {b['A_repair_cost']['status']} | {b['B_trade_in']['status']} | {b['C_warranty']['status']} | {b['D_delivery']['status']} | {price} | "
                 f"{b['E_dominance']['status']} | {b['F_repeatability']['status']} | {c['greek_repair_scenario']['status']} | {pc.get('status')} ({pc.get('respondents_with_reversal')} αντιστροφές) |")
    return "\n".join(L)


if __name__ == "__main__":
    arts = [json.loads(Path(p).read_text(encoding="utf-8")) for p in sys.argv[1:]]
    for a in arts:
        print(table(a), "\n")
    print(checks_table([Path(p).parent / "checks" / f"{json.loads(Path(p).read_text(encoding='utf-8'))['model_id']}.checks.json" for p in sys.argv[1:]]))
    print()
    for a in arts:
        pf = next((t["col"] for t in a["terms"] if t.get("col", "").startswith("price") or t.get("col") == "fee_usd"), None)
        if pf:
            print(a["model_id"], {k: round(v, 2) for k, v in wtp(a, pf).items()})
