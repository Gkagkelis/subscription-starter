"""Fetch metadata + open data files for selected repository datasets.

Usage: python3 -I fetch.py <targets.json> <dest_root> [--meta-only]

targets.json: list of {"repo": "harvard|dataverse|zenodo|figshare|osf", "id": "...", "host": "dataverse host (dataverse only)",
                       "files": optional list of filename substrings to restrict the download}
Each dataset goes to <dest_root>/<repo>_<safe id>/ with manifest.json (+ meta.json).
Only files that are public without login are fetched; restricted files are recorded, never requested.
"""

import datetime
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import polite  # noqa: E402

MAX = 500 * 1024 * 1024
DATA_EXT = (".sav", ".zsav", ".por", ".dta", ".csv", ".tab", ".tsv", ".xlsx", ".xls", ".rds", ".rdata", ".rda", ".zip",
            ".sas7bdat", ".parquet", ".feather", ".json", ".txt", ".7z", ".gz", ".ods", ".dat")
DOC_EXT = (".pdf", ".docx", ".doc", ".md", ".rtf", ".odt", ".html", ".htm")


def safe(s):
    return re.sub(r"[^A-Za-z0-9._-]+", "_", s).strip("_")[:120]


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")


def want(name, size, restrict):
    n = name.lower()
    if restrict and not any(r.lower() in n for r in restrict):
        return False
    if n.endswith(DATA_EXT):
        return True
    if n.endswith(DOC_EXT) and (size or 0) <= 25 * 1024 * 1024 and re.search(r"codebook|readme|questionnaire|ερωτηματ|variables|"
                                                                            r"documentation|codeplan|dictionary|survey|qnr|methodolog", n):
        return True
    return n.startswith(("readme", "read me", "read_me"))


# ------------------------------------------------------------------ Dataverse (Harvard and others)
def dataverse(t):
    host = t.get("host") or "dataverse.harvard.edu"
    pid = t["id"] if t["id"].startswith(("doi:", "hdl:")) else "doi:" + t["id"]
    d = polite.get_json(f"https://{host}/api/datasets/:persistentId/", params={"persistentId": pid})["data"]
    v = d.get("latestVersion", {})
    blocks = v.get("metadataBlocks", {})
    flat = {}
    for b in blocks.values():
        for f in b.get("fields", []):
            flat[f["typeName"]] = f["value"]
    lic = v.get("license") or {}
    licence = lic.get("name") if isinstance(lic, dict) else str(lic)
    if not licence:
        licence = v.get("termsOfUse") and "custom terms: " + re.sub(r"<[^>]+>", " ", v.get("termsOfUse"))[:300] or "none stated"
    files = []
    for f in v.get("files", []):
        df = f.get("dataFile", {})
        orig = df.get("originalFileName") or df.get("filename")
        files.append({"name": orig, "label": f.get("label"), "id": df.get("id"), "size": df.get("originalFileSize") or df.get("filesize"),
                      "restricted": f.get("restricted", False), "tabular": "originalFileFormat" in df,
                      "url": f"https://{host}/api/access/datafile/{df.get('id')}" + ("?format=original" if "originalFileFormat" in df else ""),
                      "md5": (df.get("checksum") or {}).get("value")})
    meta = {"title": _val(flat.get("title")), "authors": [_val(a.get("authorName")) for a in flat.get("author", [])],
            "keywords": [_val(k.get("keywordValue")) for k in flat.get("keyword", []) if isinstance(k, dict)],
            "description": " ".join(_val(x.get("dsDescriptionValue")) for x in flat.get("dsDescription", []))[:4000],
            "timePeriodCovered": flat.get("timePeriodCovered"), "dateOfCollection": flat.get("dateOfCollection"),
            "productionDate": flat.get("productionDate"), "geographicCoverage": flat.get("geographicCoverage"),
            "kindOfData": flat.get("kindOfData"), "universe": flat.get("universe"), "samplingProcedure": flat.get("samplingProcedure"),
            "collectionMode": flat.get("collectionMode"), "weighting": flat.get("weighting"), "publication": flat.get("publication"),
            "licence": licence, "licence_uri": lic.get("uri") if isinstance(lic, dict) else None,
            "termsOfAccess": v.get("termsOfAccess"), "fileAccessRequest": v.get("fileAccessRequest"),
            "url": f"https://{host}/dataset.xhtml?persistentId={pid}", "doi": pid, "version": f"{v.get('versionNumber')}.{v.get('versionMinorNumber')}"}
    return meta, files


def _val(x):
    if isinstance(x, dict):
        return x.get("value")
    if isinstance(x, list):
        return "; ".join(str(_val(i)) for i in x)
    return x


# ------------------------------------------------------------------ Zenodo
def zenodo(t):
    r = polite.get_json(f"https://zenodo.org/api/records/{t['id']}")
    m = r.get("metadata", {})
    files = [{"name": f.get("key"), "size": f.get("size"), "url": (f.get("links") or {}).get("self"),
              "restricted": m.get("access_right") != "open", "md5": (f.get("checksum") or "").replace("md5:", "")}
             for f in r.get("files", [])]
    meta = {"title": m.get("title"), "authors": [c.get("name") for c in m.get("creators", [])],
            "keywords": m.get("keywords"), "description": re.sub(r"<[^>]+>", " ", m.get("description") or "")[:4000],
            "publication_date": m.get("publication_date"), "licence": (m.get("license") or {}).get("id"),
            "access_right": m.get("access_right"), "embargo_date": m.get("embargo_date"), "doi": r.get("doi"),
            "url": (r.get("links") or {}).get("self_html"), "related": m.get("related_identifiers"), "version": m.get("version")}
    return meta, files


