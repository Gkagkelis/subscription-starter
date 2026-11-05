"""Viewscope v2 — Βήμα 2: αξιολόγηση του ΚΟΙΝΟΥ ΣΥΝΘΕΤΙΚΟΥ ΑΝΘΡΩΠΟΥ σε πραγματικές ελληνικές έρευνες εκτός εκπαίδευσης PIE.
Προκαταχώριση: docs/synthetic-lab/VIEWSCOPE_V2_PREREGISTRATION.md §Δ.

Για κάθε ερώτηση-στόχο δίνεται το ΠΡΑΓΜΑΤΙΚΟ περιθώριό της (ώστε να απομονωθεί η κοινή δομή από το επίπεδο) και συγκρίνονται
τρεις τρόποι ανάθεσης «ποιος δίνει ποια απάντηση» (το περιθώριο διατηρείται ακριβώς σε όλους):
  INDEP — ανεξάρτητη ανάθεση (σημερινή συμπεριφορά των διαδρομών περιθωρίου: δημοσιευμένα κύματα, B5, σενάρια)
  DEMO  — σκορ από συγγενικά items της PIE μόνο με δημογραφικά (άγκυρες στον μέσο όρο, χωρίς λανθάνοντα)
  CORE  — σκορ από συγγενικά items της PIE με δημογραφικά + άγκυρες + κοινά λανθάνοντα (ίδιος μηχανισμός με την PIE/IQGE)
Συγγενικά items: pie-0.7, εκτιμημένα σε ΑΛΛΕΣ έρευνες (διαΝΕΟσις, CSES, MAPLE, UNDP)· επιλογή με πολύγλωσσα embeddings,
πρόσημο από την ευθυγράμμιση των ετικετών των άκρων της κλίμακας (αμφίσημο → το item δεν χρησιμοποιείται).
Η εξασθένιση a ∈ {0,25, 0,5, 0,75, 1} επιλέγεται ΜΟΝΟ στις έρευνες ανάπτυξης· οι μετρήσεις αναφέρονται στις έρευνες ελέγχου.
Το BankSat εξαιρείται (καραντίνα). Δεν κατασκευάζονται δεδομένα: οι πραγματικές απαντήσεις χρησιμοποιούνται μόνο ως σημείο σύγκρισης.
  python3 -I scripts/synthetic-lab/viewscope/core_eval.py
"""
import gzip, json, math, os, re, sys, time, unicodedata, hashlib
import numpy as np
import pandas as pd
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'scripts', 'synthetic-lab', 'persona'))
import pie  # noqa: E402
from embed import Embedder, clean  # noqa: E402
DR = os.path.join(ROOT, '.synthetic-lab-data')
OUT = os.path.join(ROOT, 'benchmarks', 'viewscope_v2', 'results')
CACHE = os.environ.get('VS_CACHE', '/tmp/vs_core_cache'); os.makedirs(CACHE, exist_ok=True)
MODEL = 'pie-0.7'
DEV = ['ess10', 'wellcome2020', 'tisp', 'hbs2018']
TEST = ['ess11', 'culture', 'covidistress', 'dinas', 'demotec2022', 'qog2024', 'hbs2019']
ATTEN = [0.25, 0.5, 0.75, 1.0]
SIM_MIN, TOPK, MAXQ, SIGN_MIN = 0.55, 3, 60, 0.05
SKEL = ['age_band', 'gender', 'edu3', 'nuts1', 'urban']
QUAR = json.load(open(os.path.join(ROOT, 'config', 'synthetic-lab', 'viewscope', 'dataset-quarantine.json')))['datasets']

def norm(s):
    s = unicodedata.normalize('NFD', (s or '').lower()); return ''.join(c for c in s if unicodedata.category(c) != 'Mn')
