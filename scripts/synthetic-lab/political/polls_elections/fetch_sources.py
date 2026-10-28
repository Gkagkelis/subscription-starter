"""Κατεβάζει τις πηγές (Wikipedia en/el μέσω MediaWiki API, ParlGov CSV).

Χρήση:  python3 -I fetch_sources.py <raw_political_dir> [--skip-existing]

Αποθήκευση (μη εμπιστα δεδομένα, μόνο bytes):
  <raw>/polls/wikipedia/<wiki>__<slug>.json      (σελίδες δημοσκοπήσεων)
  <raw>/elections/wikipedia/<wiki>__<slug>.json  (άρθρα εκλογών: αποτελέσματα + ενότητες δημοσκοπήσεων)
  <raw>/elections/parlgov/*.csv
  manifest.json σε polls/ και elections/
"""

import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import Manifest, http_get, write_bytes  # noqa: E402

WIKI_LICENCE = "CC BY-SA 4.0 (Wikipedia text/tables); attribution: page title + revid + URL"
PARLGOV_LICENCE = "ParlGov (Döring, Quaas, Hesse & Manow 2023, development version) — open data, CC BY-SA 4.0 per ParlGov Dataverse; cite ParlGov"

# (wiki, title, kind, election_context)
POLL_PAGES = [
    ("en", "Opinion polling for the 2004 Greek parliamentary election", "GR_parl_2004-03-07"),
    ("en", "Opinion polling for the 2007 Greek parliamentary election", "GR_parl_2007-09-16"),
    ("en", "Opinion polling for the 2009 Greek parliamentary election", "GR_parl_2009-10-04"),
    ("en", "Opinion polling for the May 2012 Greek parliamentary election", "GR_parl_2012-05-06"),
    ("en", "Opinion polling for the June 2012 Greek parliamentary election", "GR_parl_2012-06-17"),
    ("en", "Opinion polling for the January 2015 Greek parliamentary election", "GR_parl_2015-01-25"),
    ("en", "Opinion polling for the September 2015 Greek parliamentary election", "GR_parl_2015-09-20"),
    ("en", "Opinion polling for the 2019 Greek parliamentary election", "GR_parl_2019-07-07"),
    ("en", "Opinion polling for the May 2023 Greek parliamentary election", "GR_parl_2023-05-21"),
    ("en", "Opinion polling for the June 2023 Greek parliamentary election", "GR_parl_2023-06-25"),
    ("en", "Opinion polling for the next Greek parliamentary election", "GR_parl_next"),
    ("el", "Δημοσκοπήσεις για τις ελληνικές βουλευτικές εκλογές 2019", "GR_parl_2019-07-07"),
    ("el", "Δημοσκοπήσεις για τις ελληνικές βουλευτικές εκλογές Ιουνίου 2023", "GR_parl_2023-06-25"),
]

ELECTION_PAGES = [
    ("en", "2000 Greek parliamentary election", "GR_parl_2000-04-09"),
    ("en", "2004 Greek parliamentary election", "GR_parl_2004-03-07"),
    ("en", "2007 Greek parliamentary election", "GR_parl_2007-09-16"),
    ("en", "2009 Greek parliamentary election", "GR_parl_2009-10-04"),
    ("en", "May 2012 Greek parliamentary election", "GR_parl_2012-05-06"),
    ("en", "June 2012 Greek parliamentary election", "GR_parl_2012-06-17"),
    ("en", "January 2015 Greek parliamentary election", "GR_parl_2015-01-25"),
    ("en", "September 2015 Greek parliamentary election", "GR_parl_2015-09-20"),
    ("en", "2019 Greek parliamentary election", "GR_parl_2019-07-07"),
    ("en", "May 2023 Greek parliamentary election", "GR_parl_2023-05-21"),
    ("en", "June 2023 Greek parliamentary election", "GR_parl_2023-06-25"),
    ("en", "Next Greek parliamentary election", "GR_parl_next"),
    ("en", "2015 Greek bailout referendum", "GR_ref_2015-07-05"),
    ("en", "2004 European Parliament election in Greece", "GR_ep_2004-06-13"),
    ("en", "2009 European Parliament election in Greece", "GR_ep_2009-06-07"),
    ("en", "2014 European Parliament election in Greece", "GR_ep_2014-05-25"),
    ("en", "2019 European Parliament election in Greece", "GR_ep_2019-05-26"),
    ("en", "2024 European Parliament election in Greece", "GR_ep_2024-06-09"),
    ("el", "Ελληνικές βουλευτικές εκλογές 2000", "GR_parl_2000-04-09"),
    ("el", "Ελληνικές βουλευτικές εκλογές 2004", "GR_parl_2004-03-07"),
    ("el", "Ελληνικές βουλευτικές εκλογές 2007", "GR_parl_2007-09-16"),
    ("el", "Ελληνικές βουλευτικές εκλογές 2009", "GR_parl_2009-10-04"),
    ("el", "Ελληνικές βουλευτικές εκλογές Μαΐου 2012", "GR_parl_2012-05-06"),
    ("el", "Ελληνικές βουλευτικές εκλογές Ιουνίου 2012", "GR_parl_2012-06-17"),
    ("el", "Ελληνικές βουλευτικές εκλογές Ιανουαρίου 2015", "GR_parl_2015-01-25"),
    ("el", "Ελληνικές βουλευτικές εκλογές Σεπτεμβρίου 2015", "GR_parl_2015-09-20"),
    ("el", "Ελληνικές βουλευτικές εκλογές 2019", "GR_parl_2019-07-07"),
    ("el", "Ελληνικές βουλευτικές εκλογές Μαΐου 2023", "GR_parl_2023-05-21"),
    ("el", "Ελληνικές βουλευτικές εκλογές Ιουνίου 2023", "GR_parl_2023-06-25"),
    ("el", "Ελληνικό δημοψήφισμα του 2015", "GR_ref_2015-07-05"),
    ("el", "Ελληνικές ευρωεκλογές 2004", "GR_ep_2004-06-13"),
    ("el", "Ελληνικές ευρωεκλογές 2009", "GR_ep_2009-06-07"),
    ("el", "Ελληνικές ευρωεκλογές 2014", "GR_ep_2014-05-25"),
    ("el", "Ελληνικές ευρωεκλογές 2019", "GR_ep_2019-05-26"),
    ("el", "Ελληνικές ευρωεκλογές 2024", "GR_ep_2024-06-09"),
]

