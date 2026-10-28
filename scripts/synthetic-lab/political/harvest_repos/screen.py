"""Screen discovery hits: dedupe by DOI/id, flag Greek + political + survey, write candidates.tsv.

Usage: python3 -I screen.py <disc_dir> <out_tsv>
"""

import glob
import json
import os
import re
import sys

GR = re.compile(r"gree(ce|k)|hellen|ελλ[άη]|athens|syriza|golden dawn|pasok|new democracy|thessalon|crete|cyprus|ellada|αθήν", re.I)
POL = re.compile(r"elect|vot(e|er|ing)|part(y|ies|isan)|populis|polari|left.right|ideolog|referend|bailout|austerit|protest|"
                 r"trust|politic|democra|govern|euroscept|nationalis|far.right|radical|extrem|populism|conspira|refugee|"
                 r"immigra|migra|attitud|opinion|εκλογ|ψήφ|κόμμα|πολιτικ|δημοσκ", re.I)
SURV = re.compile(r"survey|respondent|panel|poll|questionnaire|experiment|interview|sample|cati|cawi|online|qualtrics|"
                  r"replication|microdata|individual.level|conjoint|vignette|study|έρευνα|ερωτηματολ|δείγμα", re.I)
NEG = re.compile(r"ancient greek|koine|classical greek|homer|byzantin|archaeolog|seismic|earthquake|sediment|species|"
                 r"pollen|genom|protein|tweets? only|twitter corpus|parliament(ary)? (proceedings|speeches)|roll.call|"
                 r"word length|eye.tracking|syntactic|phonolog|morpholog|wildfire|marine|fish|soil|climate model", re.I)


def key(r):
    d = (r.get("doi") or "").lower().replace("https://doi.org/", "")
    if d:
        return d
    return f"{r.get('src')}:{r.get('id') or r.get('url')}"


def main():
    disc, out = sys.argv[1], sys.argv[2]
    recs = {}
    for f in sorted(glob.glob(os.path.join(disc, "*.jsonl"))):
        for line in open(f, encoding="utf-8"):
            try:
                r = json.loads(line)
            except json.JSONDecodeError:
                continue
            k = key(r)
            if k in recs:
                recs[k]["srcs"].add(r["src"])
                continue
            r["srcs"] = {r["src"]}
            recs[k] = r
    rows = []
    for k, r in recs.items():
        text = " ".join(str(r.get(x) or "") for x in ("title", "desc", "keywords", "subjects", "tags", "geo"))
        g = bool(GR.search(text))
        p = len(set(m.group(0).lower()[:5] for m in POL.finditer(text)))
        s = bool(SURV.search(text))
        neg = bool(NEG.search(text))
        score = (3 if g else 0) + min(p, 5) + (2 if s else 0) - (4 if neg else 0)
        if r.get("type") and str(r.get("type")).lower() in ("text", "journalarticle", "publication", "presentation", "poster", "image"):
            score -= 2
        rows.append((score, k, ",".join(sorted(r["srcs"])), str(r.get("year") or ""), str(r.get("type") or ""),
                     (r.get("title") or "").replace("\t", " ").replace("\n", " ")[:220],
                     (r.get("publisher") or r.get("host") or "")[:40] if isinstance(r.get("publisher") or r.get("host") or "", str) else "",
                     (r.get("desc") or "").replace("\t", " ").replace("\n", " ")[:300]))
    rows.sort(key=lambda x: -x[0])
    with open(out, "w", encoding="utf-8") as fh:
        fh.write("score\tkey\tsrcs\tyear\ttype\ttitle\tpublisher\tdesc\n")
        for r in rows:
            fh.write("\t".join(str(x) for x in r) + "\n")
    print(f"unique records: {len(recs)}; score>=8: {sum(1 for r in rows if r[0] >= 8)}; score>=6: {sum(1 for r in rows if r[0] >= 6)}")


if __name__ == "__main__":
    main()
