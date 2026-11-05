"""Viewscope v2 — ανεξάρτητος έλεγχος των πινάκων υποομάδων ως πιθανοτικών συνθηκών (vs-xtab) σε ΚΟΙΝΑ πραγματικά μικροδεδομένα.

Σχεδιασμός (ρεαλιστική μεταφορά, χωρίς χρήση των δεδομένων-στόχου για εκτίμηση):
  πίνακας P(απάντηση | ομάδα) από το ΠΡΟΗΓΟΥΜΕΝΟ κύμα A (όπως ένας δημοσιευμένος πίνακας) → εφαρμόζεται στο κύμα-στόχο B,
  με το ΠΡΑΓΜΑΤΙΚΟ συνολικό ποσοστό του B (ώστε να μετριέται μόνο η κοινή δομή) και ελεγχόμενη συμφιλίωση (IPF).
  Ζεύγη: ESS10→ESS11, διαΝΕΟσις 2022→2024 (κοινές οικογένειες), CSES 2015a→2015b, 2015b→2019.
Πρόσωπα: (REAL) τα πραγματικά χαρακτηριστικά των ερωτώμενων του B — απομονώνει τον μηχανισμό· (PIE) για ESS11 (εκτός εκπαίδευσης PIE,
  ψήφος 2023 όπως οι άγκυρες PIE): άγκυρες PIE πάνω στα δημογραφικά του B — η πραγματική διαδρομή παραγωγής.
Μέθοδοι: INDEP (σημερινή) · XT_age · XT_gender · XT_party · XT_ideo · XT_multi (κόμμα + ιδεολογία + ηλικία + φύλο μαζί, IPF).
Μετρικές στο B: σφάλμα συσχετίσεων (Spearman), συμφωνία προσήμου (|r|>0,1), σφάλμα υποομάδων ανά διάσταση (ηλικία, φύλο, μόρφωση,
  κόμμα, ιδεολογία: |P_syn(a|g) − P_real(a|g)|), απόκλιση συνολικών ποσοστών, απόκλιση συμφιλίωσης από τον πίνακα του A, ποικιλία.
Οι σχέσεις ΜΕΣΑ στις ομάδες μένουν άγνωστες: η μέθοδος υποθέτει ρητά υπό-συνθήκη ανεξαρτησία (μετράται πόσο της πραγματικής συνοχής εξηγεί).
  python3 -I scripts/synthetic-lab/viewscope/xtab_eval.py
"""
import json, math, os, sys, time, collections
import numpy as np
import pandas as pd
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import core_eval as ce  # noqa: E402
pie = ce.pie
OUT = os.path.join(ce.ROOT, 'benchmarks', 'viewscope_v2', 'xtab', 'xtab_eval.json')
PAIRS = [('ess10', 'ess11'), ('dn2022a', 'dn2024a'), ('dn2022b', 'dn2024b'), ('dn2022a', 'dn2024c'), ('cses2015a', 'cses2015b'), ('cses2015b', 'cses2019')]
PARTY = {'nd': 'nd', 'syriza': 'syriza', 'pasok': 'pasok', 'kke': 'kke', 'abstain': 'abstain', 'blank': 'abstain', 'invalid': 'abstain'}
def party(v): return None if v in ('', None, 'dk', 'na', 'nan') or (isinstance(v, float) and math.isnan(v)) else PARTY.get(v, 'other')
def ideo(v):
    try: x = float(v)
    except Exception: return None
    if math.isnan(x): return None
    return 'left' if x <= 2 else 'centre_left' if x <= 3 else 'centre' if x <= 4 else 'centre_right' if x <= 5 else 'right'
def age3(v): return {'17-24': '17-34', '25-34': '17-34', '35-44': '35-54', '45-54': '35-54', '55-64': '55+', '65+': '55+'}.get(v)
DIMS = {'party': lambda df: df['pv'].map(party), 'ideology': lambda df: df['lr7'].map(ideo), 'age': lambda df: df['age_band'].map(age3), 'gender': lambda df: df['gender'].where(df['gender'].isin(['male', 'female']))}
METHODS = {'INDEP': [], 'XT_age': ['age'], 'XT_gender': ['gender'], 'XT_party': ['party'], 'XT_ideo': ['ideology'], 'XT_multi': ['party', 'ideology', 'age', 'gender']}

