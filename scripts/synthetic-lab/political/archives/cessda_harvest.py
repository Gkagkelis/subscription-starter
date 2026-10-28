"""Harvest CESSDA Data Catalogue search results (metadata only) for Greece.

Usage: python3 -I cessda_harvest.py <out.jsonl>
Runs several queries, paginates (limit=200), 1 req/s, writes one JSON record per
line with a 'query' field. Dedup happens downstream.
"""
import json
import sys
import time
import urllib.parse
import urllib.request

UA = "SyntheticLabResearchBot/1.0 (Greek political-archives inventory; polite, 1 req/s)"
BASE = "https://datacatalogue.cessda.eu/api/DataSets/v2/search"
QUERIES = [
    {"metadataLanguage": "en", "studyAreaCountries": "Greece"},
    {"metadataLanguage": "en", "q": "Greece"},
    {"metadataLanguage": "en", "q": "Greek"},
    {"metadataLanguage": "el"},
]


def get(params):
    url = BASE + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)


out = open(sys.argv[1], "w")
for q in QUERIES:
    off = 0
    while True:
        p = dict(q, limit=200, offset=off)
        d = get(p)
        res = d.get("Results", [])
        avail = d["ResultsCount"]["available"]
        for r in res:
            r["query"] = json.dumps(q, ensure_ascii=False)
            out.write(json.dumps(r, ensure_ascii=False) + "\n")
        print(q, off, len(res), avail, flush=True)
        off += 200
        time.sleep(1.1)
        if not res or off >= avail:
            break
out.close()
