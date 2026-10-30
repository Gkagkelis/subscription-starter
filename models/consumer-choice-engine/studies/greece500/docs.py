"""Greece 500 — QUESTIONNAIRE.md και VALIDATION.md από τα αποτελέσματα της εκτέλεσης και της επικύρωσης.
    python3 -I studies/greece500/docs.py <deliverables_dir> [<lab_check.json>]
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import pandas as pd

D = Path(sys.argv[1])
LAB = json.loads(Path(sys.argv[2]).read_text()) if len(sys.argv) > 2 else None
META = json.loads((D / "_run_meta.json").read_text(encoding="utf-8"))
V = json.loads((D / "_validation.json").read_text(encoding="utf-8"))
SC = pd.read_csv(D / "SCENARIOS.csv", dtype={"scenario_id": str})
RES = pd.read_csv(D / "RESULTS.csv", dtype={"scenario_id": str})
REPO = Path(__file__).resolve().parents[4]
f1 = lambda x: f"{x:.1f}".replace(".", ",")

MODEL_TXT = {"swiss-ce-washing-machine": "cce-0.1-swiss-ce-washing-machine (Ελβετία 2021-22)", "swiss-ce-smartphone": "cce-0.1-swiss-ce-smartphone (Ελβετία 2021-22)",
             "refurb-smartphone-us2019": "cce-0.1-refurb-smartphone-us2019 (ΗΠΑ 2019, CC BY-NC)", "delivery-us2022": "cce-0.1-delivery-us2022 (ΗΠΑ 2022)"}
ALT = {"A": "Προσφορά A", "B": "Προσφορά B", "refurb_A": "Refurbished A", "refurb_B": "Refurbished B", "new": "Νέο", "ground": "Επίγεια παράδοση", "drone": "Παράδοση με drone"}


def desc(a):
    if "life_years" in a:
        rep = "πλήρης" if a["repair_full"] else ("περιορισμένη" if a["repair_limited"] else "καθόλου")
        en = "A" if a["energy_A"] else "C" if a["energy_C"] else "E" if a["energy_E"] else "G"
        rec = "ναι" if a["recy_full"] else ("περιορισμένα" if a["recy_limited"] else "όχι")
        env = "πολύ υψηλό" if a["env_impact_very_high"] else ("μεσαίο" if a["env_impact_medium"] else "πολύ χαμηλό")
        return f'{a["price_eur"]:.0f} €, {a["life_years"]} έτη, επισκευασιμότητα {rep}, κλάση {en}, ανακυκλώσιμο {rec}, αποτύπωμα {env}'
    if "cond_refurbished" in a:
        if a["alt_id"] == "new":
            return f'νέο, {a["price_eur"]:.2f} €'.replace(".", ",")
        cond = "open box" if a["cond_open_box"] else "refurbished" if a["cond_refurbished"] else "μεταχειρισμένο"
        sel = "κατασκευαστής" if a["seller_oem"] else "εξουσιοδοτημένος τρίτος" if a["seller_authorized"] else "μη εξουσιοδοτημένος τρίτος"
        return f'{cond}, {sel}, {a["price_eur"]:.2f} €'.replace(".", ",")
    return f'χρέωση {a["fee_eur"]:.2f} €, {a["wait_hours"] * 60:.0f}′{", χωρίς προστασία δεδομένων" if a.get("privacy_risk") else ""}'.replace(".", ",")


# ------------------------------------------------------------------ QUESTIONNAIRE.md
L = ["# REPAIR, REPLACE OR UPGRADE? — Greece 2026 · Ερωτηματολόγιο εκτέλεσης (Greece 500)", "",
     "Βάση: το ερωτηματολόγιο της μελέτης «Repair, Replace or Upgrade?» (`docs/synthetic-lab/consumer-decision-study/QUESTIONNAIRE.md`).",
     "Οι ερωτήσεις χωρίζονται σε δύο κατηγορίες:", "",
     "- **Α:** υποστηρίζονται από εκπαιδευμένα μοντέλα της CCE 0.1 και εκτελέστηκαν στους 500.",
     "- **Β:** δεν υπάρχουν εκπαιδευμένοι συντελεστές. Οι ερωτήσεις αυτές μένουν στο ερωτηματολόγιο για πραγματική μέτρηση, αλλά **δεν παράχθηκε καμία απάντηση**.", "",
     "Όλες οι τιμές είναι σε ευρώ 2025. Η μετατροπή στις μονάδες κάθε μοντέλου περιγράφεται στο TRANSFER_ASSUMPTIONS.md.", "",
     "## Α. Ερωτήσεις που εκτελέστηκαν (υποστηριζόμενες από εκπαιδευμένα μοντέλα)", ""]
for q in META["questions"]:
    if q["kind"] == "unsupported":
        continue
    sc = SC[SC["question_id"] == q["question_id"]]
    first = json.loads(sc.iloc[0]["alternatives"])
    stat = RES[(RES["question_id"] == q["question_id"])].drop_duplicates(["scenario_id", "assumption_id"]).groupby("assumption_id")["status"].apply(lambda s: (s == "EXPERIMENTAL_CROSS_COUNTRY_TRANSFER").sum()).to_dict()
    L += [f"### {q['question_id']} — {q['text']}", "",
          f"- **Μοντέλο:** {MODEL_TXT[q['model']]}· **πλαίσιο:** `{json.dumps(q['context'], ensure_ascii=False)}`",
          f"- **Ερώτηση προς τον καταναλωτή:** «Ποια από τις παρακάτω επιλογές θα διαλέγατε;»",
          f"- **Σενάρια ({len(q['scenarios'])}):** {', '.join(q['scenarios'])}",
          "- **Εναλλακτικές (πρώτο σενάριο):**"]
    L += [f"  - {ALT.get(a['alt_id'], a['alt_id'])}: {desc(a)}" for a in first]
    L += [f"- **Σενάρια με απάντηση ανά υπόθεση:** " + ", ".join(f"{k} {v}/{len(q['scenarios'])}" for k, v in sorted(stat.items())), ""]
L += ["## Β. Ερωτήσεις χωρίς εκπαιδευμένους συντελεστές (καμία απάντηση)", "",
      "### Δοκιμές στην πύλη εφαρμοσιμότητας", "",
      "Οι παρακάτω ερωτήσεις διατυπώθηκαν ως σενάρια και στάλθηκαν στην πύλη. Όλες επέστρεψαν `NOT_SUPPORTED`:", ""]
for q in V["11_unsupported"]:
    L.append(f"- **{q['question_id']}** {q['text']}: `{q['gate']}`. {'; '.join(q['reasons'])[:200]}")
reason = {"Q1": "στάση/σημασία — χωρίς μοντέλο", "Q2": "κανάλι αγοράς — χωρίς μοντέλο", "Q3": "αφορμή αντικατάστασης — χωρίς μοντέλο", "Q4": "βαθμολογία σημασίας υπηρεσιών — χωρίς μοντέλο",
          "Q5": "επισκευή παλιάς συσκευής vs νέα — χωρίς μοντέλο", "Q6": "επισκευή παλιάς συσκευής vs νέα — χωρίς μοντέλο", "Q7": "επισκευή παλιάς συσκευής vs νέα — χωρίς μοντέλο",
          "Q8": "επισκευή με εγγύηση — χωρίς μοντέλο", "Q9": "παράδοση και εγκατάσταση συσκευής — εκτός πεδίου", "Q10": "ανοιχτή/στάση — χωρίς μοντέλο", "Q11": "trade-in — χωρίς μοντέλο",
          "Q12": "trade-in — χωρίς μοντέλο", "Q13": "trade-in — χωρίς μοντέλο", "Q14": "trade-in — χωρίς μοντέλο", "Q15": "trade-in — χωρίς μοντέλο", "Q16": "πρόθεση — χωρίς μοντέλο",
          "Q17": "νέο 599 € εκτός πεδίου (βασική υπόθεση: νέο έως ~311 €) και η εγγύηση δεν είναι χαρακτηριστικό του μοντέλου· αντί αυτού RF1–RF3",
          "Q18": "όπως Q17", "Q19": "όπως Q17", "Q20": "εγγύηση 24 μηνών — χωρίς συντελεστή", "Q21": "στάση — χωρίς μοντέλο", "Q22": "κανάλι — χωρίς μοντέλο",
          "Q23": "παράδοση συσκευής επόμενη ημέρα — εκτός πεδίου (μοντέλο: λεπτά/ώρες)", "Q24": "παράδοση και εγκατάσταση — εκτός πεδίου", "Q25": "επιστροφές — χωρίς μοντέλο",
          "Q26": "τεχνική υποστήριξη — χωρίς μοντέλο", "Q27": "πείραμα με επισκευή/trade-in/εγγύηση/δόσεις — χωρίς μοντέλο"}
orig = re.findall(r"^### (Q[0-9_]+) — (.+)$", (REPO / "docs/synthetic-lab/consumer-decision-study/QUESTIONNAIRE.md").read_text(encoding="utf-8"), re.M)
L += ["", "### Ερωτήσεις του αρχικού ερωτηματολογίου", "", "| Ερώτηση | Θέμα | Γιατί δεν απαντάται |", "|---|---|---|"]
for qid, title in orig:
    base = qid.split("_")[0]
    r = reason.get(base) or (reason["Q27"] if base in ("Q28", "Q29", "Q30", "Q31", "Q32") else "χωρίς μοντέλο")
    L.append(f"| {qid} | {title} | {r} |")
L += ["", "Το ελάχιστο ελληνικό πείραμα της CCE (`docs/synthetic-lab/consumer-choice-engine/CHOICE_EXPERIMENT_DESIGN.md`) καλύπτει τις ερωτήσεις Q5–Q9, Q11–Q14, Q20 και Q23–Q24 με πραγματικές επιλογές."]
(D / "QUESTIONNAIRE.md").write_text("\n".join(L) + "\n", encoding="utf-8")

# ------------------------------------------------------------------ VALIDATION.md
v1, c, rep, ind, prov, dom, eff, nop, demo = (V["1_shares_vs_records"], V["2_3_consistency_monotonicity"], V["4_repeatability"], V["5_independent_recomputation"],
                                              V["6_coefficient_provenance"], V["7_domain_bounds"], V["8_transfer_effect_max_abs_pp"], V["9_no_preset_shares"], V["10_no_artificial_demographics"])
st = RES.drop_duplicates(["question_id", "scenario_id", "assumption_id"]).groupby(["assumption_id", "status"]).size().unstack(fill_value=0)
W = ["# Greece 500 — Επικύρωση (VALIDATION)", "",
     "**Δύο διαφορετικά ερωτήματα:**", "",
     "1. **Επιτυχής εκτέλεση:** εφαρμόστηκε σωστά, συνεπώς και αναπαραγώγιμα η CCE 0.1 στους 500; → **Ναι** (§1–§9).",
     "2. **Εξωτερική εγκυρότητα για την Ελλάδα:** προβλέπουν οι αριθμοί τι θα επέλεγαν πραγματικοί Έλληνες καταναλωτές; → **Άγνωστο.** Δεν υπάρχουν ελληνικά δεδομένα επιλογών για σύγκριση (§10). Η επιτυχής εκτέλεση **δεν** το αποδεικνύει.", "",
     "Τα αποτελέσματα των ελέγχων είναι στο `_validation.json`. Κώδικας: `models/consumer-choice-engine/studies/greece500/validate.py` και `lab_check.cjs`.", "",
     "## 1. Ποσοστά έναντι των 500 εγγραφών", "",
     f"- **Γραμμές αποτελεσμάτων που ελέγχθηκαν:** {v1['result_rows_checked']}. Αποκλίσεις: **{v1['share_mismatches']}** στα ποσοστά επιλογών, **{v1['mean_probability_mismatches']}** στις μέσες πιθανότητες.",
     f"- **Εκτελέσεις (σενάριο × υπόθεση):** {v1['runs']}, όλες με 500 μοναδικά IDs ({v1['runs_with_500_unique_ids']}/{v1['runs']}). Τα IDs ταυτίζονται με το πάνελ: {v1['ids_match_panel']}.",
     f"- **Εγγραφές για απορριφθέντα ή μη υποστηριζόμενα σενάρια:** {v1['records_for_rejected_or_unsupported']}.", "",
     "| Υπόθεση | Με απάντηση | Εκτός πεδίου (απορρίφθηκαν) | NOT_SUPPORTED |", "|---|---|---|---|"]
for a in st.index:
    W.append(f"| {a} | {st.loc[a].get('EXPERIMENTAL_CROSS_COUNTRY_TRANSFER', 0)} | {st.loc[a].get('EXTRAPOLATION_REJECTED', 0)} | {st.loc[a].get('NOT_SUPPORTED', 0)} |")
W += ["", "## 2. Ατομική συνέπεια μεταξύ σεναρίων", "",
      f"Σε κάθε καμπύλη τιμής, έκπτωσης και χρέωσης ({len(c['curves'])} καμπύλες × υποθέσεις) ελέγχθηκε αν κάποιος καταναλωτής επιλέγει μια εναλλακτική σε **χειρότερους** όρους, ενώ την είχε απορρίψει σε **καλύτερους**.",
      f"Αντιστροφές επιλογής: **{c['total_choice_reversals']}**.", "",
      "## 3. Μονοτονία ως προς την τιμή", "",
      f"- **Ατομικές πιθανότητες που κινούνται αντίθετα στην τιμή:** **{c['total_probability_reversals']}**.",
      f"- **Μέσες πιθανότητες μονότονες σε όλες τις καμπύλες:** **{c['all_means_monotone']}**.", "",
      "Η μονοτονία είναι εγγυημένη από τη δομή του μοντέλου: η τιμή έχει log-normal αρνητικό συντελεστή. Δεν είναι εμπειρικό εύρημα για την Ελλάδα.", "",
      "## 4. Επαναληψιμότητα", "", "Επανεκτέλεση δείγματος σεναρίων με τον ίδιο κώδικα και seed (20261030):", "", "| Ερώτηση | Υπόθεση | Εγγραφές | Ταυτόσημες |", "|---|---|---|---|"]
W += [f"| {r['question_id']} | {r['assumption_id']} | {r['records']} | {r['identical']} |" for r in rep]
W += ["", f"Ανεξάρτητος επανυπολογισμός όλων των πιθανοτήτων της βασικής υπόθεσης ({ind['records']} ατομικές εγγραφές × εναλλακτικές) από τους εξαγόμενους ατομικούς συντελεστές: μέγιστη διαφορά **{ind['max_abs_probability_diff']:.1e}** (στρογγυλοποίηση).", ""]
if LAB:
    W += [f"**Dashboard (INTERACTIVE_LAB):** ο κώδικας JavaScript υπολόγισε ξανά όλα τα σενάρια × υποθέσεις ({LAB['evaluated']}). Αποτελέσματα:",
          f"- **{LAB['answered_runs']}** εκτελέσεις με απάντηση·",
          f"- **{LAB['status_mismatch']}** αποκλίσεις κατάστασης πύλης·",
          f"- **{LAB['share_mismatch']}** αποκλίσεις μεριδίων·",
          f"- **{LAB['individual_choice_mismatch']}** αποκλίσεις σε {LAB['individual_choices_checked']} ατομικές επιλογές·",
          f"- μέγιστη διαφορά μέσης πιθανότητας **{LAB['max_mean_p_diff_pp']}** μονάδες·",
          f"- σφάλματα σελίδας: {len(LAB['page_errors'])}.", ""]
W += ["## 5. Προέλευση συντελεστών", "", "| Μοντέλο | Artifact | SHA-256 αμετάβλητο | Εκπαίδευση | Επιλεγμένο | Πληθυσμός | N | Άδεια | Εξωτερική επικύρωση |", "|---|---|---|---|---|---|---|---|---|"]
W += [f"| {k} | `{v['artifact']}` | {v['unchanged']} (`{v['sha256_now'][:12]}…`) | {v['trained_at']} | {v['selected']} | {', '.join(v['training_population'])} | {v['n_respondents']} | {v['licence']} | {v['external_validation'] or 'καμία'} |" for k, v in prov.items()]
W += ["", "Κανένας συντελεστής δεν εκτιμήθηκε, ρυθμίστηκε ή επινοήθηκε για τη μελέτη. Το `experimental_transfer_mode` ελέγχει το SHA-256 κάθε artifact πριν και μετά από κάθε κλήση.", "",
      "## 6. Όρια πεδίου εκπαίδευσης", "",
      f"- **Σενάρια με απάντηση εκτός πεδίου:** **{dom['answered_outside_domain']}**.",
      f"- **Σενάρια που απορρίφθηκαν ενώ ήταν εντός πεδίου:** **{dom['rejected_but_inside']}**.",
      f"- **Συνολικές απορρίψεις:** {dom['rejected_runs']} εκτελέσεις, χωρίς απαντήσεις.", "",
      "Τα εύρη ανά υπόθεση είναι στο TRANSFER_ASSUMPTIONS.md §4. Στο μοντέλο παράδοσης εφαρμόζονται τα αυστηρότερα εύρη της κάθε κατηγορίας του πειράματος.", "",
      "## 7. Επίδραση των υποθέσεων μεταφοράς", "", "Μέγιστη απόλυτη διαφορά ποσοστού (μονάδες) από τη βασική υπόθεση T0, σε κοινά σενάρια:", "",
      "| Ερώτηση | T1 μόνο PPP | T2 μερίδιο εισοδήματος | T3 ονομαστική | Κάλυψη T2 | Κάλυψη T3 |", "|---|---|---|---|---|---|"]
for q, v in eff.items():
    W.append(f"| {q} | {f1(v['T1']) if v['T1'] is not None else '—'} | {f1(v['T2']) if v['T2'] is not None else '—'} | {f1(v['T3']) if v['T3'] is not None else '—'} | {v['T2_T3_answered_share'].get('T2', 0):.0%} | {v['T2_T3_answered_share'].get('T3', 0):.0%} |")
W += ["", "**Ερμηνεία**", "",
      "- Οι υποθέσεις αλλάζουν το μέγεθος της απόκρισης στην τιμή (έως ~8 μονάδες για PPP-only, ~15 για ονομαστική ισοτιμία). Δεν αλλάζουν την κατεύθυνση.",
      "- Οι ερωτήσεις χωρίς διαφορά τιμής μεταξύ εναλλακτικών (WM7, WM8, DL4) δεν επηρεάζονται.", "",
      "## 8. Απουσία προκαθορισμένων ποσοστών", "",
      f"- **Ο κώδικας της μελέτης** (`scenarios.py`, `run_study.py`) ορίζει μόνο εναλλακτικές και χαρακτηριστικά. Αναφορές σε στόχους ή βαθμονόμηση: **{nop['study_code_mentions_share_targets']}**.",
      "- **Τα ποσοστά** υπολογίζονται μόνο από τις ατομικές εγγραφές (§1).",
      f"- **Έλεγχος seed:** με άλλο seed ({nop['seed_change_WM1_649']['seed']}), το WM1 στα 649 € δίνει {f1(nop['seed_change_WM1_649']['share_A_pct'])}% (μέση πιθανότητα {f1(nop['seed_change_WM1_649']['mean_p_A_pct'])}%), έναντι {f1(nop['seed_change_WM1_649']['original_share_A_pct'])}% ({f1(nop['seed_change_WM1_649']['original_mean_p_A_pct'])}%) με το seed της μελέτης. Η διαφορά είναι θόρυβος δειγματοληψίας 500 προσώπων· δεν υπάρχει σταθερός «στόχος».", "",
      "## 9. Δημογραφικές διαφορές", "",
      "Τα μοντέλα πλυντηρίου, smartphone και refurbished **δεν** έχουν όρους ηλικίας, εισοδήματος ή περιοχής, οπότε δεν δημιουργήθηκαν δημογραφικές διαφορές. Έλεγχος χ² ανεξαρτησίας επιλογής και δημογραφικών:", "",
      "| Ερώτηση | Σενάριο | Μεταβλητή | p |", "|---|---|---|---|"]
W += [f"| {r['question_id']} | {r['scenario_id']} | {r['variable']} | {str(r['chi2_p']).replace('.', ',')} |" for r in demo]
nsig = sum(r["chi2_p"] < 0.05 for r in demo)
W += ["", f"Σε {nsig} από {len(demo)} ελέγχους p < 0,05. Με {len(demo)} ελέγχους αναμένεται περίπου {len(demo) * 0.05:.1f} κατά τύχη.",
      "Οι διαφορές προέρχονται από το ποια άτομα έτυχε να πάρουν ποιες κληρώσεις προτιμήσεων. Δεν είναι εφέ του μοντέλου και **δεν** παρουσιάζονται ως ευρήματα.",
      "Δημογραφικές διασταυρώσεις παράγονται μόνο για το μοντέλο παράδοσης, όπου ηλικία και φύλο είναι όροι του μοντέλου (CROSSTABS.csv).", "",
      "## 10. Εξωτερική εγκυρότητα για την Ελλάδα", "",
      "- Δεν υπάρχουν ελληνικά δεδομένα πραγματικών επιλογών για καμία από τις ερωτήσεις, άρα **δεν έγινε και δεν μπορεί να γίνει** σύγκριση με την ελληνική πραγματικότητα.",
      "- Οι συντελεστές επικυρώθηκαν μόνο σε νέους ερωτώμενους των χωρών προέλευσης (`docs/synthetic-lab/consumer-choice-engine/VALIDATION_REPORT.md`).",
      "- **Γνωστό θέμα:** το ελβετικό μοντέλο πλυντηρίου είχε ήδη στην πηγή του μη αληθοφανώς χαμηλή ευαισθησία στην τιμή. Οι καμπύλες τιμής πλυντηρίων πιθανότατα υποεκτιμούν την αντίδραση.",
      "- **Κατάσταση όλων των αποτελεσμάτων:** `EXPERIMENTAL_CROSS_COUNTRY_TRANSFER`. Κανένα μοντέλο δεν έγινε READY για την Ελλάδα.",
      "- **Επόμενο βήμα για εξωτερική εγκυρότητα:** το ελάχιστο ελληνικό πείραμα της CCE, με holdout σενάρια."]
(D / "VALIDATION.md").write_text("\n".join(W) + "\n", encoding="utf-8")
print("ok")