DOMAIN_RULES = [('POLITICAL', r'(ψηφ|κομμ|εκλογ|βουλ|κυβερν|πρωθυπουργ|αρχηγ|πολιτικ|δημοκρατ|θεσμ|vote|party|election|government|parliament|politic|democra)'),
                ('CONSUMER', r'(αγορ|ψωνι|σουπερ\s?μαρκετ|μαρκ|προιον|τιμη|τιμες|εκπτωσ|συνδρομ|παροχ|κινητ|streaming|netflix|καταστημ|ηλεκτρονικ\w* αγορ|brand|shop|price|subscription|provider|purchase|buy)'),
                ('MEDIA_TECH', r'(ιντερνετ|διαδικτυ|τηλεορασ|εφημεριδ|ειδησ|μεσα κοινωνικ|social media|κινητο τηλεφων|τεχνητη νοημοσυν|internet|television|news|online|smartphone|\bai\b)'),
                ('ECONOMIC', r'(οικονομ|εισοδημ|μισθ|ανεργ|πληθωρισμ|δαπαν|δαν|λογαριασμ|economy|income|job|unemploy|inflation|debt|bills)')]
def domain(item, file):
    """Ίδιοι κανόνες με detectDomain (lib/synthetic-lab/persona/evidence-tier.ts)· MEDIA_TECH → καταναλωτικός (κατανάλωση μέσων/τεχνολογίας).
    Κατανάλωση νοικοκυριού (HBS) και πολιτιστική συμμετοχή (Culture), όταν οι κανόνες δεν βρίσκουν τομέα → καταναλωτικός."""
    t = norm(item['text'] + ' ' + ' '.join(o['label'] for o in item['options']))
    for d, rx in DOMAIN_RULES:
        if re.search(rx, t): return {'MEDIA_TECH': 'consumer'}.get(d, d.lower())
    if file.startswith('hbs') or file == 'culture' or item.get('construct') == 'household_consumption': return 'consumer'
    return 'social'

def load_items(file):
    if file.startswith('ess') or file.startswith('hbs') or file == 'demotec2022':
        ib = json.load(open(os.path.join(DR, 'persona', 'harmonized', 'item_bank.json')))
        return [i for i in ib if i['file'] == file]
    q = json.load(open(os.path.join(DR, 'persona', 'phase4', 'holdouts', file, 'questions.json')))
    return [{**i, 'file': file} for i in q]

def eligible(items, real):
    out = []
    for it in items:
        if it.get('type') not in ('ordinal', 'binary'): continue
        col = it['id']
        if col not in real.columns: continue
        codes = sorted({o['code'] for o in it['options']}, key=lambda c: float(c) if re.match(r'^-?\d+(\.\d+)?$', c) else 1e9)
        if any(not re.match(r'^-?\d+(\.\d+)?$', c) for c in codes): continue
        v = pd.to_numeric(real[col], errors='coerce')
        v = v.where(v.isin([float(c) for c in codes]))
        if v.notna().sum() < 200 or v.nunique() < 2: continue
        lab = {o['code']: o['label'] for o in it['options']}
        out.append({**it, 'codes': [float(c) for c in codes], 'lowLabel': lab[codes[0]], 'highLabel': lab[codes[-1]], 'real': v.values})
        if len(out) >= MAXQ: break
    return out

def embed_cached(emb, texts, tag):
    key = hashlib.sha1(('\n'.join(texts) + tag).encode()).hexdigest()[:16]
    f = os.path.join(CACHE, f'{tag}_{key}.npy')
    if os.path.exists(f): return np.load(f)
    E = emb.encode(texts); np.save(f, E); return E

def spearman_matrix(M):
    """Spearman ανά ζεύγος στηλών (pairwise complete)."""
    k = M.shape[1]; R = np.full((k, k), np.nan)
    for a in range(k):
        for b in range(a + 1, k):
            ok = ~np.isnan(M[:, a]) & ~np.isnan(M[:, b])
            if ok.sum() < 100: continue
            x = pd.Series(M[ok, a]).rank().values; y = pd.Series(M[ok, b]).rank().values
            if x.std() == 0 or y.std() == 0: continue
            R[a, b] = R[b, a] = np.corrcoef(x, y)[0, 1]
    return R

def assign_quantile(z, real_vals, codes):
    """Ακριβής διατήρηση του πραγματικού περιθωρίου: ταξινόμηση z → κατηγορίες με τα πραγματικά ποσοστά."""
    v = real_vals[~np.isnan(real_vals)]
    props = np.array([(v == c).mean() for c in codes])
    n = len(z); counts = np.floor(props * n).astype(int); counts[np.argmax(props)] += n - counts.sum()
    order = np.argsort(z, kind='stable'); out = np.empty(n)
    pos = 0
    for c, k in zip(codes, counts): out[order[pos:pos + k]] = c; pos += k
    return out

