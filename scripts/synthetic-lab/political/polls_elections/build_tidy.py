"""Τελικά tidy αρχεία + έλεγχοι.

Χρήση: python3 -I build_tidy.py <tidy_dir> <polls_parsed_csv> <party_map_source.csv> <auto_party_csv>

Γράφει: polls_toplines.csv, party_map.csv, poll_accuracy_check.csv, polls_validation.csv,
        polls_duplicates_removed.csv, coverage_polls.csv, coverage_results.csv
"""

import csv
import os
import re
import sys
from collections import defaultdict
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from parse_polls import ELECTIONS  # noqa: E402
from wikitables import norm_label, strip_accents  # noqa: E402,F401

OUT_COLS = ["poll_id", "source_page", "source_wiki", "source_revid", "source_url", "election_context", "scope",
            "scenario", "poll_type", "pollster", "pollster_norm", "client", "fieldwork_start", "fieldwork_end", "sample_size",
            "measure", "option", "party_key", "value_pct", "value_seats", "undecided_pct", "poll_sum_pct",
            "sum_flag", "date_flag", "possible_duplicate_of", "table_index", "table_context", "notes"]

NON_PARTY = {"UNDECIDED", "ABSTENTION", "BLANK_INVALID", "NONE", "UNDECIDED_AND_OTHERS"}
EDATE = {k: d for k, d in ELECTIONS}

POLLSTER_CANON = [
    (r"^metron", "Metron Analysis"), (r"^pulse", "Pulse RC"), (r"^mrb", "MRB"), (r"^marc", "MARC"),
    (r"^gpo", "GPO"), (r"^alco", "Alco"), (r"^kapa|^kappa", "Kapa Research"), (r"^public ?issue", "Public Issue"),
    (r"^prorata", "Prorata"), (r"^interview", "Interview"), (r"^opinion ?poll", "Opinion Poll"),
    (r"^rass", "RASS"), (r"^metron", "Metron Analysis"), (r"^mro", "MRO"), (r"^real ?polls", "RealPolls"),
    (r"^palmos", "Palmos Analysis"), (r"^singular", "Singular Logic"), (r"^focus", "Focus Bari"),
    (r"^vprc", "VPRC"), (r"^abacus", "Abacus"), (r"^good ?affairs", "Good Affairs"), (r"^data ?c", "Data C"),
    (r"^ierax|^ιεραξ", "Ierax Analytix"), (r"^marketing ?lab", "Marketing Lab"), (r"^about ?people", "About People"),
    (r"^to the point", "To The Point"), (r"^palmos", "Palmos Analysis"), (r"^metroanal", "Metron Analysis"),
    (r"^pamak|^πα\.?μακ|^university of macedonia", "PAMAK (Univ. of Macedonia)"), (r"^barometer", "Barometer"),
    (r"^matn", "MATN"), (r"^cso", "CSO"), (r"^data rc|^datarc", "Data RC"), (r"^κάπα|^καπα", "Kapa Research"),
    (r"^sofres", "Sofres"), (r"^to ?the ?point", "To The Point"), (r"^aueb", "AUEB-STAT"),
    (r"^uom$|πανεπιστημιο μακεδονιας|πανεπιστήμιο μακεδονίας", "PAMAK (Univ. of Macedonia)"),
    (r"^zougla", "Zougla.gr"), (r"^vox ?pop", "Vox Pop Analysis"), (r"^about", "About People"), (r"^mrb", "MRB"), (r"^ipsos", "Ipsos"), (r"^gallup", "Gallup"),
]


GR2LAT = str.maketrans("ΑΒΕΖΗΙΚΜΝΟΡΤΥΧαο", "ABEZHIKMNOPTYXao")


def canon_pollster(p):
    p = re.sub(r"\s*(Deprecated link )?archived .*?archive\.today", "", p or "", flags=re.I)
    if re.search(r"[A-Za-z]", p):
        p = p.translate(GR2LAT)
    l = strip_accents(p.strip().lower())
    if re.match(r"^k[aα][πp][aα]", l):
        return "Kapa Research"
    for pat, name in POLLSTER_CANON:
        if re.search(pat, l):
            return name
    return (p or "").strip()


