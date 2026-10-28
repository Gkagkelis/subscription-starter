"""Discovery of Greek political survey microdata in open research repositories.

Usage: python3 -I discover.py <out_dir> <source> [<source> ...]
Sources: datacite harvard dataverses zenodo figshare osf dryad github
Writes <out_dir>/<source>.jsonl (one hit per line, raw-ish metadata) and <out_dir>/queries.log.
"""

import json
import os
import re
import sys
import time
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import polite  # noqa: E402

GEO = "(Greece OR Greek OR Greeks OR Hellenic OR Ελλάδα OR Ελλάδας)"
POL = [
    "election", "elections", "electoral", "vote", "voting", "voter", "voters", "party", "parties", "partisan",
    "partisanship", "populism", "populist", "polarization", "polarisation", "\"left-right\"", "ideology", "ideological",
    "\"Golden Dawn\"", "SYRIZA", "\"New Democracy\"", "PASOK", "KKE", "referendum", "bailout", "austerity", "protest",
    "\"trust in government\"", "\"political trust\"", "\"political survey\"", "\"panel survey\"", "\"survey experiment\"",
    "\"replication data\"", "\"public opinion\"", "\"far right\"", "\"radical right\"", "euroscepticism", "Euroscepticism",
    "\"satisfaction with democracy\"", "\"political attitudes\"", "\"political behavior\"", "\"political behaviour\"",
    "\"conjoint\"", "\"vignette\"", "\"conspiracy\"", "\"memoranda\"", "\"debt crisis\"", "\"economic crisis\"",
    "\"migration attitudes\"", "\"refugee crisis\"", "nationalism", "\"Macedonia\"", "\"Prespa\"", "\"civil war\"",
    "\"government approval\"", "\"vote intention\"", "\"turnout\"", "Mitsotakis", "Tsipras",
]
STANDALONE = [
    "ELNES", "\"Hellenic Voter Study\"", "\"Hellenic National Election Study\"", "\"Greek National Election Study\"",
    "Choose4Greece", "HelpMeVote", "\"Greek voters\"", "\"Greek public opinion\"", "\"Greek electorate\"",
    "\"Greek elections\"", "\"Greek parliament\"", "\"Greek referendum\"", "\"Greek crisis\"", "SYRIZA", "\"Golden Dawn\"",
    "\"Χρυσή Αυγή\"", "εκλογές", "δημοσκόπηση", "ψηφοφόροι", "κόμμα", "πολιτική συμπεριφορά", "κοινή γνώμη",
    "\"Greek survey\"", "\"survey in Greece\"", "\"Greek respondents\"", "\"Greek sample\"", "\"Greek citizens\"",
    "\"Greek youth\"", "\"Greek students\"", "Hellenic survey", "\"Southern Europe\" populism", "\"Southern European\" survey",
    "\"South European\" survey", "\"Greece, Italy, Spain\" survey", "\"Greece and Cyprus\" survey",
]

LOG = None


def log(msg):
    LOG.write(time.strftime("%H:%M:%S ") + msg + "\n")
    LOG.flush()


def queries_combo():
    return [f"{GEO} AND {p}" for p in POL] + STANDALONE


