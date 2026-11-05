"""Viewscope v2 — Βήμα 2: εξαγωγή ερευνών ελέγχου ως «σχέδια» για τον έλεγχο του TS runtime (core_runtime_check.ts).
Γράφει ανά έρευνα: ερωτήσεις (κείμενο, κλίμακα με σειρά κωδικών), πραγματικά περιθώρια, πραγματικό πίνακα Spearman, τομείς,
και τις συνδέσεις με την PIE (ίδια διαδικασία με build_core_links.py). Μόνο ανάγνωση.
  python3 -I scripts/synthetic-lab/viewscope/export_core_check.py --out <dir>"""
import argparse, json, os, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import core_eval as ce  # noqa: E402

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--out', required=True); a = ap.parse_args(); os.makedirs(a.out, exist_ok=True)
    cfg = json.load(open(os.path.join(ce.ROOT, 'config', 'synthetic-lab', 'viewscope', 'core.json')))
    itemsj = json.load(open(os.path.join(ce.DR, 'persona', 'models', cfg['model'], 'items.json')))
    pitems = [i for i in (itemsj['items'] if isinstance(itemsj, dict) else itemsj) if i['model']['kind'] == 'ordinal']
    emb = ce.Embedder(ce.ROOT)
    PE = {'q': ce.embed_cached(emb, [ce.clean(i['text']) for i in pitems], 'pie07q'), 'lo': ce.embed_cached(emb, [i['options'][0]['label'] for i in pitems], 'pie07lo'),
          'hi': ce.embed_cached(emb, [i['options'][-1]['label'] for i in pitems], 'pie07hi')}
    for f in ce.TEST:
        real = ce.pie.read_resp(os.path.join(ce.DR, 'persona', 'harmonized', 'resp', f'{f}.csv.gz'))
        ts = ce.eligible(ce.load_items(f), real)
        if len(ts) < 5: continue
        links = ce.links_for(ts, pitems, PE, emb, f)
        Rr = ce.spearman_matrix(np.column_stack([t['real'] for t in ts]))
        qs, marg, doms, L = [], {}, [], {}
        for i, t in enumerate(ts):
            lab = {float(o['code']): o['label'] for o in t['options']}
            qid = f'q{i}'
            qs.append({'id': qid, 'type': 'likert', 'text': t['text'], 'scale': [f"{lab.get(c, str(c))} [{c:g}]" for c in t['codes']]})
            v = t['real'][~np.isnan(t['real'])]; marg[qid] = [float((v == c).mean()) for c in t['codes']]
            d = ce.domain(t, f); doms.append(d)
            L[qid] = {'domain': d, 'enabled': bool(links[i]) and d in cfg['enabledDomains'], 'analogs': [{k: x[k] for k in ('itemId', 'sim', 'sign', 'weight')} for x in links[i]], 'reason': ''}
        json.dump({'file': f, 'n': len(real), 'questions': qs, 'marginals': marg, 'realSpearman': np.where(np.isnan(Rr), None, Rr).tolist(), 'domains': doms,
                   'links': {'version': cfg['version'], 'model': cfg['model'], 'atten': cfg['atten'], 'links': L}}, open(os.path.join(a.out, f'{f}.json'), 'w'), ensure_ascii=False)
        print(f, len(ts), sum(1 for x in L.values() if x['enabled']))

if __name__ == '__main__': main()