def latent_prop(item, P, rng, model, mode):
    """η + e του συγγενικού item για κάθε πρόσωπο (ίδιος τύπος με pie.answer_item / IQGE runtime)."""
    X = pie.feature_columns(P)
    if mode == 'DEMO':
        demo_feats = {f for f in pie.FEATURES if f.startswith(('age_', 'female', 'edu_', 'n_', 'rural'))}
        X = X.copy()
        for i, f in enumerate(pie.FEATURES):
            if f not in demo_feats: X[:, i] = np.nan  # → μέσος όρος του item (design)
    Z, _ = pie.design(X, item['feats'], np.array(item['means']))
    eta = Z @ np.array(item['model']['b']); n = len(P)
    if mode == 'DEMO': return eta + rng.standard_normal(n)
    shared_only = mode == 'CORE_ETA'  # μόνο κοινό μέρος του προσώπου: η + κοινά λανθάνοντα, χωρίς ιδιοσυγκρασιακό θόρυβο του item
    noise = (lambda: np.zeros(n)) if shared_only else (lambda: rng.standard_normal(n))
    lam = float(item.get('lambda', 0.0))
    ckey, g = pie.construct_load(item, model)
    if item.get('latentRow'):
        e = np.zeros(n)
        for k, l in enumerate(item['latentRow']):
            if l: e += l * pie.theta(P, f"{item['factorKey']}#{k}")
        e += math.sqrt(max(1 - sum(l * l for l in item['latentRow'] if l), 0.0)) * noise()
    elif item.get('factorKey') and lam:
        th = pie.theta(P, item['factorKey'])
        if ckey: th = g * pie.theta(P, ckey) + math.sqrt(max(1 - g * g, 0)) * th
        e = lam * th + math.sqrt(max(1 - lam * lam, 0)) * noise()
    elif ckey:
        e = g * pie.theta(P, ckey) + math.sqrt(max(1 - g * g, 0)) * noise()
    else:
        e = noise()
    return eta + e

def links_for(targets, pitems, PE, emb, file):
    T = embed_cached(emb, [clean(t['text']) for t in targets], f'tq_{file}')
    TL = embed_cached(emb, [t['lowLabel'] for t in targets], f'tl_{file}'); TH = embed_cached(emb, [t['highLabel'] for t in targets], f'th_{file}')
    S = T @ PE['q'].T
    links = []
    for i, t in enumerate(targets):
        cand = [j for j in np.argsort(-S[i])[:25] if S[i, j] >= SIM_MIN][:TOPK * 3]
        L = []
        for j in cand:
            d = TL[i] @ PE['lo'][j] + TH[i] @ PE['hi'][j] - TL[i] @ PE['hi'][j] - TH[i] @ PE['lo'][j]
            if abs(d) < SIGN_MIN: continue
            L.append({'j': int(j), 'itemId': pitems[j]['id'], 'sim': float(S[i, j]), 'sign': 1 if d > 0 else -1})
            if len(L) >= TOPK: break
        tot = sum(x['sim'] for x in L)
        for x in L: x['weight'] = x['sim'] / tot
        links.append(L)
    return links

def synth(targets, links, P, model, pitems, mode, a, seed):
    rng = np.random.default_rng(seed); n = len(P); M = np.empty((n, len(targets)))
    cache = {}
    for i, t in enumerate(targets):
        L = links[i] if mode != 'INDEP' else []
        if L:
            s = np.zeros(n)
            for x in L:
                key = (x['j'], mode)
                if key not in cache: cache[key] = latent_prop(pitems[x['j']], P, np.random.default_rng([seed, x['j']]), model, mode)
                v = cache[key]; s += x['weight'] * x['sign'] * (v - v.mean()) / (v.std() + 1e-9)
            s = (s - s.mean()) / (s.std() + 1e-9)
            z = a * s + math.sqrt(max(1 - a * a, 0)) * rng.standard_normal(n)
        else:
            z = rng.standard_normal(n)
        M[:, i] = assign_quantile(z, t['real'], t['codes'])
    return M