def items_for(a, b):
    ib = json.load(open(os.path.join(ce.DR, 'persona', 'harmonized', 'item_bank.json')))
    A = [i for i in ib if i['file'] == a]; B = [i for i in ib if i['file'] == b]
    if a.startswith('dn'):
        fa = {i['family']: i for i in A}; pairs = [(fa[i['family']], i) for i in B if i['family'] in fa]
    else:
        va = {i['var']: i for i in A}; pairs = [(va[i['var']], i) for i in B if i['var'] in va]
    return [(x, y) for x, y in pairs if y['type'] in ('ordinal', 'binary') and x['type'] in ('ordinal', 'binary')]

def codes_of(it): return sorted(float(o['code']) for o in it['options'] if ce.re.match(r'^-?\d+(\.\d+)?$', o['code']))
def col(df, it, codes):
    v = pd.to_numeric(df[it['id']], errors='coerce') if it['id'] in df else pd.Series(np.nan, index=df.index)
    return v.where(v.isin(codes)).values

def cond_table(vals, groups, codes, w):
    """P(a|g) από το κύμα A (σταθμισμένο), μόνο ομάδες με ≥ 30 απαντήσεις."""
    out = {}
    for g in pd.unique(groups[pd.notna(groups)]):
        m = (groups == g) & ~np.isnan(vals)
        if m.sum() < 30: continue
        out[g] = np.array([w[m & (vals == c)].sum() for c in codes]) / w[m].sum()
    return out

def reconcile(n_g, P, p):
    """IPF 2Δ: γραμμές = n(g) (σύνθεση προσώπων), στήλες = N·p (συνολικό ποσοστό). Κρατά τους λόγους πιθανοτήτων του πίνακα."""
    gs = list(n_g); N = sum(n_g.values())
    T = np.array([n_g[g] * (P[g] + 1e-6) for g in gs]); col = N * p
    for _ in range(200):
        T *= (col / np.maximum(T.sum(0), 1e-12))[None, :]
        T *= (np.array([n_g[g] for g in gs]) / np.maximum(T.sum(1), 1e-12))[:, None]
    Q = {g: T[i] / T[i].sum() for i, g in enumerate(gs)}
    dev = float(np.mean([np.abs(Q[g] - P[g]).mean() for g in gs])) * 100
    return Q, dev, float(np.abs(T.sum(0) / N - p).max()) * 100

def multi_ipf(attrs, dims, conds, p, rng):
    """Πολυδιάστατη συμφιλίωση: κελιά = συνδυασμοί διαστάσεων· περιορισμοί: n(κελί), (διάσταση, απάντηση) για κάθε διάσταση, συνολικό p."""
    cell = pd.Series(list(zip(*[attrs[d] for d in dims]))).astype(str).values
    cells, inv = np.unique(cell, return_inverse=True); n_c = np.bincount(inv).astype(float); N = n_c.sum(); K = len(p)
    T = n_c[:, None] * p[None, :]
    targets = []
    for d in dims:
        g = attrs[d]; ok = pd.notna(g)
        ng = {k: int(((g == k) & ok).sum()) for k in conds[d]}
        if not ng: continue
        Q, _, _ = reconcile(ng, conds[d], p)
        memb = {k: np.array([(g[inv == ci] == k).mean() if (inv == ci).any() else 0 for ci in range(len(cells))]) for k in Q}
        targets.append((memb, {k: ng[k] * Q[k] for k in Q}))
    for _ in range(60):
        for memb, tgt in targets:
            for k, t in tgt.items():
                w = memb[k][:, None]; cur = (T * w).sum(0)
                f = t / np.maximum(cur, 1e-12)
                T = T * (1 - w) + T * w * f[None, :]
        T *= (N * p / np.maximum(T.sum(0), 1e-12))[None, :]
        T *= (n_c / np.maximum(T.sum(1), 1e-12))[:, None]
    return T / T.sum(1, keepdims=True), inv