# --------------------------------------------------------------------------- DataCite
def datacite(out):
    seen = set()
    base = "https://api.datacite.org/dois"
    for q in queries_combo():
        for rtype in ("dataset", None):
            params = {"query": q, "page[size]": 1000, "page[cursor]": 1,
                      "fields[dois]": "doi,titles,creators,publisher,publicationYear,subjects,dates,types,rightsList,descriptions,url,geoLocations,relatedIdentifiers,formats,sizes"}
            if rtype:
                params["resource-type-id"] = rtype
            url = base + "?" + urllib.parse.urlencode(params)
            n = 0
            total = None
            while url and n < 4000:
                try:
                    d = polite.get_json(url)
                except Exception as e:  # noqa: BLE001
                    log(f"datacite ERR {q} {e}")
                    break
                total = d.get("meta", {}).get("total")
                items = d.get("data", [])
                for it in items:
                    a = it["attributes"]
                    n += 1
                    if a["doi"].lower() in seen:
                        continue
                    seen.add(a["doi"].lower())
                    out.write(json.dumps({"src": "datacite", "query": q, "doi": a["doi"].lower(),
                                          "title": " | ".join((t.get("title") or "") for t in a.get("titles") or []),
                                          "creators": [(c.get("name") or "") for c in a.get("creators") or []][:10],
                                          "publisher": a.get("publisher"), "year": a.get("publicationYear"),
                                          "type": (a.get("types") or {}).get("resourceTypeGeneral"),
                                          "rights": [r.get("rightsIdentifier") or r.get("rights") for r in a.get("rightsList") or []],
                                          "dates": a.get("dates"), "subjects": [(s.get("subject") or "") for s in a.get("subjects") or []][:30],
                                          "desc": " ".join((x.get("description") or "") for x in a.get("descriptions") or [])[:3000],
                                          "url": a.get("url"), "geo": a.get("geoLocations"),
                                          "related": [r.get("relatedIdentifier") for r in a.get("relatedIdentifiers") or []][:10]},
                                         ensure_ascii=False) + "\n")
                if not items:
                    break
                url = (d.get("links") or {}).get("next")
                if rtype is None and n >= 1000:
                    break
            log(f"datacite q={q!r} type={rtype} total={total} fetched={n}")
            if rtype is None and total and total > 3000:
                pass
    log(f"datacite unique={len(seen)}")


# --------------------------------------------------------------------------- Dataverse
def dataverse_search(out, host, queries, srcname, max_per_query=1000):
    seen = set()
    for q in queries:
        start = 0
        total = None
        while True:
            try:
                d = polite.get_json(f"https://{host}/api/search",
                                    params={"q": q, "type": "dataset", "per_page": 100, "start": start}, timeout=60)
            except Exception as e:  # noqa: BLE001
                log(f"{srcname} {host} ERR q={q!r} {e}")
                return seen
            data = d.get("data") or {}
            total = data.get("total_count", 0)
            items = data.get("items") or []
            for it in items:
                gid = (it.get("global_id") or it.get("url") or "").lower()
                if gid in seen:
                    continue
                seen.add(gid)
                out.write(json.dumps({"src": srcname, "host": host, "query": q, "doi": gid.replace("doi:", ""),
                                      "title": it.get("name"), "desc": (it.get("description") or "")[:3000],
                                      "creators": it.get("authors"), "publisher": it.get("publisher") or it.get("name_of_dataverse"),
                                      "year": (it.get("published_at") or "")[:4], "keywords": it.get("keywords"),
                                      "subjects": it.get("subjects"), "url": it.get("url"), "fileCount": it.get("fileCount"),
                                      "producers": it.get("producers"), "geo": it.get("geographicCoverage")},
                                     ensure_ascii=False) + "\n")
            start += 100
            if not items or start >= total or start >= max_per_query:
                break
        log(f"{srcname} {host} q={q!r} total={total}")
    return seen


def dv_queries():
    geo = "(Greece OR Greek OR Greeks OR Hellenic OR Ελλάδα)"
    pol = [p for p in POL]
    return [f"{geo} AND {p}" for p in pol] + STANDALONE


def harvard(out):
    seen = dataverse_search(out, "dataverse.harvard.edu", dv_queries(), "harvard")
    log(f"harvard unique={len(seen)}")