# ------------------------------------------------------------------ figshare
def figshare(t):
    if t["id"].startswith("c."):  # collection: merge files of all member articles
        cid = t["id"][2:]
        c = polite.get_json(f"https://api.figshare.com/v2/collections/{cid}")
        arts = polite.get_json(f"https://api.figshare.com/v2/collections/{cid}/articles", params={"page_size": 100})
        files = []
        for a in arts:
            m, f = figshare({"id": str(a["id"])})
            files += f
        meta = {"title": c.get("title"), "authors": [a.get("full_name") for a in c.get("authors", [])],
                "description": re.sub(r"<[^>]+>", " ", c.get("description") or "")[:4000], "doi": c.get("doi"),
                "url": c.get("url_public_html") or c.get("url"), "publication_date": c.get("published_date"),
                "licence": m.get("licence") if arts else None, "member_articles": [a.get("title") for a in arts]}
        return meta, files
    r = polite.get_json(f"https://api.figshare.com/v2/articles/{t['id']}")
    files = [{"name": f.get("name"), "size": f.get("size"), "url": f.get("download_url"),
              "restricted": bool(f.get("is_link_only")) and False, "md5": f.get("computed_md5")} for f in r.get("files", [])]
    meta = {"title": r.get("title"), "authors": [a.get("full_name") for a in r.get("authors", [])],
            "keywords": r.get("tags"), "description": re.sub(r"<[^>]+>", " ", r.get("description") or "")[:4000],
            "publication_date": r.get("published_date"), "licence": (r.get("license") or {}).get("name"),
            "doi": r.get("doi"), "url": r.get("url_public_html"), "type": r.get("defined_type_name"),
            "is_embargoed": r.get("is_embargoed"), "references": r.get("references")}
    return meta, files


# ------------------------------------------------------------------ OSF
def osf(t):
    nodes = json.load(open(t["osf_json"])) if t.get("osf_json") else []
    n = next((x for x in nodes if x["id"] == t["id"]), None)
    if n is None:
        raise RuntimeError("osf node not pre-listed")
    files = [{"name": f["name"], "size": f.get("size"), "url": f.get("download"), "restricted": False, "path": f.get("path")}
             for f in n.get("files", []) + [f for c in n.get("children", []) for f in c.get("files", [])] if f.get("name")]
    meta = {"title": n.get("title"), "description": n.get("description"), "date": n.get("date"),
            "licence": n.get("license_name") or "none stated", "url": f"https://osf.io/{t['id']}/", "public": n.get("public")}
    return meta, files


HANDLERS = {"harvard": dataverse, "dataverse": dataverse, "zenodo": zenodo, "figshare": figshare, "osf": osf}


def main():
    targets = json.load(open(sys.argv[1]))
    root = sys.argv[2]
    meta_only = "--meta-only" in sys.argv
    for t in targets:
        repo = t["repo"]
        label = repo if repo != "dataverse" else safe(t.get("host", "dataverse"))
        ddir = os.path.join(root, f"{label}_{safe(t['id'].replace('doi:', ''))}")
        os.makedirs(ddir, exist_ok=True)
        try:
            meta, files = HANDLERS[repo](t)
        except Exception as e:  # noqa: BLE001
            print(f"[ERR meta] {repo} {t['id']}: {e}")
            json.dump({"error": str(e)[:500], "target": t}, open(os.path.join(ddir, "meta.json"), "w"), indent=1)
            continue
        json.dump({"target": t, "meta": meta, "files": files}, open(os.path.join(ddir, "meta.json"), "w"), ensure_ascii=False, indent=1)
        man_path = os.path.join(ddir, "manifest.json")
        manifest = json.load(open(man_path)) if os.path.exists(man_path) else {"dataset": t, "files": []}
        manifest.update({"title": meta.get("title"), "licence": meta.get("licence"), "landing_url": meta.get("url"), "doi": meta.get("doi")})
        done = {f["name"] for f in manifest["files"] if f.get("sha256")}
        print(f"== {repo} {t['id']} | {str(meta.get('title'))[:90]} | lic={meta.get('licence')} | files={len(files)}")
        for f in files:
            name = f.get("name") or "unnamed"
            status = None
            if f.get("restricted"):
                status = "restricted (not requested)"
            elif (f.get("size") or 0) > MAX:
                status = "large, not downloaded"
            elif not want(name, f.get("size"), t.get("files")):
                status = "skipped (not data/doc)"
            elif meta_only:
                status = "meta-only run"
            entry = {"name": name, "url": f.get("url"), "size_declared": f.get("size"), "status": status}
            if status is None and name not in done:
                dest = os.path.join(ddir, "files", safe(name))
                try:
                    sha, size = polite.download(f["url"], dest, max_bytes=MAX)
                    entry.update({"status": "downloaded", "sha256": sha, "size": size, "local": dest, "retrieved_at": now()})
                except Exception as e:  # noqa: BLE001
                    entry["status"] = f"error: {str(e)[:200]}"
            elif name in done:
                continue
            manifest["files"] = [x for x in manifest["files"] if x["name"] != name] + [entry]
            print(f"   {entry['status']:<28} {name} {f.get('size')}")
        manifest["retrieved_at"] = now()
        json.dump(manifest, open(man_path, "w"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