def fnum(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def main():
    tidy, parsed, pm_src, auto_csv = sys.argv[1:5]
    rows = list(csv.DictReader(open(parsed, encoding="utf-8")))
    # ---- ομαδοποίηση ανά δημοσκόπηση (poll_id + measure)
    polls = defaultdict(list)
    for r in rows:
        polls[(r["poll_id"], r["measure"])].append(r)
    # ---- διπλότυπα: ίδια εταιρεία/ημερομηνία/μέτρο/τιμές σε άλλη σελίδα ή πίνακα
    prio = lambda r: (0 if r["source_page"].startswith("Opinion polling") else 1 if r["source_wiki"] == "en" else 2)  # noqa: E731
    sig_first = {}
    dropped = []
    keep_ids = set()
    near = {}
    order = sorted(polls.items(), key=lambda kv: (prio(kv[1][0]), kv[1][0]["source_page"], int(kv[1][0]["table_index"])))
    near_first = {}
    for (pid, m), rs in order:
        r0 = rs[0]
        vals = tuple(sorted((x["party_key"], x["value_pct"], x["value_seats"]) for x in rs))
        sig = (m, canon_pollster(r0["pollster"]).lower(), r0["fieldwork_end"], vals)
        nsig = (m, r0["election_context"], canon_pollster(r0["pollster"]).lower(), r0["fieldwork_end"], r0["client"].lower()[:12])
        if r0["pollster"] == "ELECTION":
            sig = (m, "ELECTION", r0["fieldwork_end"], r0["source_page"], r0["table_index"], vals)
        if sig in sig_first:
            dropped.append(dict(poll_id=pid, measure=m, source_page=r0["source_page"], pollster=r0["pollster"],
                                fieldwork_end=r0["fieldwork_end"], duplicate_of=sig_first[sig]))
            continue
        sig_first[sig] = pid
        if r0["pollster"] != "ELECTION" and r0["fieldwork_end"]:
            if nsig in near_first and near_first[nsig] != pid:
                near[(pid, m)] = near_first[nsig]
            else:
                near_first[nsig] = pid
        keep_ids.add((pid, m))
    # ---- έλεγχοι αθροίσματος / ημερομηνιών
    out = []
    val_rows = []
    for (pid, m), rs in polls.items():
        if (pid, m) not in keep_ids:
            continue
        r0 = rs[0]
        flag, s_all = "", None
        if m.startswith("vote") or m in ("election_result", "other:referendum_vote", "other:referendum_vote_decided_only"):
            vals = [(x["party_key"], fnum(x["value_pct"])) for x in rs if fnum(x["value_pct"]) is not None]
            s_all = round(sum(v for _, v in vals), 2)
            und = fnum(r0["undecided_pct"])
            has_others = any(k in ("OTHERS", "UNDECIDED_AND_OTHERS") for k, _ in vals)
            if s_all > 103.5:
                flag = "violation_over_100"
            elif s_all >= 95:
                flag = "ok"
            elif und is not None and s_all >= 90:
                flag = "ok"
            elif not has_others and s_all >= 75:
                flag = "ok_partial_no_others_column"
            elif m == "vote_intention_raw" and s_all >= 60:
                flag = "ok_partial_raw"
            else:
                flag = "violation_under_100"
        dflag = ""
        fs, fe = r0["fieldwork_start"], r0["fieldwork_end"]
        if not fe:
            dflag = "missing_date"
        else:
            if fs and fs > fe:
                dflag = "start_after_end"
            ed = EDATE.get(r0["election_context"])
            if ed and r0["pollster"] != "ELECTION" and r0["poll_type"] != "exit_poll":
                if date.fromisoformat(fe) > ed:
                    dflag = (dflag + ";after_election").strip(";")
            if r0["date_note"]:
                dflag = (dflag + ";" + r0["date_note"]).strip(";")
        for x in rs:
            o = {k: x.get(k, "") for k in OUT_COLS}
            o["pollster"] = x["pollster"]
            o["pollster_norm"] = "ELECTION" if x["pollster"] == "ELECTION" else canon_pollster(x["pollster"])
            o["poll_sum_pct"] = "" if s_all is None else s_all
            o["sum_flag"] = flag
            o["date_flag"] = dflag
            o["possible_duplicate_of"] = near.get((pid, m), "")
            out.append(o)
        if flag.startswith("violation") or dflag.startswith(("missing", "start_after", "after_election")):
            val_rows.append(dict(poll_id=pid, measure=m, source_page=r0["source_page"], pollster=r0["pollster"],
                                 fieldwork_end=fe, poll_sum_pct=s_all, sum_flag=flag, date_flag=dflag))
    out.sort(key=lambda o: (o["election_context"], o["fieldwork_end"] or "0000", o["source_page"], o["poll_id"],
                            o["measure"]))
    with open(os.path.join(tidy, "polls_toplines.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=OUT_COLS)
        w.writeheader()
        w.writerows(out)
    with open(os.path.join(tidy, "polls_validation.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["poll_id", "measure", "source_page", "pollster", "fieldwork_end",
                                          "poll_sum_pct", "sum_flag", "date_flag"])
        w.writeheader()
        w.writerows(val_rows)
    with open(os.path.join(tidy, "polls_duplicates_removed.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["poll_id", "measure", "source_page", "pollster", "fieldwork_end",
                                          "duplicate_of"])
        w.writeheader()
        w.writerows(dropped)

    # ---- party_map.csv (curated + auto) με μετρήσεις χρήσης
    res_path = os.path.join(tidy, "election_results.csv")
    results = list(csv.DictReader(open(res_path, encoding="utf-8"))) if os.path.exists(res_path) else []
    n_poll = defaultdict(int)
    n_res = defaultdict(int)
    labels = defaultdict(set)
    for o in out:
        n_poll[o["party_key"]] += 1
        labels[o["party_key"]].add(o["option"])
    for r in results:
        n_res[r["party_key"]] += 1
        labels[r["party_key"]].add(r["party_label"])
    pm_rows = list(csv.DictReader(open(pm_src, encoding="utf-8")))
    auto_rows = list(csv.DictReader(open(auto_csv, encoding="utf-8"))) if os.path.exists(auto_csv) else []
    # auto από αποτελέσματα
    known = {r["party_key"] for r in pm_rows} | {r["party_key"] for r in auto_rows}
    for k in sorted(set(n_res) | set(n_poll)):
        if k and k not in known and k.startswith("AUTO_"):
            auto_rows.append({"party_key": k, "entity_type": "party_auto", "lineage_key": k, "name_el": "",
                              "name_en": sorted(labels[k])[0] if labels[k] else "", "abbr": "",
                              "active_from": "", "active_to": "", "aliases": "|".join(sorted(labels[k]))})
            known.add(k)
    pm_cols = ["party_key", "entity_type", "lineage_key", "name_el", "name_en", "abbr", "active_from", "active_to",
               "aliases", "curated", "n_poll_rows", "n_result_rows", "labels_seen"]
    with open(os.path.join(tidy, "party_map.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=pm_cols)
        w.writeheader()
        for r, cur in [(r, "yes") for r in pm_rows] + [(r, "no") for r in auto_rows]:
            k = r["party_key"]
            w.writerow({**{c: r.get(c, "") for c in pm_cols[:9]}, "curated": cur, "n_poll_rows": n_poll.get(k, 0),
                        "n_result_rows": n_res.get(k, 0), "labels_seen": "|".join(sorted(labels.get(k, [])))[:500]})

    # ---- έλεγχος ακρίβειας: τελευταίες δημοσκοπήσεις vs αποτέλεσμα
    nat = defaultdict(dict)
    for r in results:
        if r["level"] == "national" and r["pct_valid"]:
            nat[r["election_id"]][r["party_key"]] = nat[r["election_id"]].get(r["party_key"], 0) + float(r["pct_valid"])
    acc_rows = []
    by_ctx = defaultdict(lambda: defaultdict(list))
    for o in out:
        if o["pollster"] == "ELECTION" or o["poll_type"] in ("exit_poll", "aggregator", "election_night_projection") or o["scenario"] == "1":
            continue
        if o["scope"] != "national" or not o["fieldwork_end"]:
            continue
        if o["measure"] not in ("vote_estimate", "vote_intention_raw", "other:referendum_vote_decided_only", "other:referendum_vote"):
            continue
        by_ctx[o["election_context"]][(o["poll_id"], o["measure"])].append(o)
    for eid, ed in ELECTIONS:
        res = nat.get(eid)
        if not res or eid not in by_ctx:
            continue
        cand = {k: v for k, v in by_ctx[eid].items() if v[0]["fieldwork_end"] <= ed.isoformat()}
        if not cand:
            continue
        last = max(v[0]["fieldwork_end"] for v in cand.values())
        win_start = min(date.fromisoformat(last), ed) - timedelta(days=7)
        win = {k: v for k, v in cand.items() if v[0]["fieldwork_end"] >= win_start.isoformat()}
        maes = []
        for (pid, m), rs in sorted(win.items(), key=lambda kv: kv[1][0]["fieldwork_end"]):
            pv = defaultdict(float)
            for x in rs:
                if x["party_key"] in NON_PARTY or x["party_key"] in ("", "OTHERS") or not x["value_pct"]:
                    continue
                if x["party_key"].startswith("LDR_"):
                    continue
                pv[x["party_key"]] += float(x["value_pct"])
            if m == "vote_intention_raw" or m == "other:referendum_vote":
                tot = sum(pv.values()) + sum(float(x["value_pct"]) for x in rs if x["party_key"] == "OTHERS" and x["value_pct"])
                if tot > 0:
                    pv = {k: 100 * v / tot for k, v in pv.items()}
            common = [k for k in pv if k in res]
            if len(common) < 2:
                continue
            errs = [abs(pv[k] - res[k]) for k in common]
            mae = sum(errs) / len(errs)
            top2 = sorted(res, key=lambda k: -res[k])[:2]
            lead_err = ""
            if all(k in pv for k in top2):
                lead_err = round((pv[top2[0]] - pv[top2[1]]) - (res[top2[0]] - res[top2[1]]), 2)
            maes.append(mae)
            acc_rows.append(dict(row_type="poll", election_id=eid, election_date=ed.isoformat(), poll_id=pid,
                                 pollster=rs[0]["pollster"], fieldwork_end=rs[0]["fieldwork_end"], measure=m,
                                 n_parties_compared=len(common), mae_pct_points=round(mae, 2),
                                 lead_error_pct_points=lead_err, window_start=win_start.isoformat(),
                                 note="renormalised_excl_undecided" if m != "vote_estimate" else ""))
        if maes:
            acc_rows.append(dict(row_type="election_summary", election_id=eid, election_date=ed.isoformat(),
                                 poll_id="", pollster=f"{len(maes)} polls", fieldwork_end=last, measure="mixed",
                                 n_parties_compared="", mae_pct_points=round(sum(maes) / len(maes), 2),
                                 lead_error_pct_points="", window_start=win_start.isoformat(),
                                 note=("final polls >7 days before election (publication blackout)"
                                       if date.fromisoformat(last) < ed - timedelta(days=7) else "")))
    acc_cols = ["row_type", "election_id", "election_date", "poll_id", "pollster", "fieldwork_end", "measure",
                "n_parties_compared", "mae_pct_points", "lead_error_pct_points", "window_start", "note"]
    acc_rows.sort(key=lambda r: (r["election_date"], r["row_type"] != "election_summary", r["fieldwork_end"]))
    with open(os.path.join(tidy, "poll_accuracy_check.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=acc_cols)
        w.writeheader()
        w.writerows(acc_rows)

    # ---- κάλυψη
    cov = defaultdict(lambda: defaultdict(set))
    pollsters = defaultdict(set)
    for o in out:
        if o["pollster"] == "ELECTION":
            continue
        cov[(o["election_context"], o["source_wiki"])][o["measure"]].add(o["poll_id"])
        pollsters[o["election_context"]].add(canon_pollster(o["pollster"]))
    with open(os.path.join(tidy, "coverage_polls.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["election_context", "source_wiki", "measure", "n_polls", "n_pollsters_in_context"])
        for (e, wk), ms in sorted(cov.items()):
            for m, ids in sorted(ms.items()):
                w.writerow([e, wk, m, len(ids), len(pollsters[e])])
    rc = defaultdict(lambda: defaultdict(set))
    for r in results:
        rc[r["election_id"]][r["level"]].add(r["unit_name"])
    with open(os.path.join(tidy, "coverage_results.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["election_id", "level", "n_units", "sources"])
        for e in sorted(rc, key=lambda x: x.split("_")[-1]):
            for lv, units in rc[e].items():
                srcs = sorted({r["source"] for r in results if r["election_id"] == e and r["level"] == lv})
                w.writerow([e, lv, len(units), "|".join(srcs)])
    all_p = {canon_pollster(o["pollster"]) for o in out if o["pollster"] != "ELECTION"}
    print(f"poll_rows={len(out)} polls={len(keep_ids)} dropped_dups={len(dropped)} near_dups={len(near)} "
          f"pollsters={len(all_p)} validation_issues={len(val_rows)} acc_rows={len(acc_rows)}")


if __name__ == "__main__":
    main()