def score01(M, codes_list):
    out = np.empty_like(M)
    for i, codes in enumerate(codes_list):
        lo, hi = codes[0], codes[-1]; out[:, i] = (M[:, i] - lo) / (hi - lo) if hi > lo else 0
    return out

def subgroup_diffs(M01, grp):
    a, b = grp
    return np.array([np.nanmean(M01[a, i]) - np.nanmean(M01[b, i]) if a.sum() > 30 and b.sum() > 30 else np.nan for i in range(M01.shape[1])])

def hamming(M, rng, pairs=3000):
    n = M.shape[0]; i = rng.integers(0, n, pairs); j = rng.integers(0, n, pairs)
    A, B = M[i], M[j]; ok = ~np.isnan(A) & ~np.isnan(B)
    return float(np.nanmean(np.where(ok, A != B, np.nan)))

def evaluate(file, ctx, a_by_mode=None, seeds=(11, 12, 13)):
    real = pie.read_resp(os.path.join(DR, 'persona', 'harmonized', 'resp', f'{file}.csv.gz'))
    targets = eligible(load_items(file), real)
    if len(targets) < 5: return None
    links = links_for(targets, ctx['pitems'], ctx['PE'], ctx['emb'], file)
    skel = real[[c for c in SKEL if c in real]].copy().reset_index(drop=True)
    P = pie.generate_anchors(ctx['model'], skel, np.random.default_rng(4242))
    Rm = np.column_stack([t['real'] for t in targets]); Rr = spearman_matrix(Rm)
    doms = [domain(t, file) for t in targets]; codes = [t['codes'] for t in targets]
    age = real['age_band'].values if 'age_band' in real else np.array([None] * len(real))
    edu = real['edu3'].values if 'edu3' in real else np.array([None] * len(real))
    groups = {'age': (np.isin(age, ['17-24', '25-34']), np.isin(age, ['55-64', '65+'])), 'edu': (edu == 'high', edu == 'low')}
    R01 = score01(Rm, codes)
    real_sub = {g: subgroup_diffs(R01, groups[g]) for g in groups}
    res = {'file': file, 'n': len(real), 'items': len(targets), 'linked': sum(1 for L in links if L), 'domains': {d: doms.count(d) for d in set(doms)}, 'modes': {}}
    modes = {'INDEP': [None]} if a_by_mode is None else {'INDEP': [None], **{m: [a] for m, a in a_by_mode.items()}}
    if a_by_mode is None: modes.update({'DEMO': ATTEN, 'CORE': ATTEN, 'CORE_ETA': ATTEN})
    for mode, alist in modes.items():
        for a in alist:
            per = []
            for sd in seeds:
                S = synth(targets, links, P, ctx['model'], ctx['pitems'], mode, a or 0, sd)
                Rs = spearman_matrix(S); S01 = score01(S, codes)
                per.append({'Rs': Rs, 'sub': {g: subgroup_diffs(S01, groups[g]) for g in groups}, 'ham': hamming(S, np.random.default_rng(sd))})
            Rs = np.nanmean([p['Rs'] for p in per], axis=0)
            sub = {g: np.nanmean([p['sub'][g] for p in per], axis=0) for g in groups}
            res['modes'][f'{mode}' + (f'@{a}' if a else '')] = {'Rs': Rs, 'sub': sub, 'ham': float(np.mean([p['ham'] for p in per]))}
    res.update({'Rr': Rr, 'realSub': real_sub, 'realHam': hamming(Rm, np.random.default_rng(1)), 'doms': doms, 'links': [[{k: x[k] for k in ('itemId', 'sim', 'sign', 'weight')} for x in L] for L in links],
                'targets': [{'id': t['id'], 'text': t['text'][:140], 'domain': d} for t, d in zip(targets, doms)]})
    return res

