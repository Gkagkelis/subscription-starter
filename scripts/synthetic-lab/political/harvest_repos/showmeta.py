"""Print compact view of meta.json files. Usage: python3 -I showmeta.py <dir> [...]"""
import json, os, sys
for d in sys.argv[1:]:
    p = os.path.join(d, "meta.json")
    if not os.path.exists(p):
        continue
    j = json.load(open(p))
    m = j.get("meta", {})
    print("=" * 100)
    print(os.path.basename(d), "|", m.get("title"))
    print("  lic:", str(m.get("licence"))[:120], "| geo:", str(m.get("geographicCoverage"))[:150])
    print("  time:", str(m.get("timePeriodCovered") or m.get("dateOfCollection") or m.get("publication_date") or "")[:150])
    print("  desc:", (m.get("description") or "")[:700].replace("\n", " "))
    fl = j.get("files", [])
    print("  files:", "; ".join(f"{f.get('name')}({(f.get('size') or 0)//1024}k{',R' if f.get('restricted') else ''})" for f in fl[:25]), "..." if len(fl) > 25 else "")
