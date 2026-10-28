"""Παράγει το tidy/README.md (ελληνικά) από τα tidy CSV και τα manifest.

Χρήση: python3 -I make_readme.py <raw_political_dir>
"""

import csv
import json
import os
import sys
from collections import defaultdict

LEVELS = ["national", "region", "constituency", "municipality"]


def read(p):
    return list(csv.DictReader(open(p, encoding="utf-8"))) if os.path.exists(p) else []


def main():
    raw = sys.argv[1]
    tidy = os.path.join(raw, "tidy")
    polls = read(os.path.join(tidy, "polls_toplines.csv"))
    res = read(os.path.join(tidy, "election_results.csv"))
    turn = read(os.path.join(tidy, "turnout.csv"))
    acc = read(os.path.join(tidy, "poll_accuracy_check.csv"))
    val = read(os.path.join(tidy, "polls_validation.csv"))
    dups = read(os.path.join(tidy, "polls_duplicates_removed.csv"))
    pm = read(os.path.join(tidy, "party_map.csv"))
    cc = read(os.path.join(tidy, "election_results_crosscheck_parlgov.csv"))

    per = defaultdict(lambda: defaultdict(set))
    pollsters_all = set()
    pollsters_ctx = defaultdict(set)
    for r in polls:
        if r["pollster"] == "ELECTION":
            continue
        per[r["election_context"]][r["measure"]].add(r["poll_id"])
        pollsters_ctx[r["election_context"]].add(r.get("pollster_norm") or r["pollster"])
        pollsters_all.add(r.get("pollster_norm") or r["pollster"])
    measures = sorted({m for d in per.values() for m in d})
    n_polls = len({(r["poll_id"]) for r in polls if r["pollster"] != "ELECTION"})

    rc = defaultdict(lambda: defaultdict(set))
    rsrc = defaultdict(lambda: defaultdict(set))
    for r in res:
        rc[r["election_id"]][r["level"]].add(r["unit_code"])
        rsrc[r["election_id"]][r["level"]].add(r["source"].replace("wikipedia:", "wp:"))
    tset = {t["election_id"] for t in turn}

    attrib = []
    for sub in ("polls", "elections"):
        mp = os.path.join(raw, sub, "manifest.json")
        if os.path.exists(mp):
            for it in json.load(open(mp, encoding="utf-8"))["files"]:
                if it["file"].startswith("wikipedia"):
                    attrib.append((it.get("title"), it.get("wiki"), it.get("revid"), it.get("page_url")))
    attrib.sort(key=lambda x: (x[1] or "", x[0] or ""))
    curated = sum(1 for r in pm if r["curated"] == "yes")
    auto = sum(1 for r in pm if r["curated"] != "yes")

    L = []
    w = L.append
    w("# Ελληνικές δημοσκοπήσεις & εκλογικά αποτελέσματα (2000–σήμερα) — tidy datasets\n")
    w("Παράγεται αυτόματα από `scripts/synthetic-lab/political/polls_elections/run_all.sh` "
      "(μία εντολή, αναπαραγώγιμη). Μην το επεξεργάζεστε με το χέρι.\n")
    w("## Τι περιέχει\n")
    w("| Αρχείο | Περιεχόμενο |\n|---|---|")
    w("| `polls_toplines.csv` | Long format: μία γραμμή ανά δημοσκόπηση × μέτρο × επιλογή (κόμμα/αρχηγό). "
      "Περιλαμβάνει και τις γραμμές αποτελεσμάτων που υπάρχουν στους πίνακες της Wikipedia με `pollster=ELECTION`. |")
    w("| `party_map.csv` | Αντιστοίχιση ετικετών → `party_key` (επιμελημένη λίστα κομμάτων από το 2000, με χρονικά όρια για διφορούμενες συντομογραφίες, π.χ. ΔΗΣΥ 2012 ≠ ΔΗΣΥ 2015· `lineage_key` για οικογένειες: ΠΑΣΟΚ→Ελιά→ΔΗΣΥ→ΚΙΝΑΛ→ΠΑΣΟΚ-ΚΙΝΑΛ, ΣΥΝ→ΣΥΡΙΖΑ). "
      f"{curated} επιμελημένες εγγραφές + {auto} αυτόματες (`curated=no`, μικρά/νέα κόμματα). |")
    w("| `election_results.csv` | Αποτελέσματα ανά εκλογή × επίπεδο (national/region/constituency) × κόμμα: ψήφοι, % επί εγκύρων, έδρες. |")
    w("| `turnout.csv` | Εγγεγραμμένοι, ψηφίσαντες, έγκυρα, άκυρα/λευκά, συμμετοχή (εθνικό επίπεδο). |")
    w("| `poll_accuracy_check.csv` | Έλεγχος λογικής: μέσο απόλυτο σφάλμα (MAE) των τελευταίων δημοσκοπήσεων πριν από κάθε εκλογή. |")
    w("| `polls_validation.csv` | Δημοσκοπήσεις με πρόβλημα αθροίσματος (≠~100) ή ημερομηνίας. |")
    w("| `polls_duplicates_removed.csv` | Ακριβή διπλότυπα (ίδια εταιρεία/ημερομηνία/τιμές σε άλλη σελίδα) που αφαιρέθηκαν. |")
    w("| `election_results_crosscheck_parlgov.csv` | Σύγκριση εθνικών ποσοστών/εδρών Wikipedia vs ParlGov. |")
    w("| `coverage_polls.csv`, `coverage_results.csv` | Πίνακες κάλυψης. |\n")

    w("### Βασικές στήλες `polls_toplines.csv`\n")
    w("- `source_page`, `source_wiki` (en/el), `source_revid`, `source_url` (permalink στην ακριβή αναθεώρηση)\n"
      "- `election_context` (π.χ. `GR_parl_2019-07-07`, `GR_ep_2024-06-09`, `GR_ref_2015-07-05`, `GR_parl_next`)\n"
      "- `pollster`, `client` (ανάθεση/μέσο), `fieldwork_start`, `fieldwork_end` (ISO· αν δίνεται μία ημερομηνία, ίδιες), `sample_size`\n"
      "- `measure`: `vote_estimate` (εκτίμηση ψήφου), `vote_intention_raw` (πρόθεση ψήφου με αναποφάσιστους), "
      "`other:seat_projection` (έδρες στο `value_seats`), `other:referendum_vote` / `other:referendum_vote_decided_only`, "
      "`election_result` / `election_seats` (γραμμές ELECTION)\n"
      "- `option` (αρχική ετικέτα), `party_key` (κανονικοποιημένο), `value_pct`, `value_seats`, `undecided_pct`\n"
      "- `scope` (national/regional), `scenario` (1 = υποθετικά σενάρια νέων κομμάτων), `poll_type` "
      "(poll / exit_poll / election_night_projection / aggregator / election)\n"
      "- Έλεγχοι: `poll_sum_pct`, `sum_flag`, `date_flag`, `possible_duplicate_of` (ίδια εταιρεία+ημερομηνία, διαφορετικές τιμές — συνήθως en vs el εκδοχή)\n"
      "- `notes`: π.χ. `measure_inferred_from_row_sums` (η σελίδα δεν δηλώνει ρητά εκτίμηση/πρόθεση· "
      "ταξινομήθηκε από το άθροισμα ~100 → εκτίμηση), εύρη τιμών (μέσο σημείο), «με ΣΥΡΙΖΑ» κ.λπ.\n")

    w("## Κάλυψη δημοσκοπήσεων\n")
    w(f"Σύνολο: **{n_polls}** δημοσκοπήσεις (μοναδικά poll_id), **{len(pollsters_all)}** διαφορετικές εταιρείες (κανονικοποιημένα ονόματα, `pollster_norm`), "
      f"{len(polls)} γραμμές. Αφαιρέθηκαν {len(dups)} ακριβή διπλότυπα.\n")
    w("| Εκλογή | " + " | ".join(measures) + " | Εταιρείες |")
    w("|---|" + "---|" * (len(measures) + 1))
    for e in sorted(per, key=lambda x: x.split("_")[-1]):
        w(f"| {e} | " + " | ".join(str(len(per[e].get(m, ()))) for m in measures) + f" | {len(pollsters_ctx[e])} |")
    w("")

    w("## Κάλυψη αποτελεσμάτων\n")
    w("Αριθμός μονάδων ανά επίπεδο (πηγή σε παρένθεση: wp:en = αγγλική Wikipedia, "
      "wp:el-constituency-page = σελίδες εκλογικών περιφερειών της ελληνικής Wikipedia, μόνο 5 πρώτα κόμματα).\n")
    w("| Εκλογή | national | region | constituency | municipality | turnout |")
    w("|---|---|---|---|---|---|")
    for e in sorted(rc, key=lambda x: x.split("_")[-1]):
        cells = []
        for lv in LEVELS:
            n = len(rc[e].get(lv, ()))
            cells.append(f"{n} ({', '.join(sorted(rsrc[e][lv]))})" if n else "—")
        w(f"| {e} | " + " | ".join(cells) + f" | {'ναι' if e in tset else '—'} |")
    w("")

    w("## Έλεγχος ακρίβειας (sanity check)\n")
    w("Για κάθε εκλογή: δημοσκοπήσεις (όχι exit polls / προβολές εκλογικής βραδιάς / aggregators / σενάρια) με λήξη "
      "πεδίου στις 7 ημέρες πριν από την τελευταία διαθέσιμη δημοσκόπηση. Η «πρόθεση ψήφου» επανακανονικοποιείται "
      "χωρίς αναποφάσιστους. MAE = μέση απόλυτη διαφορά (ποσοστιαίες μονάδες) στα κόμματα που υπάρχουν και στα δύο.\n")
    w("| Εκλογή | Δημοσκοπήσεις | MAE (π.μ.) | Σημείωση |\n|---|---|---|---|")
    for a in acc:
        if a["row_type"] == "election_summary":
            w(f"| {a['election_id']} | {a['pollster'].split()[0]} | {a['mae_pct_points']} | {a['note']} |")
    w("")
    w("Σημ.: ο νόμος απαγορεύει τη δημοσίευση δημοσκοπήσεων τις τελευταίες ~15 ημέρες (μέχρι το 2014)· γι' αυτό σε "
      "παλαιότερες εκλογές το «τελικό παράθυρο» είναι πριν από την απαγόρευση. Το δημοψήφισμα 2015 δείχνει μεγάλο "
      "σφάλμα (~10 μ.), γνωστή αποτυχία των δημοσκοπήσεων.\n")

    fl = defaultdict(int)
    for r in val:
        fl[(r["sum_flag"] or "ok") + " / " + (r["date_flag"] or "-")] += 1
    w("## Επικύρωση\n")
    w("- Αθροίσματα: `sum_flag` = ok (95–103.5), ok_partial_no_others_column (ο πίνακας δεν έχει στήλη «Άλλα»), "
      "ok_partial_raw, violation_over_100, violation_under_100.")
    w("- Ημερομηνίες: όλες ISO· `date_flag` σημειώνει missing_date, start_after_end, after_election, year_inferred "
      "(έτος από τον πίνακα/ενότητα), month_only, dd-mm-yy / yy-mm-dd.")
    w(f"- Δημοσκοπήσεις στο `polls_validation.csv`: {len(val)}.")
    for k, v in sorted(fl.items(), key=lambda kv: -kv[1]):
        w(f"  - {k}: {v}")
    big = [c for c in cc if c["abs_diff_pct"] not in ("", None) and float(c["abs_diff_pct"]) > 0.5]
    w(f"- ParlGov cross-check: {len(cc)} γραμμές· {len(big)} με διαφορά >0.5 μ. (συνήθως συνασπισμοί/ονομασίες).\n")

    w("## Άδεια χρήσης & αναφορά πηγών\n")
    w("- **Wikipedia** (κείμενο/πίνακες): CC BY-SA 4.0. Τα παράγωγα CSV διατίθενται με την ίδια άδεια (ShareAlike) "
      "και απαιτούν αναφορά: τίτλος σελίδας + αναθεώρηση (revid) + URL — βλ. λίστα παρακάτω και στήλες `source_*`.")
    w("- **ParlGov** (Döring, Quaas, Hesse & Manow, development version): ανοικτά δεδομένα· χρησιμοποιήθηκε μόνο για "
      "διασταύρωση εθνικών ποσοστών (`election_results_crosscheck_parlgov.csv`). Αναφορά: parlgov.org.")
    w("- Ακατέργαστα αρχεία και `manifest.json` (url, sha256, άδεια, retrieved_at) στα "
      "`.synthetic-lab-data/raw/political/polls/` και `.../elections/`.\n")
    w("### Σελίδες Wikipedia (τίτλος — revid — URL)\n")
    for t, wk, rv, u in attrib:
        w(f"- [{wk}] {t} — {rv} — {u}")
    w("")
    w("## Γνωστά κενά / περιορισμοί\n")
    w("- **ΥΠΕΣ (ekloges.ypes.gr)**: HTTP 403 (Akamai) από το περιβάλλον λήψης· δεν έγινε παράκαμψη. Άρα **δεν υπάρχουν "
      "αποτελέσματα επιπέδου δήμου** ούτε πλήρη αποτελέσματα όλων των κομμάτων ανά εκλογική περιφέρεια. Λύση: χειροκίνητη "
      "λήψη των ανοικτών δεδομένων ΥΠΕΣ από ελληνική IP/φυλλομετρητή και προσθήκη στο `raw/political/elections/ypes/`.")
    w("- **CLEA (electiondataarchive.org)**: HTTP 403 (bot protection)· δεν χρησιμοποιήθηκε.")
    w("- **data.gov.gr**: δεν βρέθηκε σύνολο εκλογικών αποτελεσμάτων.")
    w("- Περιφέρειες/εκλ. περιφέρειες: από πίνακες της αγγλικής Wikipedia μόνο **ποσοστά** των κυριότερων κομμάτων "
      "(χωρίς ψήφους)· από τις σελίδες εκλ. περιφερειών της ελληνικής Wikipedia **μόνο τα 5 πρώτα κόμματα** (με ψήφους) "
      "και μόνο όπου υπάρχει σελίδα. Ευρωεκλογές και 2000/2004 έχουν μερική κάλυψη εκλ. περιφερειών.")
    ncp = sum(1 for a in attrib if a[0] and a[0].startswith("Εκλογική περιφέρεια"))
    w(f"- Λήφθηκαν {ncp} σελίδες εκλογικών περιφερειών (από ~60) πριν διακοπεί η λήψη λόγω rate-limit (HTTP 429) της "
      "Wikipedia· η εκ νέου εκτέλεση του `run_all.sh` συνεχίζει από όπου σταμάτησε (`--skip-existing`).")
    w("- Συμμετοχή μόνο σε εθνικό επίπεδο.")
    w("- **Αξιολόγηση αρχηγών, καταλληλότερος πρωθυπουργός, αξιολόγηση κυβέρνησης**: δεν υπάρχουν τέτοιοι πίνακες στις "
      "τρέχουσες σελίδες en/el Wikipedia (ελέγχθηκαν όλες· το μέτρο υποστηρίζεται από τον parser αν εμφανιστούν).")
    w("- Δεν υπάρχει σελίδα δημοσκοπήσεων για το 2000 (χρησιμοποιήθηκε η ενότητα του άρθρου εκλογών)· οι ευρωεκλογές "
      "έχουν μόνο ενότητες μέσα στα άρθρα (2004: καμία δημοσκόπηση).")
    w("- Οι σελίδες της αγγλικής Wikipedia συνήθως δεν δηλώνουν ρητά «εκτίμηση» ή «πρόθεση»: όπου το άθροισμα ≈100 "
      "χαρακτηρίζονται `vote_estimate` με σημείωση `measure_inferred_from_row_sums`. Η ελληνική σελίδα Ιουνίου 2023 "
      "διακρίνει ρητά «Πρόθεση ψήφου» και «Εκτίμηση ψήφου».")
    w("- Νέα/υποθετικά κόμματα 2025–26 (π.χ. Alliance of Greeks, Hope for Democracy, κόμμα Τσίπρα/Καρυστιανού σε σενάρια) "
      "έχουν αυτόματα ή προσωρινά κλειδιά — ελέγξτε το `party_map.csv`.")
    w("- Τα δεδομένα Wikipedia είναι δευτερογενή· για βαθμονόμηση υψηλής ακρίβειας προτιμήστε επίσημα αποτελέσματα ΥΠΕΣ όταν γίνουν διαθέσιμα.")
    with open(os.path.join(tidy, "README.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(L) + "\n")
    print("README written", len(L), "lines")


if __name__ == "__main__":
    main()