def assign(probs_per_person, codes, rng):
    """Πιθανοτική ανάθεση με ακριβή πλήθη ανά ομάδα (στρογγυλοποίηση + τυχαία σειρά) — κάθε πρόσωπο κρατά ατομική τυχαιότητα."""
    n = len(probs_per_person); out = np.empty(n)
    keys = [tuple(np.round(x, 6)) for x in probs_per_person]
    groups = collections.defaultdict(list)
    for i, k in enumerate(keys): groups[k].append(i)
    for k, idx in groups.items():
        pr = np.array(k); cnt = np.floor(pr * len(idx)).astype(int); rem = len(idx) - cnt.sum()
        if rem > 0: cnt[np.argsort(-(pr * len(idx) - cnt))[:rem]] += 1
        perm = rng.permutation(idx); pos = 0
        for c, kk in zip(codes, cnt): out[perm[pos:pos + kk]] = c; pos += kk
    return out

def evaluate_pair(a, b, variant, rng_seed=20261116):
    A = pie.read_resp(os.path.join(ce.DR, 'persona', 'harmonized', 'resp', f'{a}.csv.gz'))
    B = pie.read_resp(os.path.join(ce.DR, 'persona', 'harmonized', 'resp', f'{b}.csv.gz'))
    prs = []
    for ia, ib_ in items_for(a, b):
        ca, cb = codes_of(ia), codes_of(ib_)
        if ca != cb or len(cb) < 2: continue
        va, vb = col(A, ia, ca), col(B, ib_, cb)
        if np.sum(~np.isnan(va)) < 200 or np.sum(~np.isnan(vb)) < 200 or len(np.unique(vb[~np.isnan(vb)])) < 2: continue
        prs.append((ia, ib_, ca, va, vb))
    prs = prs[:60]
    if len(prs) < 3: return None
    wA = pd.to_numeric(A['weight'], errors='coerce').fillna(1).values
    attrsA = {d: f(A).values for d, f in DIMS.items()}
    if variant == 'REAL':
        attrsS = {d: f(B).values for d, f in DIMS.items()}
    else:  # PIE: άγκυρες PIE πάνω στα δημογραφικά του B
        skel = B[[c for c in ['age_band', 'gender', 'edu3', 'nuts1', 'urban'] if c in B]].copy().reset_index(drop=True)
        model = json.load(open(os.path.join(ce.DR, 'persona', 'models', 'pie-0.7', 'model.json')))
        P = pie.generate_anchors(model, skel, np.random.default_rng(4242))
        P['pv'] = P['pv'].astype(str); P['lr7'] = pd.to_numeric(P.get('lr7'), errors='coerce')
        attrsS = {d: f(P).values for d, f in DIMS.items()}
    n = len(B); real = np.column_stack([x[4] for x in prs]); codes = [x[2] for x in prs]
    R_real = ce.spearman_matrix(real)
    edu = B['edu3'].values
    eval_dims = {'age': DIMS['age'](B).values, 'gender': DIMS['gender'](B).values, 'edu': np.where(np.isin(edu, ['low', 'medium', 'high']), edu, None),
                 'party': DIMS['party'](B).values, 'ideology': DIMS['ideology'](B).values}
    # Σημ.: στο PIE οι υποομάδες αξιολογούνται με τα χαρακτηριστικά των ΣΥΝΘΕΤΙΚΩΝ προσώπων (ηλικία/φύλο/μόρφωση ίδια με B· κόμμα/ιδεολογία από PIE)
    syn_dims = {**eval_dims, 'party': attrsS['party'], 'ideology': attrsS['ideology']} if variant == 'PIE' else eval_dims
    def cond_err(M, dimvals_syn, dimvals_real):
        errs = []
        for j in range(M.shape[1]):
            for g in pd.unique(dimvals_real[pd.notna(dimvals_real)]):
                mr = (dimvals_real == g) & ~np.isnan(real[:, j]); ms = (dimvals_syn == g)
                if mr.sum() < 50 or ms.sum() < 50: continue
                pr = np.array([(real[mr, j] == c).mean() for c in codes[j]]); ps = np.array([(M[ms, j] == c).mean() for c in codes[j]])
                errs.append(np.abs(pr - ps).mean() * 100)
        return float(np.mean(errs)) if errs else None
    res = {'pair': f'{a}→{b}', 'variant': variant, 'items': len(prs), 'n': n, 'methods': {}}
    for mname, dims in METHODS.items():
        rng = np.random.default_rng(rng_seed); M = np.empty((n, len(prs))); devs, margdev = [], []
        for j, (ia, ib_, cs, va, vb) in enumerate(prs):
            p = np.array([(vb[~np.isnan(vb)] == c).mean() for c in cs])
            conds = {d: cond_table(va, attrsA[d], cs, wA) for d in dims}
            conds = {d: c for d, c in conds.items() if len(c) >= 2}
            if not conds:
                probs = np.tile(p, (n, 1))
            elif len(conds) == 1:
                d = list(conds)[0]; g = attrsS[d]
                ng = {k: int((g == k).sum()) for k in conds[d] if (g == k).sum() > 0}
                Q, dev, md = reconcile(ng, {k: conds[d][k] for k in ng}, p); devs.append(dev)
                probs = np.array([Q[g[i]] if g[i] in Q else p for i in range(n)])
            else:
                Pc, inv = multi_ipf(attrsS, list(conds), conds, p, rng); probs = Pc[inv]
            M[:, j] = assign(probs, cs, rng)
            margdev.append(float(np.abs(np.array([(M[:, j] == c).mean() for c in cs]) - p).max()) * 100)
        R = ce.spearman_matrix(M); errs, sok, sn = [], 0, 0
        for x in range(len(prs)):
            for y in range(x + 1, len(prs)):
                if np.isnan(R_real[x, y]) or np.isnan(R[x, y]): continue
                errs.append(abs(R[x, y] - R_real[x, y]))
                if abs(R_real[x, y]) > 0.1: sn += 1; sok += int(np.sign(R[x, y]) == np.sign(R_real[x, y]))
        res['methods'][mname] = {'corrErr': float(np.mean(errs)), 'signAgree': sok / sn if sn else None, 'signPairs': sn, 'pairs': len(errs),
                                 'subgroupErr': {k: cond_err(M, syn_dims[k], eval_dims[k]) if variant == 'REAL' else cond_err(M, syn_dims[k], eval_dims[k]) for k in eval_dims},
                                 'reconcileDevPp': float(np.mean(devs)) if devs else None, 'maxMarginalDevPp': float(np.max(margdev)),
                                 'diversity': ce.hamming(M, np.random.default_rng(1)) / ce.hamming(real, np.random.default_rng(1)),
                                 'perItemErr': [float(np.nanmean([abs(R[x, y] - R_real[x, y]) for y in range(len(prs)) if y != x and not np.isnan(R_real[x, y]) and not np.isnan(R[x, y])])) for x in range(len(prs))]}
        m = res['methods'][mname]; print(f"  {res['pair']:22s} {variant:4s} {mname:9s} corrErr {m['corrErr']:.4f} sign {m['signAgree'] or 0:.3f} sub {json.dumps({k: round(v, 2) if v else None for k, v in m['subgroupErr'].items()})} recon {m['reconcileDevPp']} marg {m['maxMarginalDevPp']:.2f}", flush=True)
    return res