PARLGOV_FILES = ["view_election.csv", "view_party.csv", "election.csv", "election_result.csv", "party.csv"]
PARLGOV_BASE = "https://parlgov.org/data/parlgov-development_csv-utf-8/"


def slug(title):
    s = re.sub(r"[^\w]+", "_", title, flags=re.UNICODE).strip("_")
    return s[:120]


def fetch_page(wiki, title):
    api = f"https://{wiki}.wikipedia.org/w/api.php"
    params = {"action": "parse", "page": title, "prop": "text|wikitext|revid|displaytitle|sections",
              "redirects": 1, "format": "json", "formatversion": 2, "maxlag": 5}
    body = http_get(api, params)
    url = api + "?" + "&".join(f"{k}={v}" for k, v in params.items())
    return body, url


def main():
    raw = sys.argv[1]
    skip = "--skip-existing" in sys.argv
    pm = Manifest(os.path.join(raw, "polls", "manifest.json"))
    em = Manifest(os.path.join(raw, "elections", "manifest.json"))
    for group, pages, man, sub in (("polls", POLL_PAGES, pm, "polls"), ("elections", ELECTION_PAGES, em, "elections")):
        for wiki, title, ctx in pages:
            rel = f"wikipedia/{wiki}__{slug(title)}.json"
            path = os.path.join(raw, sub, rel)
            if skip and os.path.exists(path) and rel in man.items:
                continue
            try:
                body, url = fetch_page(wiki, title)
            except Exception as e:  # noqa: BLE001
                print("FAIL", wiki, title, e, file=sys.stderr)
                continue
            d = json.loads(body)
            if "error" in d:
                print("MISSING", wiki, title, d["error"].get("code"), file=sys.stderr)
                continue
            p = d["parse"]
            write_bytes(path, body)
            man.add(rel, url, body, WIKI_LICENCE, wiki=wiki, title=p["title"], revid=p.get("revid"),
                    pageid=p.get("pageid"), election_context=ctx,
                    page_url=f"https://{wiki}.wikipedia.org/w/index.php?title={p['title'].replace(' ', '_')}&oldid={p.get('revid')}")
            print("OK", wiki, p["title"], p.get("revid"), len(body))
            man.save()
    for fn in PARLGOV_FILES:
        rel = f"parlgov/{fn}"
        path = os.path.join(raw, "elections", rel)
        if skip and os.path.exists(path) and rel in em.items:
            continue
        try:
            body = http_get(PARLGOV_BASE + fn)
        except Exception as e:  # noqa: BLE001
            print("FAIL parlgov", fn, e, file=sys.stderr)
            continue
        write_bytes(path, body)
        em.add(rel, PARLGOV_BASE + fn, body, PARLGOV_LICENCE)
        print("OK parlgov", fn, len(body))
    # ΥΠΕΣ / CLEA: καταγραφή απόπειρας (μπλοκάρονται από Akamai/Cloudflare — ΔΕΝ παρακάμπτονται)
    probes = {}
    for u in ["https://ekloges.ypes.gr/", "https://www.electiondataarchive.org/"]:
        try:
            http_get(u, max_tries=1)
            probes[u] = "reachable"
        except Exception as e:  # noqa: BLE001
            probes[u] = f"blocked: {str(e)[:200]}"
    with open(os.path.join(raw, "elections", "access_probes.json"), "w", encoding="utf-8") as f:
        json.dump(probes, f, ensure_ascii=False, indent=1)
    pm.save()
    em.save()


if __name__ == "__main__":
    main()
