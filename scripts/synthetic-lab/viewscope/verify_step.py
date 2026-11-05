"""Viewscope v2 — υποχρεωτικός έλεγχος μετά από κάθε βήμα.
  python3 -I scripts/synthetic-lab/viewscope/verify_step.py --step 1 [--skip-slow]
Ελέγχει: (1) ακεραιότητα αρχείων (hashes), (2) αποτυπώματα παλινδρόμησης prod-1/EGPS/PIE/structured-1.0,
(3) κλειδωμένες προβλέψεις Phase 7A, (4) επανεκτέλεση πολιτικής αξιολόγησης = αποθηκευμένη, (5) tests TS, (6) tests Python.
Γράφει benchmarks/viewscope_v2/checks/step<N>.json. Έξοδος ≠ 0 αν αποτύχει ουσιώδης έλεγχος."""
import hashlib, json, os, re, subprocess, sys, time
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
OUTD = os.path.join(ROOT, 'benchmarks', 'viewscope_v2', 'checks'); os.makedirs(OUTD, exist_ok=True)
SCR = os.environ.get('VS_SCRATCH', '/tmp/viewscope_verify')
step = sys.argv[sys.argv.index('--step') + 1] if '--step' in sys.argv else 'x'
slow = '--skip-slow' not in sys.argv
def sh(cmd, env=None, timeout=3600):
    t = time.time(); r = subprocess.run(cmd, cwd=ROOT, shell=True, capture_output=True, text=True, env={**os.environ, **(env or {})}, timeout=timeout)
    return r.returncode, (r.stdout + r.stderr)[-3000:], round(time.time() - t, 1)
def sha(p): return hashlib.sha256(open(p, 'rb').read()).hexdigest()
res = {'step': step, 'startedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'checks': {}}
iso = os.path.join(SCR, 'iso'); sh(f'bash scripts/synthetic-lab/viewscope/isolated_data_dir.sh {iso}')
code, out, t = sh(f'python3 -I scripts/synthetic-lab/viewscope/integrity.py verify --out {SCR}/integrity.json')
res['checks']['integrity_hashes'] = {'ok': code == 0, 'seconds': t, 'detail': json.load(open(f'{SCR}/integrity.json')) if os.path.exists(f'{SCR}/integrity.json') else out}
code, out, t = sh('node_modules/.bin/tsx scripts/synthetic-lab/viewscope/regression.ts verify', {'SYNTHETIC_LAB_DATA_DIR': iso})
res['checks']['regression_fingerprints'] = {'ok': code == 0, 'seconds': t, 'detail': out[-1500:]}
hf = open(os.path.join(ROOT, 'docs/synthetic-lab/PHASE7A_PREDICTION_HASHES.txt')).read()
want_csv = re.search(r'PHASE7A_LOCKED_PREDICTIONS\.csv sha256 ([0-9a-f]{64})', hf).group(1)
want_json = re.search(r'predictions\.json sha256 ([0-9a-f]{64})', hf).group(1)
got_csv = sha(os.path.join(ROOT, 'docs/synthetic-lab/PHASE7A_LOCKED_PREDICTIONS.csv')); got_json = sha(os.path.join(ROOT, '.synthetic-lab-data/p7a/predictions/predictions.json'))
res['checks']['phase7a_locked'] = {'ok': got_csv == want_csv and got_json == want_json, 'csv': got_csv, 'json': got_json}
if slow:
    code, out, t = sh('node_modules/.bin/tsx scripts/synthetic-lab/political/eval_political.ts', {'SYNTHETIC_LAB_DATA_DIR': iso}, 3600)
    strip = lambda d: {k: v for k, v in d.items() if k not in ('runAt',)}
    try:
        a = strip(json.load(open(os.path.join(iso, 'benchmarks/political_eval.json')))); b = strip(json.load(open(os.path.join(ROOT, '.synthetic-lab-data/benchmarks/political_eval.json'))))
        res['checks']['political_eval_rerun'] = {'ok': a == b, 'seconds': t}
    except Exception as e:
        res['checks']['political_eval_rerun'] = {'ok': False, 'error': str(e), 'log': out[-800:]}
    code, out, t = sh('npx vitest run tests/synthetic-lab', timeout=2400)
    m = re.search(r'Tests\s+(\d+) passed(?: \((\d+)\))?', out); f = re.search(r'(\d+) failed', out)
    res['checks']['tests_ts'] = {'ok': code == 0, 'seconds': t, 'summary': m.group(0) if m else out[-400:], 'failed': f.group(0) if f else None}
    code, out, t = sh('python3 -I research-engine/tests/run_tests.py', timeout=2400)
    res['checks']['tests_python'] = {'ok': code == 0, 'seconds': t, 'summary': out.strip().splitlines()[-1] if out.strip() else ''}
res['ok'] = all(c['ok'] for c in res['checks'].values())
json.dump(res, open(os.path.join(OUTD, f'step{step}.json'), 'w'), ensure_ascii=False, indent=1)
print(json.dumps({k: (v['ok'], v.get('summary', '')) for k, v in res['checks'].items()}, ensure_ascii=False, indent=1)); print('OK' if res['ok'] else 'ΑΠΟΤΥΧΙΑ')
sys.exit(0 if res['ok'] else 1)