def main():
    t0 = time.time(); out = {'design': __doc__.split('\n\n')[1], 'results': []}
    for a, b in PAIRS:
        r = evaluate_pair(a, b, 'REAL')
        if r: out['results'].append(r)
    r = evaluate_pair('ess10', 'ess11', 'PIE')
    if r: out['results'].append(r)
    # σύνοψη + bootstrap ανά ερώτηση (XT_multi − INDEP) για κάθε ζεύγος
    rng = np.random.default_rng(20261116); out['summary'] = []
    for r in out['results']:
        for m in METHODS:
            if m == 'INDEP': continue
            d = np.array(r['methods'][m]['perItemErr']) - np.array(r['methods']['INDEP']['perItemErr'])
            d = d[~np.isnan(d)]
            b = [rng.choice(d, len(d)).mean() for _ in range(2000)] if len(d) > 2 else [np.nan]
            out['summary'].append({'pair': r['pair'], 'variant': r['variant'], 'method': m, 'diffCorrErr': float(d.mean()), 'ci95': [float(np.percentile(b, 2.5)), float(np.percentile(b, 97.5))]})
    out['seconds'] = round(time.time() - t0, 1)
    os.makedirs(os.path.dirname(OUT), exist_ok=True); json.dump(out, open(OUT, 'w'), ensure_ascii=False, indent=1, default=lambda x: None)
    print('δευτ.', out['seconds'])

if __name__ == '__main__': main()
