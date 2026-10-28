"""List OSF storage files (2 levels deep, incl. components) for given node ids.

Usage: python3 -I osf_files.py <out_json> <node_id> [<node_id> ...]
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import polite  # noqa: E402

API = "https://api.osf.io/v2"


def walk(url, depth, acc):
    while url:
        try:
            d = polite.get_json(url)
        except Exception as e:  # noqa: BLE001
            acc.append({"error": str(e)[:200]})
            return
        for it in d.get("data", []):
            a = it["attributes"]
            if a.get("kind") == "folder":
                if depth < 3:
                    walk(it["relationships"]["files"]["links"]["related"]["href"], depth + 1, acc)
            else:
                acc.append({"name": a.get("name"), "path": a.get("materialized_path"), "size": a.get("size"),
                            "download": (it.get("links") or {}).get("download")})
        url = (d.get("links") or {}).get("next")


def node(nid):
    out = {"id": nid}
    for kind in ("nodes", "registrations"):
        try:
            d = polite.get_json(f"{API}/{kind}/{nid}/")
            a = d["data"]["attributes"]
            out.update({"kind": kind, "title": a.get("title"), "description": (a.get("description") or "")[:1500],
                        "public": a.get("public"), "date": a.get("date_created") or a.get("date_registered"),
                        "license": ((d["data"].get("relationships") or {}).get("license") or {}).get("data")})
            break
        except Exception as e:  # noqa: BLE001
            out["err_" + kind] = str(e)[:150]
    if "kind" not in out:
        return out
    files = []
    walk(f"{API}/{out['kind']}/{nid}/files/osfstorage/", 0, files)
    out["files"] = files
    # licence name
    lic = out.get("license")
    if isinstance(lic, dict) and lic.get("id"):
        try:
            out["license_name"] = polite.get_json(f"{API}/licenses/{lic['id']}/")["data"]["attributes"]["name"]
        except Exception:  # noqa: BLE001
            pass
    try:
        ch = polite.get_json(f"{API}/{out['kind']}/{nid}/children/")
        out["children"] = []
        for c in ch.get("data", []):
            sub = []
            walk(f"{API}/nodes/{c['id']}/files/osfstorage/", 0, sub)
            out["children"].append({"id": c["id"], "title": c["attributes"].get("title"), "files": sub})
    except Exception as e:  # noqa: BLE001
        out["children_err"] = str(e)[:150]
    return out


def main():
    res = [node(n) for n in sys.argv[2:]]
    json.dump(res, open(sys.argv[1], "w"), ensure_ascii=False, indent=1)
    for r in res:
        fl = r.get("files", []) + [f for c in r.get("children", []) for f in c["files"]]
        print(r["id"], r.get("kind"), r.get("license_name"), "|", (r.get("title") or "")[:80])
        for f in fl[:25]:
            print("    ", f.get("path") or f.get("error"), f.get("size"))


if __name__ == "__main__":
    main()