def pair_metrics(res, key, dom=None):
    Rr, Rs, doms = res['Rr'], res['modes'][key]['Rs'], res['doms']; k = len(doms)
    err, sign_ok, sign_n, per_item = [], 0, 0, {i: [] for i in range(k)}
    for a in range(k):
        for b in range(a + 1, k):
            if np.isnan(Rr[a, b]) or np.isnan(Rs[a, b]): continue
            d = doms[a] if doms[a] == doms[b] else 'cross'
            if dom and d != dom: continue
            e = abs(Rs[a, b] - Rr[a, b]); err.append(e); per_item[a].append(e); per_item[b].append(e)
            if abs(Rr[a, b]) > 0.1: sign_n += 1; sign_ok += int(np.sign(Rs[a, b]) == np.sign(Rr[a, b]))
    items = [i for i in range(k) if (dom is None or doms[i] == dom)]
    sub = np.nanmean([abs(res['modes'][key]['sub'][g][i] - res['realSub'][g][i]) for g in ('age', 'edu') for i in items]) if items else np.nan
    return {'pairs': len(err), 'corrErr': float(np.mean(err)) if err else np.nan, 'signAgree': sign_ok / sign_n if sign_n else np.nan, 'signPairs': sign_n,
            'subErr': float(sub), 'perItem': {i: float(np.mean(v)) for i, v in per_item.items() if v}, 'diversityRatio': res['modes'][key]['ham'] / res['realHam']}