DV_HOSTS = [
    "dataverse.nl", "data.aussda.at", "data.qdr.syr.edu", "borealisdata.ca", "dataverse.unc.edu",
    "data.goettingen-research-online.de", "dataverse.ada.edu.au", "dataverse.cirad.fr", "entrepot.recherche.data.gouv.fr",
    "data.sciencespo.fr", "dataverse.no", "darus.uni-stuttgart.de", "heidata.uni-heidelberg.de", "edmond.mpg.de",
    "dataverse.tdl.org", "dataverse.lib.virginia.edu", "archive.data.jhu.edu", "dataverse.csuc.cat", "dataverse.unimi.it",
    "data.inrae.fr", "dataverse.ird.fr", "datos.uchile.cl", "dataverse.fiocruz.br", "repositoriodedados.unifesp.br",
    "dataverse.asu.edu", "dataverse.ucla.edu", "dataverse.lib.nycu.edu.tw", "dataverse.openforestdata.pl",
    "researchdata.cuhk.edu.hk", "dataverse.harvard.edu", "data.sodanet.gr", "datacatalogue.sodanet.gr",
    "dataverse.iit.it", "dataverse.icrisat.org", "dataverse.rhi.hi.is", "rdr.kuleuven.be", "dataverse.uclouvain.be",
    "data.depositar.io", "dataverse.unimi.it", "dataverse.pushdom.ru", "dataverse.theacss.org", "dataverse.ucdavis.edu",
    "dataverse.uib.no", "opendata.pku.edu.cn", "dataverse.scholarsportal.info", "dataverse.mpi-sws.org",
    "data.cyverse.org", "dataverse.si.edu", "dataverse.e-cienciadatos.org", "dataverse.lipi.go.id", "dataverse.ufabc.edu.br",
    "redu.unicamp.br", "dados.ipb.pt", "dataverse.jpl.nasa.gov", "dataverse.uni-due.de", "data.fz-juelich.de",
    "dataverse.unive.it", "dataverse.unipi.it", "data.ru.nl", "dataverse.uni-bielefeld.de", "osnadata.ub.uni-osnabrueck.de",
    "bonndata.uni-bonn.de", "data.uni-hannover.de", "dataverse.tu-berlin.de", "radar.kit.edu", "dataverse.aau.dk",
    "dataverse.ehri-project.eu", "trolling.uit.no", "dataverse.uni-luebeck.de", "dataverse.cbs.dk",
]


def dataverses(out):
    try:
        lst = polite.get_json("https://raw.githubusercontent.com/IQSS/dataverse-installations/main/data/data.json")
        hosts = [i.get("hostname") for i in lst.get("installations", []) if i.get("hostname")]
        log(f"installations list: {len(hosts)}")
    except Exception as e:  # noqa: BLE001
        log(f"installations list ERR {e}")
        hosts = []
    hosts = [h for h in dict.fromkeys(hosts + DV_HOSTS) if h != "dataverse.harvard.edu"]
    probe_q = "(Greece OR Greek OR Hellenic)"
    responsive = []
    for h in hosts:
        try:
            d = polite.get_json(f"https://{h}/api/search", params={"q": probe_q, "type": "dataset", "per_page": 1}, timeout=25, retries=1)
            tc = (d.get("data") or {}).get("total_count")
            log(f"probe {h} ok total={tc}")
            if tc:
                responsive.append(h)
        except Exception as e:  # noqa: BLE001
            log(f"probe {h} fail {str(e)[:120]}")
    qs = [f"{probe_q} AND (election OR electoral OR vote OR voting OR voter OR party OR parties OR populism OR populist "
          f"OR polarization OR ideology OR referendum OR austerity OR bailout OR protest OR trust OR political OR politics "
          f"OR \"public opinion\" OR survey OR crisis OR SYRIZA OR \"Golden Dawn\" OR attitudes)"] + \
         ["ELNES", "\"Hellenic Voter Study\"", "Choose4Greece", "HelpMeVote", "εκλογές", "δημοσκόπηση"]
    for h in responsive:
        dataverse_search(out, h, qs, "dataverse")


