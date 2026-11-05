"""Viewscope v2 — Π0: προστασία ακεραιότητας.

  python3 -I scripts/synthetic-lab/viewscope/integrity.py snapshot   # καταγραφή αρχικής κατάστασης (μία φορά, πριν από αλλαγές)
  python3 -I scripts/synthetic-lab/viewscope/integrity.py verify     # σύγκριση με την αρχική κατάσταση (μετά από κάθε βήμα)

Προστατεύονται (sha256 ανά αρχείο):
  - όλα τα αρχεία του git σε lib/synthetic-lab, scripts/synthetic-lab, config/synthetic-lab, studies, research-engine,
    tests/synthetic-lab, public/viewscope, docs/synthetic-lab — ΕΚΤΟΣ από τους νέους φακέλους viewscope/ (νέες εκδόσεις)·
  - τα ιδιωτικά δεδομένα: μοντέλα PIE (όλες οι εκδόσεις), EGPS, Phase 7A, ASE (119 συνεντεύξεις), αποθηκευμένες μελέτες,
    benchmarks, panels, GPM, διεθνής βάση, εναρμονισμένα μικροδεδομένα.
Για τη λίμνη (11 GB) και τα ακατέργαστα αρχεία καταγράφονται όνομα/μέγεθος (όχι περιεχόμενο).
Οι κρυφές μνήμες (embedding caches) αναφέρονται χωριστά και δεν θεωρούνται αλλοίωση.
"""
import hashlib, json, os, subprocess, sys, time
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
MAN = os.path.join(ROOT, 'benchmarks', 'viewscope_v2', 'integrity', 'baseline_manifest.json')
GIT_PATHS = ['lib/synthetic-lab', 'scripts/synthetic-lab', 'config/synthetic-lab', 'studies', 'research-engine', 'tests/synthetic-lab', 'public/viewscope', 'docs/synthetic-lab', 'benchmarks/viewscope_v1']
NEW_ALLOWED = ['lib/synthetic-lab/viewscope/', 'scripts/synthetic-lab/viewscope/', 'config/synthetic-lab/viewscope/', 'tests/synthetic-lab/viewscope', 'docs/synthetic-lab/VIEWSCOPE_V2']
DATA = ['persona/models', 'persona/harmonized', 'egps', 'p7a', 'ase', 'studies', 'benchmarks', 'panels', 'gpm', 'global-behavior-evidence', 'research', 'validations', 'pasok', 'cce', 'consumer-decision']
CACHE_HINTS = ('/cache/', '/embed/', '__pycache__', '.pyc')
SHALLOW = ['lake', 'raw']

def sha(p):
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''): h.update(b)
    return h.hexdigest()

def allowed_new(rel): return any(rel.startswith(a) for a in NEW_ALLOWED)

def collect():
    out = {'git': {}, 'data': {}, 'shallow': {}}
    files = subprocess.run(['git', 'ls-files', '--', *GIT_PATHS], cwd=ROOT, capture_output=True, text=True, check=True).stdout.split('\n')
    for rel in filter(None, files):
        if allowed_new(rel): continue
        p = os.path.join(ROOT, rel)
        out['git'][rel] = sha(p) if os.path.exists(p) else None
    dr = os.path.join(ROOT, '.synthetic-lab-data')
    for d in DATA:
        for base, _, fs in os.walk(os.path.join(dr, d)):
            for f in fs:
                p = os.path.join(base, f); rel = os.path.relpath(p, dr)
                if any(h in '/' + rel for h in CACHE_HINTS): continue
                out['data'][rel] = sha(p)
    for d in SHALLOW:
        for base, _, fs in os.walk(os.path.join(dr, d)):
            for f in fs:
                p = os.path.join(base, f); rel = os.path.relpath(p, dr)
                if rel.endswith(('-wal', '-shm', '-journal')): continue
                out['shallow'][rel] = os.path.getsize(p)
    return out

def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else 'verify'
    t0 = time.time(); cur = collect()
    if mode == 'snapshot':
        if os.path.exists(MAN) and '--force' not in sys.argv: sys.exit('Υπάρχει ήδη αρχική κατάσταση· δεν αντικαθίσταται (χρησιμοποίησε --force μόνο αν το εγκρίνει ο χρήστης).')
        head = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=ROOT, capture_output=True, text=True).stdout.strip()
        json.dump({'createdAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'gitHead': head, **cur}, open(MAN, 'w'), indent=0, sort_keys=True)
        print(f"snapshot: git {len(cur['git'])} · data {len(cur['data'])} · shallow {len(cur['shallow'])} αρχεία ({time.time()-t0:.0f} δ)"); return
    base = json.load(open(MAN)); report = {'changed': [], 'missing': [], 'added_protected': [], 'shallow_changed': []}
    for k in ('git', 'data'):
        for rel, h in base[k].items():
            if rel not in cur[k]: report['missing'].append(f'{k}:{rel}')
            elif cur[k][rel] != h: report['changed'].append(f'{k}:{rel}')
        for rel in cur[k]:
            if rel not in base[k]: report['added_protected'].append(f'{k}:{rel}')
    for rel, s in base['shallow'].items():
        if cur['shallow'].get(rel) != s: report['shallow_changed'].append(rel)
    ok = not report['changed'] and not report['missing']
    summary = {'ok': ok, 'checkedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'baselineGitHead': base['gitHead'],
               'counts': {k: len(base[k]) for k in ('git', 'data', 'shallow')}, **{k: v[:200] for k, v in report.items()}, 'n_added_protected': len(report['added_protected'])}
    print(json.dumps(summary, ensure_ascii=False, indent=1)[:4000])
    if '--out' in sys.argv: json.dump(summary, open(sys.argv[sys.argv.index('--out') + 1], 'w'), ensure_ascii=False, indent=1)
    sys.exit(0 if ok else 1)

if __name__ == '__main__': main()
