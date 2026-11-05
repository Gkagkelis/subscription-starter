"""Viewscope benchmark v1 — αναφορά συνοχής από ΠΡΑΓΜΑΤΙΚΑ ελληνικά μικροδεδομένα (μόνο ανάγνωση).
Ίδια μέθοδος με το runtime_coherence.ts: μέση V Cramér ανά ζεύγος ερωτήσεων μείον το επίπεδο ανεξαρτησίας (τυχαία ανακατεμένες στήλες),
σε τυχαίο υποδείγμα n = 500 (ίδιο n με τις συνθετικές εκτελέσεις, γιατί η V έχει θετική μεροληψία σε μικρά n)."""
import csv, gzip, json, math, os, random, sys
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
RESP = os.path.join(ROOT, '.synthetic-lab-data', 'persona', 'harmonized', 'resp')
OUT = os.path.join(ROOT, 'benchmarks', 'viewscope_v1', 'results', 'real_coherence_reference.csv')
SEED, N, MAXQ = 20261105, 500, 40

def cramers_v(a, b):
    pairs = [(x, y) for x, y in zip(a, b) if x and y]
    n = len(pairs)
    if n < 30: return None
    la = sorted({x for x, _ in pairs}); lb = sorted({y for _, y in pairs})
    if len(la) < 2 or len(lb) < 2: return None
    ia = {x: i for i, x in enumerate(la)}; ib = {y: i for i, y in enumerate(lb)}
    t = [[0] * len(lb) for _ in la]
    for x, y in pairs: t[ia[x]][ib[y]] += 1
    rs = [sum(r) for r in t]; cs = [sum(t[i][j] for i in range(len(la))) for j in range(len(lb))]
    chi = sum((t[i][j] - rs[i] * cs[j] / n) ** 2 / (rs[i] * cs[j] / n) for i in range(len(la)) for j in range(len(lb)))
    return math.sqrt(chi / n / min(len(la) - 1, len(lb) - 1))

rows_out = []
for name in ['dn2024a', 'dn2024b', 'dn2024c', 'dn2022a', 'ess11', 'covidistress']:
    p = os.path.join(RESP, f'{name}.csv.gz')
    if not os.path.exists(p): continue
    r = csv.reader(gzip.open(p, 'rt')); h = next(r); data = list(r)
    rnd = random.Random(SEED)
    sub = rnd.sample(data, min(N, len(data)))
    items = [i for i, c in enumerate(h) if '::' in c]
    items = [i for i in items if sum(1 for row in sub if row[i]) >= 100][:MAXQ]  # ερωτήσεις με επαρκείς απαντήσεις (πρώτες MAXQ, κατά σειρά ερωτηματολογίου)
    cols = [[row[i] for row in sub] for i in items]
    nulls = [rnd.sample(c, len(c)) for c in cols]
    vs, v0 = [], []
    for i in range(len(cols)):
        for j in range(i + 1, len(cols)):
            v = cramers_v(cols[i], cols[j]); w = cramers_v(nulls[i], nulls[j])
            if v is not None and w is not None: vs.append(v); v0.append(w)
    m, m0 = sum(vs) / len(vs), sum(v0) / len(v0)
    rows_out.append({'source': name, 'n_sub': len(sub), 'questions': len(cols), 'pairs': len(vs), 'meanV': round(m, 3), 'meanV_null': round(m0, 3), 'excessV': round(m - m0, 3)})
    print(rows_out[-1])
with open(OUT, 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=list(rows_out[0].keys())); w.writeheader(); w.writerows(rows_out)