# --------------------------------------------------------------------------- Zenodo
def zenodo(out):
    seen = set()
    qs = [f"{GEO} AND {p}" for p in POL] + STANDALONE
    for q in qs:
        page = 1
        total = None
        while page <= 40:
            try:
                d = polite.get_json("https://zenodo.org/api/records", params={"q": q, "size": 25, "page": page, "sort": "bestmatch"})
            except Exception as e:  # noqa: BLE001
                log(f"zenodo ERR {q} p{page} {e}")
                break
            hits = d.get("hits", {}).get("hits", [])
            total = d.get("hits", {}).get("total")
            for h in hits:
                rid = str(h.get("id"))
                if rid in seen:
                    continue
                seen.add(rid)
                m = h.get("metadata", {})
                out.write(json.dumps({"src": "zenodo", "query": q, "id": rid, "doi": (h.get("doi") or m.get("doi") or "").lower(),
                                      "title": m.get("title"), "desc": re.sub(r"<[^>]+>", " ", m.get("description") or "")[:3000],
                                      "creators": [c.get("name") for c in m.get("creators") or []][:10],
                                      "year": (m.get("publication_date") or "")[:4],
                                      "type": (m.get("resource_type") or {}).get("type"),
                                      "rights": (m.get("license") or {}).get("id"), "access": m.get("access_right"),
                                      "keywords": m.get("keywords"), "url": (h.get("links") or {}).get("self_html"),
                                      "files": [(f.get("key"), f.get("size")) for f in h.get("files") or []][:60],
                                      "related": [r.get("identifier") for r in m.get("related_identifiers") or []][:10]},
                                     ensure_ascii=False) + "\n")
            if not hits or page * 25 >= (total or 0):
                break
            page += 1
            # stop when results get clearly irrelevant: no Greek mention in a whole page
            if page > 4 and not any(re.search(r"gree|hellen|ελλ", json.dumps(h, ensure_ascii=False).lower()) for h in hits):
                break
        log(f"zenodo q={q!r} total={total} pages={page}")
    log(f"zenodo unique={len(seen)}")


# --------------------------------------------------------------------------- figshare
def figshare(out):
    seen = set()
    qs = [f"Greece {p}" for p in POL] + [f"Greek {p}" for p in POL] + STANDALONE
    for q in qs:
        q = q.replace('"', "")
        page = 1
        while page <= 10:
            try:
                items = polite.post_json("https://api.figshare.com/v2/articles/search",
                                         {"search_for": q, "page": page, "page_size": 100})
            except Exception as e:  # noqa: BLE001
                log(f"figshare ERR {q} {e}")
                break
            for it in items:
                rid = str(it.get("id"))
                if rid in seen:
                    continue
                seen.add(rid)
                out.write(json.dumps({"src": "figshare", "query": q, "id": rid, "doi": (it.get("doi") or "").lower(),
                                      "title": it.get("title"), "type": it.get("defined_type_name"),
                                      "year": (it.get("published_date") or "")[:4], "url": it.get("url_public_html")},
                                     ensure_ascii=False) + "\n")
            if len(items) < 100:
                break
            page += 1
        log(f"figshare q={q!r} pages={page}")
    log(f"figshare unique={len(seen)}")


# --------------------------------------------------------------------------- OSF (SHARE trove + v2 nodes)
def osf(out):
    seen = set()
    for term in ["Greece", "Greek", "Hellenic", "Greeks"]:
        url = "https://api.osf.io/v2/nodes/?" + urllib.parse.urlencode({"filter[title][icontains]": term, "page[size]": 100})
        n = 0
        while url and n < 3000:
            try:
                d = polite.get_json(url)
            except Exception as e:  # noqa: BLE001
                log(f"osf nodes ERR {term} {e}")
                break
            for it in d.get("data", []):
                n += 1
                a = it.get("attributes", {})
                if it["id"] in seen:
                    continue
                seen.add(it["id"])
                out.write(json.dumps({"src": "osf", "query": f"nodes title~{term}", "id": it["id"], "title": a.get("title"),
                                      "desc": (a.get("description") or "")[:2000], "year": (a.get("date_created") or "")[:4],
                                      "category": a.get("category"), "tags": a.get("tags"),
                                      "url": f"https://osf.io/{it['id']}/"}, ensure_ascii=False) + "\n")
            url = (d.get("links") or {}).get("next")
        log(f"osf nodes {term} n={n}")
    # registrations too (survey experiments are often preregistered)
    for term in ["Greece", "Greek"]:
        url = "https://api.osf.io/v2/registrations/?" + urllib.parse.urlencode({"filter[title][icontains]": term, "page[size]": 100})
        n = 0
        while url and n < 2000:
            try:
                d = polite.get_json(url)
            except Exception as e:  # noqa: BLE001
                log(f"osf regs ERR {term} {e}")
                break
            for it in d.get("data", []):
                n += 1
                a = it.get("attributes", {})
                if it["id"] in seen:
                    continue
                seen.add(it["id"])
                out.write(json.dumps({"src": "osf", "query": f"registrations title~{term}", "id": it["id"], "title": a.get("title"),
                                      "desc": (a.get("description") or "")[:2000], "year": (a.get("date_registered") or "")[:4],
                                      "category": "registration", "tags": a.get("tags"),
                                      "url": f"https://osf.io/{it['id']}/"}, ensure_ascii=False) + "\n")
            url = (d.get("links") or {}).get("next")
        log(f"osf registrations {term} n={n}")
    log(f"osf unique={len(seen)}")