def main():
    t0 = time.time()
    for f in DEV + TEST: assert f not in QUAR, f'{f} σε καραντίνα'
    model = json.load(open(os.path.join(DR, 'persona', 'models', MODEL, 'model.json')))
    itemsj = json.load(open(os.path.join(DR, 'persona', 'models', MODEL, 'items.json')))
    pitems = [i for i in (itemsj['items'] if isinstance(itemsj, dict) else itemsj) if i['model']['kind'] == 'ordinal']
    trained = {s['fileId'] for s in model['sources']}
    assert not (set(DEV + TEST) & trained), 'αρχείο αξιολόγησης μέσα στην εκπαίδευση'
    emb = Embedder(ROOT)
    PE = {'q': embed_cached(emb, [clean(i['text']) for i in pitems], 'pie07q'),
          'lo': embed_cached(emb, [i['options'][0]['label'] for i in pitems], 'pie07lo'),
          'hi': embed_cached(emb, [i['options'][-1]['label'] for i in pitems], 'pie07hi')}
    model['items'] = pitems
    ctx = {'model': model, 'pitems': pitems, 'PE': PE, 'emb': emb}
    # 1) ανάπτυξη: επιλογή εξασθένισης ανά τρόπο (μόνο έρευνες ανάπτυξης)
    dev = [r for r in (evaluate(f, ctx) for f in DEV) if r]
    choice = {}
    for mode in ('DEMO', 'CORE', 'CORE_ETA'):
        best = None
        for a in ATTEN:
            e = np.mean([pair_metrics(r, f'{mode}@{a}')['corrErr'] for r in dev])
            if best is None or e < best[1]: best = (a, e)
        choice[mode] = best[0]
    devsum = {r['file']: {k: {m: v for m, v in pair_metrics(r, k).items() if m != 'perItem'} for k in r['modes']} for r in dev}
    # 2) έλεγχος: μόνο οι επιλεγμένες τιμές
    # Επιλογή παραλλαγής πυρήνα ΜΟΝΟ στην ανάπτυξη (CORE = προκαταχωρημένη· CORE_ETA = μεταγενέστερη παραλλαγή χωρίς ιδιοσυγκρασιακό θόρυβο)
    dev_err = {m: np.mean([pair_metrics(r, f'{m}@{choice[m]}')['corrErr'] for r in dev]) for m in ('CORE', 'CORE_ETA')}
    variant = min(dev_err, key=dev_err.get)
    test = [r for r in (evaluate(f, ctx, choice) for f in TEST) if r]
    keys = ['INDEP', f"DEMO@{choice['DEMO']}", f"{variant}@{choice[variant]}", f"{'CORE_ETA' if variant == 'CORE' else 'CORE'}@{choice['CORE_ETA' if variant == 'CORE' else 'CORE']}"]
    out = {'preregistration': 'docs/synthetic-lab/VIEWSCOPE_V2_PREREGISTRATION.md §Δ', 'model': MODEL, 'dev': DEV, 'test': TEST, 'attenChosenOnDev': choice,
           'variantChosenOnDev': variant, 'devCorrErr': dev_err, 'note': 'CORE_ETA προστέθηκε ΜΕΤΑ την πρώτη εκτέλεση (εσωτερικός έλεγχος έδειξε αραίωση από ιδιοσυγκρασιακό θόρυβο)· η επιλογή παραλλαγής και εξασθένισης γίνεται μόνο στις έρευνες ανάπτυξης. Η απόφαση ανά τομέα αφορά την επιλεγμένη παραλλαγή.',
           'settings': {'simMin': SIM_MIN, 'topK': TOPK, 'maxItemsPerSurvey': MAXQ, 'signMin': SIGN_MIN, 'seeds': 3}, 'devSummary': devsum, 'test': {}, 'byDomain': {}, 'decision': {}}
    rng = np.random.default_rng(20261105)
    for dom in ['political', 'social', 'economic', 'consumer', 'cross', None]:
        rows = {k: [] for k in keys}; diffs_item = []
        for r in test:
            pm = {k: pair_metrics(r, k, dom) for k in keys}
            for k in keys: rows[k].append({**{m: v for m, v in pm[k].items() if m != 'perItem'}, 'file': r['file']})
            ci, ii = pm[keys[2]]['perItem'], pm['INDEP']['perItem']
            diffs_item += [ci[i] - ii[i] for i in ci if i in ii]
        def pooled(k, m):
            v = [(x[m], x['pairs'] if m in ('corrErr', 'diversityRatio') else (x['signPairs'] if m == 'signAgree' else 1)) for x in rows[k] if x['pairs'] and not np.isnan(x[m])]
            return float(np.average([a for a, _ in v], weights=[w for _, w in v])) if v else None
        summ = {k: {m: pooled(k, m) for m in ('corrErr', 'signAgree', 'subErr', 'diversityRatio')} | {'pairs': sum(x['pairs'] for x in rows[k])} for k in keys}
        d = np.array(diffs_item)
        boots = [rng.choice(d, len(d)).mean() for _ in range(4000)] if len(d) > 2 else []
        ci95 = [float(np.percentile(boots, 2.5)), float(np.percentile(boots, 97.5))] if boots else [None, None]
        name = dom or 'ALL'
        out['byDomain'][name] = {'metrics': summ, 'coreMinusIndepPerItem': {'mean': float(d.mean()) if len(d) else None, 'ci95': ci95, 'items': len(d)}, 'perFile': rows}
        c, i = summ[keys[2]], summ['INDEP']
        if c['pairs']:
            ok = {'corr': ci95[1] is not None and ci95[1] < 0, 'sign': (c['signAgree'] or 0) >= (i['signAgree'] or 0),
                  'subgroup': c['subErr'] is not None and i['subErr'] is not None and c['subErr'] <= i['subErr'] + 0.005,
                  'diversity': c['diversityRatio'] is not None and 0.9 <= c['diversityRatio'] <= 1.1}
            out['decision'][name] = {'criteria': ok, 'keepCore': all(ok.values())}
    out['testFiles'] = [{'file': r['file'], 'n': r['n'], 'items': r['items'], 'linked': r['linked'], 'domains': r['domains']} for r in test]
    out['links'] = {r['file']: [{'target': t, 'analogs': L} for t, L in zip(r['targets'], r['links'])] for r in test}
    out['seconds'] = round(time.time() - t0, 1)
    os.makedirs(OUT, exist_ok=True)
    json.dump(out, open(os.path.join(OUT, 'core_eval.json'), 'w'), ensure_ascii=False, indent=1, default=lambda x: None if isinstance(x, float) and math.isnan(x) else x)
    print(json.dumps({'attenChosenOnDev': choice, 'decision': out['decision'], 'byDomain': {k: {'metrics': v['metrics'], 'diff': v['coreMinusIndepPerItem']} for k, v in out['byDomain'].items()}, 'testFiles': out['testFiles'], 'seconds': out['seconds']}, ensure_ascii=False, indent=1, default=str))

if __name__ == '__main__': main()