# --------------------------------------------------------------------------- Dryad
def dryad(out):
    seen = set()
    for q in ["Greece election", "Greece vote", "Greece political", "Greek survey", "Greece survey", "Greece populism",
              "Greek voters", "Greece party", "Greece protest", "Greece austerity", "Greece trust"]:
        page = 1
        while page <= 5:
            try:
                d = polite.get_json("https://datadryad.org/api/v2/search", params={"q": q, "per_page": 100, "page": page})
            except Exception as e:  # noqa: BLE001
                log(f"dryad ERR {q} {e}")
                break
            items = (d.get("_embedded") or {}).get("stash:datasets", [])
            for it in items:
                did = it.get("identifier")
                if did in seen:
                    continue
                seen.add(did)
                out.write(json.dumps({"src": "dryad", "query": q, "doi": (did or "").replace("doi:", "").lower(),
                                      "title": it.get("title"), "desc": re.sub(r"<[^>]+>", " ", it.get("abstract") or "")[:2000],
                                      "year": (it.get("publicationDate") or "")[:4], "rights": it.get("license"),
                                      "keywords": it.get("keywords")}, ensure_ascii=False) + "\n")
            if len(items) < 100:
                break
            page += 1
        log(f"dryad q={q!r}")
    log(f"dryad unique={len(seen)}")


# --------------------------------------------------------------------------- OSF / SHARE trove full-text search
def trove(out):
    seen = set()
    qs = ["Greece vote", "Greece voting", "Greek voters", "Greece election", "Greek election", "Greece populism",
          "Greek populism", "Greece survey", "Greek survey", "Greece political", "Greek political", "Greece party",
          "Greece polarization", "Greek referendum", "Golden Dawn", "SYRIZA", "Greece trust", "Greece austerity",
          "Greece protest", "Greece experiment", "Greek sample", "Greek participants", "Greece conspiracy",
          "Greece immigration attitudes", "Greece refugees attitudes", "Greece ideology", "Greece Italy Spain survey",
          "Southern Europe survey", "Greece democracy"]
    for q in qs:
        url = "https://share.osf.io/trove/index-card-search?" + urllib.parse.urlencode({"cardSearchText": q, "page[size]": 100})
        n = 0
        while url and n < 500:
            try:
                d = polite.get_json(url, headers={"Accept": "application/vnd.api+json"})
            except Exception as e:  # noqa: BLE001
                log(f"trove ERR {q} {e}")
                break
            for x in d.get("included", []):
                if x.get("type") != "index-card":
                    continue
                n += 1
                a = x["attributes"]
                rid = (a.get("resourceIdentifier") or [""])[0]
                if rid in seen:
                    continue
                seen.add(rid)
                m = a.get("resourceMetadata", {})

                def val(k):
                    v = m.get(k)
                    if isinstance(v, list):
                        return " ".join(str(i.get("@value", i.get("@id", ""))) if isinstance(i, dict) else str(i) for i in v)
                    return str(v or "")
                out.write(json.dumps({"src": "osf_trove", "query": q, "id": rid, "url": rid, "title": val("title") or val("name"),
                                      "desc": val("description")[:2000], "type": val("resourceType"),
                                      "year": val("dateCreated")[:4], "tags": val("keyword")}, ensure_ascii=False) + "\n")
            nxt = ((d.get("data") or {}).get("relationships") or {}).get("searchResultPage", {}).get("links", {}).get("next", {})
            url = nxt.get("href") if isinstance(nxt, dict) else None
        log(f"trove q={q!r} n={n}")
    log(f"trove unique={len(seen)}")


EXTRA = ["REScEU", "EUENGAGE", "LIVEWHAT", "TransSOL", "EURYKA", "\"Populism and Civic Engagement\"", "\"Values in Crisis\"",
         "COVIDiSTRESS", "\"Solidarity in Europe\"", "eupinions", "ActEU", "MAPLE AND survey", "RECONNECT AND survey",
         "\"populist attitudes\" AND survey", "Indignados AND Greece", "aganaktismenoi", "Syntagma AND protest",
         "\"European crisis countries\"", "\"debtor countries\" AND survey", "\"Eurozone crisis\" AND survey",
         "\"bailout referendum\"", "\"Greek bailout\"", "\"Greek debt\" AND survey", "Grexit", "\"Golden Dawn\"",
         "\"Greek Orthodox\" AND survey", "\"refugee crisis\" AND Greek AND survey", "\"Aegean islands\"",
         "\"Lesbos\" AND survey", "\"EU27\" AND survey AND vote", "\"27 EU member states\" AND survey",
         "\"cross-national survey\" AND Greece", "\"Southern Europe\" AND survey AND (vote OR party OR populism)",
         "\"Italy, Greece\" AND survey", "\"Greece, Italy\" AND survey", "\"Spain, Greece\" AND survey",
         "\"Greece, Spain\" AND survey", "\"Portugal, Greece\"", "\"Greece and Portugal\" AND survey",
         "\"France, Germany, Greece\"", "\"Germany, Greece\" AND survey", "\"Greece, Hungary\" AND survey",
         "\"Hungary, Greece\"", "\"Greece, Poland\" AND survey", "\"Greece, Ireland\" AND survey",
         "\"Ireland, Greece\" AND survey", "Hellenic AND (survey OR poll) AND (politic* OR vot*)",
         "\"Kapa Research\"", "\"MRB Hellas\"", "\"Public Issue\" AND Greece", "\"Metron Analysis\"", "\"Marc\" AND Greece AND poll",
         "\"Pulse RC\"", "\"Prorata\" AND Greece", "\"GPO\" AND Greece", "\"Alco\" AND Greece", "\"Opinion Poll\" AND Greece",
         "diaNEOsis", "\"ELIAMEP\" AND survey", "\"Kapa\" AND Greece AND survey"]


def datacite_extra(out):
    global POL, STANDALONE
    seen = set()
    for q in EXTRA:
        url = "https://api.datacite.org/dois?" + urllib.parse.urlencode({"query": q, "page[size]": 500})
        try:
            d = polite.get_json(url)
        except Exception as e:  # noqa: BLE001
            log(f"dcx ERR {q} {e}")
            continue
        for it in d.get("data", []):
            a = it["attributes"]
            if a["doi"].lower() in seen:
                continue
            seen.add(a["doi"].lower())
            out.write(json.dumps({"src": "datacite_extra", "query": q, "doi": a["doi"].lower(),
                                  "title": " | ".join((t.get("title") or "") for t in a.get("titles") or []),
                                  "creators": [(c.get("name") or "") for c in a.get("creators") or []][:10],
                                  "publisher": a.get("publisher"), "year": a.get("publicationYear"),
                                  "type": (a.get("types") or {}).get("resourceTypeGeneral"),
                                  "rights": [r.get("rightsIdentifier") or r.get("rights") for r in a.get("rightsList") or []],
                                  "subjects": [(s.get("subject") or "") for s in a.get("subjects") or []][:30],
                                  "desc": " ".join((x.get("description") or "") for x in a.get("descriptions") or [])[:3000],
                                  "url": a.get("url")}, ensure_ascii=False) + "\n")
        log(f"dcx q={q!r} total={d.get('meta', {}).get('total')}")


SOURCES = {"datacite": datacite, "harvard": harvard, "dataverses": dataverses, "zenodo": zenodo,
           "figshare": figshare, "osf": osf, "dryad": dryad, "trove": trove, "datacite_extra": datacite_extra}


def main():
    global LOG
    outdir = sys.argv[1]
    os.makedirs(outdir, exist_ok=True)
    for s in sys.argv[2:]:
        LOG = open(os.path.join(outdir, f"{s}.log"), "a", encoding="utf-8")
        with open(os.path.join(outdir, f"{s}.jsonl"), "w", encoding="utf-8") as out:
            SOURCES[s](out)
        LOG.close()


if __name__ == "__main__":
    main()
