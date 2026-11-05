"""Viewscope v2 — πίνακες υποομάδων (ανά ψήφο, ιδεολογία, ηλικία, φύλο, μόρφωση) από τα ΥΠΑΡΧΟΝΤΑ PDF του Lab.

  python3 -I scripts/synthetic-lab/viewscope/build_crosstabs.py

Πηγές (μόνο ανάγνωση): persona/pdf/{documents.json, pages.jsonl (σελίδες με κεφαλίδα υποομάδων), tables_visual*.jsonl}.
Εξαγωγή από το κείμενο της σελίδας (pdftotext -layout), σε σειρά ανάγνωσης: κρατιούνται ΜΟΝΟ γραμμές με πλήρη αριθμό κελιών
(καμία μαντεψιά για κενά κελιά). Επαλήθευση (όλα υποχρεωτικά για «verified»):
  V1 κάθε ομάδα αθροίζει 100 ± 2 (μονή επιλογή)·  V2 όλες οι ετικέτες ομάδων αναγνωρίζονται (λεξικό)·  V3 ≥ 2 ομάδες και ≥ 2 επιλογές·
  V4 δεύτερη καταχώριση: το «Σύνολο» του πίνακα (αν υπάρχει) συμφωνεί ±1,5 π.μ. με τον αυτόματο πίνακα συνόλου του ίδιου εγγράφου,
     ή (χωρίς Σύνολο) κάθε τιμή εμφανίζεται ως αριθμός στο κείμενο της σελίδας με την ίδια σειρά (by construction) ΚΑΙ V1 ισχύει.
Πίνακες ανά κόμμα: χρησιμοποιούνται για την «προηγούμενη ψήφο» του συνθετικού προσώπου ΜΟΝΟ αν η βάση είναι ψήφος 2023
(«ΨΗΦΟΣ … 2023», «ΠΡΟΗΓΟΥΜΕΝΗ ΨΗΦΟΣ» σε έγγραφο μετά τις εκλογές 2023)· πίνακες ανά πρόθεση ψήφου καταγράφονται αλλά δεν χρησιμοποιούνται.
Έξοδος: <data>/viewscope/crosstabs.json (ιδιωτικό) + σύνοψη στο benchmarks/viewscope_v2/xtab/.
"""
import json, os, re, subprocess, hashlib, unicodedata, collections, sys
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
DR = os.environ.get('SYNTHETIC_LAB_DATA_DIR') or os.path.join(ROOT, '.synthetic-lab-data')
PDF = os.path.join(ROOT, '.synthetic-lab-data', 'persona', 'pdf')
OUT = os.path.join(DR, 'viewscope', 'crosstabs.json')
SUM = os.path.join(ROOT, 'benchmarks', 'viewscope_v2', 'xtab', 'crosstabs_summary.json')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_published_waves import org_key  # noqa: E402

def nrm(s):
    s = unicodedata.normalize('NFD', (s or '').lower()); s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return re.sub(r'\s+', ' ', re.sub(r'[^\w+ ]', ' ', s)).strip()

PARTY = [('nd', r'^(νδ|νεα δημοκρατια)$'), ('syriza', r'^συριζα'), ('pasok', r'^(πασοκ|κιναλ|πασοκ κιναλ|πασοκ κινημα αλλαγης)'), ('kke', r'^κκε'),
         ('el', r'^(ελ λυση|ελληνικη λυση|ελλ λυση)'), ('plefsi', r'^πλευση'), ('niki', r'^νικη'), ('mera25', r'^(μερα ?25|μερα)'), ('spartiates', r'^σπαρτιατ'),
         ('nea_aristera', r'^νεα αριστερα'), ('other', r'^(αλλο κομμα|αλλο|λοιπα|λοιποι|αλλα κομματα)'), ('abstain', r'^(αποχη|λευκο|ακυρο|δεν ψηφισ)')]
IDEO = [('left', r'^αριστερα$'), ('centre_left', r'^κεντροαριστερ'), ('centre', r'^κεντρο$'), ('centre_right', r'^κεντροδεξι'), ('right', r'^δεξια$')]
GEND = [('male', r'^(ανδρας|ανδρες)$'), ('female', r'^(γυναικα|γυναικες)$')]
EDU = [('low', r'^(δημοτικο|γυμνασιο|υποχρεωτικη|χαμηλη)'), ('medium', r'^(λυκειο|μεση|ιεκ|τεχνικη)'), ('high', r'^(αει|τει|ανωτατη|ανωτερη|πανεπιστ|μεταπτυχ)')]
def age_range(lbl):
    t = unicodedata.normalize('NFD', (lbl or '').lower()); t = ''.join(c for c in t if unicodedata.category(c) != 'Mn')
    t = re.sub(r'(ετων|ετη|χρονων)', '', t).replace('και ανω', '+').replace('–', '-').replace(' ', '')
    m = re.match(r'^(\d{2})(?:-|εως)(\d{2})$', t)
    if m: return (int(m.group(1)), int(m.group(2)))
    m = re.match(r'^(\d{2})\+$', t)
    if m: return (int(m.group(1)), 99)
    return None
def classify(lbl):
    t = nrm(lbl)
    if t in ('συνολο', 'total', 'συνολο δειγματος'): return ('total', 'total')
    a = age_range(lbl)
    if a: return ('age', f'{a[0]}-{a[1]}')
    for dim, table in (('gender', GEND), ('party', PARTY), ('ideology', IDEO), ('edu', EDU)):
        for k, rx in table:
            if re.search(rx, t): return (dim, k)
    return None

NUM = re.compile(r'(?<![\w,.])(\d{1,3}(?:[.,]\d)?)\s?%?(?![\w,.])')
AGE_LEAD = re.compile(r'^\s*(\d{2}\s*[-–]\s*\d{2}(\s*(ετών|ετων|χρονών))?|\d{2}\s*\+|\d{2}\s*(ετών|ετων)?\s*και άνω)', re.I)
def _split(line):
    m = AGE_LEAD.match(line)
    return (m.group(0), line[m.end():]) if m else (None, line)
def nums(line):
    _, rest = _split(line); return [float(x.replace(',', '.')) for x in NUM.findall(rest)]
def label_of(line):
    lead, rest = _split(line)
    if lead: return lead.strip()
    m = NUM.search(line); return (line[:m.start()] if m else line).strip()
def split_cols(line): return [c.strip() for c in re.split(r'\s{2,}', line.strip()) if c.strip()]

def party_base(text, date):
    t = nrm(text)
    if re.search(r'προθεση ψηφου', t) and not re.search(r'(ψηφος|ψηφισατε|προηγουμενη ψηφος).{0,40}2023|προηγουμενη ψηφος', t): return 'intention'
    if (date or '') >= '2023-07' and (re.search(r'(ψηφος|ψηφισατε|εκλογες).{0,25}(ιουν\w*\.? )?2023', t) or 'προηγουμενη ψηφος' in t): return 'pastvote_2023-06'
    return 'unknown'

def parse_page(text):
    """Δύο διατάξεις: (R) γραμμές = ομάδες, στήλες = επιλογές· (C) γραμμές = επιλογές, στήλες = ομάδες. Επιστρέφει λίστα πινάκων."""
    lines = [l for l in text.split('\n') if l.strip()]
    tables = []
    # (R): γραμμή κεφαλίδας επιλογών = γραμμή χωρίς αριθμούς με ≥2 στήλες, ακολουθούμενη από γραμμές «ομάδα + k αριθμοί»
    for i, l in enumerate(lines):
        if nums(l): continue
        head = split_cols(l)
        if len(head) < 2 or any(classify(h) for h in head): continue
        k = len(head); groups = {}
        for l2 in lines[i + 1:i + 40]:
            v = nums(l2); lab = label_of(l2)
            if not v:
                if classify(lab) is None and len(split_cols(l2)) >= 2 and groups: break
                continue
            c = classify(lab)
            if c and len(v) == k: groups[f'{c[0]}:{c[1]}'] = v
        if len(groups) >= 2: tables.append({'layout': 'R', 'options': head, 'groups': groups, 'headerLine': i})
    # (C): γραμμή κεφαλίδας ομάδων (όλες αναγνωρίσιμες), ακολουθούμενη από γραμμές «επιλογή + k αριθμοί»
    for i, l in enumerate(lines):
        if nums(l) and not age_range(split_cols(l)[0] if split_cols(l) else ''): continue
        head = split_cols(l)
        cls = [classify(h) for h in head]
        if len(head) < 2 or not all(cls): continue
        k = len(head); rows = []
        for l2 in lines[i + 1:i + 25]:
            v = nums(l2); lab = label_of(l2)
            if len(v) == k and lab and not classify(lab): rows.append((lab, v))
            elif rows and not v: break
        if len(rows) >= 2:
            groups = {f'{c[0]}:{c[1]}': [r[1][j] for r in rows] for j, c in enumerate(cls)}
            tables.append({'layout': 'C', 'options': [r[0] for r in rows], 'groups': groups, 'headerLine': i})
    return tables

def question_of(text):
    t = text.replace('\n', ' ')
    q = re.findall(r'[‘«"](.{15,300}?)(?:[’»"]|;|\?)', t)
    if q: return re.sub(r'\s+', ' ', q[0]).strip()
    first = [l.strip() for l in text.split('\n') if l.strip()]
    return first[0] if first else ''

def main():
    docs = {d['docId']: d for d in json.load(open(os.path.join(PDF, 'documents.json')))}
    pages = [json.loads(l) for l in open(os.path.join(PDF, 'pages.jsonl'))]
    totals = collections.defaultdict(list)
    pw = os.path.join(DR, 'viewscope', 'published_waves.json')
    if os.path.exists(pw):
        for e in json.load(open(pw))['entries']: totals[e['doc']['docId']].append(e)
    p7 = {s.get('reportUrl') for s in json.load(open(os.path.join(ROOT, 'docs', 'synthetic-lab', 'PHASE7A_QUESTIONNAIRES.json')))['surveys']}
    out, stats = [], collections.Counter()
    for p in pages:
        if not p.get('demoHeader'): continue
        d = docs.get(p['docId']); 
        if not d or d.get('kind') == 'consumer' and False: continue
        if d.get('url') in p7: stats['excluded_7a'] += 1; continue
        text = subprocess.run(['pdftotext', '-f', str(p['page']), '-l', str(p['page']), '-layout', d['path'], '-'], capture_output=True, text=True).stdout
        for t in parse_page(text):
            stats['parsed'] += 1
            dims0 = collections.Counter(g.split(':')[0] for g in t['groups'] if not g.startswith('total'))
            # διάσταση με μία μόνο ομάδα (π.χ. επιλογή «Άλλο» που μοιάζει με κόμμα) δεν είναι διάσταση υποομάδων → αφαιρείται
            t['groups'] = {g: v for g, v in t['groups'].items() if g.startswith('total') or dims0[g.split(':')[0]] >= 2}
            gk = list(t['groups'])
            dims = collections.Counter(g.split(':')[0] for g in gk if not g.startswith('total'))
            sums = {g: sum(v) for g, v in t['groups'].items()}
            v1 = all(abs(s - 100) <= 2 for s in sums.values())
            v3 = len([g for g in gk if not g.startswith('total')]) >= 2 and len(t['options']) >= 2
            # V4: σύγκριση «Σύνολο» με τον πίνακα συνόλου του ίδιου εγγράφου
            v4, matched = None, None
            tot = t['groups'].get('total:total')
            if tot:
                for e in totals.get(p['docId'], []):
                    if len(e['options']) != len(t['options']): continue
                    if all(abs(a - b) <= 1.5 for a, b in zip(tot, e['values'])): v4, matched = True, e; break
                if v4 is None: v4 = False
            verified = bool(v1 and v3 and (v4 is not False))
            stats['verified' if verified else 'rejected'] += 1
            if not verified: continue
            base = party_base(text, d.get('date'))
            out.append({
                'id': f"xt-{p['docId']}-p{p['page']}-{hashlib.sha1(json.dumps(t['groups']).encode()).hexdigest()[:8]}",
                'org': org_key(d.get('org')), 'orgLabel': d.get('org'), 'question': (matched or {}).get('question') or question_of(text),
                'questionSource': 'πίνακας συνόλου του ίδιου εγγράφου' if matched else 'κείμενο σελίδας', 'options': t['options'], 'groups': t['groups'],
                'dims': dict(dims), 'partyBase': base if dims.get('party') else None, 'layout': t['layout'],
                'fieldworkStart': d.get('fieldwork_start'), 'fieldworkEnd': d.get('fieldwork_end'), 'publishedAt': d.get('date'),
                'availableAt': max([x for x in (d.get('date'), d.get('fieldwork_end')) if x] or [None]) if (d.get('date') or d.get('fieldwork_end')) else None,
                'n': d.get('n'), 'doc': {'docId': p['docId'], 'sha256': d.get('sha256'), 'page': p['page'], 'url': d.get('url'), 'title': d.get('title')},
                'verification': {'V1_sums': v1, 'V3_shape': v3, 'V4_total_matches_total_table': v4, 'matchedTotalEntry': (matched or {}).get('id')}})
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    raw = json.dumps({'version': 'xt-1.0', 'note': 'Επαληθευμένοι πίνακες υποομάδων (δημοσιευμένα ποσοστά). Χρήση ως πιθανοτικές συνθήκες· η εκτίμηση είναι T.', 'tables': out}, ensure_ascii=False, sort_keys=True)
    open(OUT, 'w').write(raw)
    summ = {'sha256': hashlib.sha256(raw.encode()).hexdigest(), 'stats': stats, 'verified': len(out),
            'byDim': collections.Counter(dm for t in out for dm in t['dims']), 'byOrg': collections.Counter(t['org'] for t in out).most_common(),
            'partyBase': collections.Counter(t['partyBase'] for t in out if t['partyBase']), 'withTotalCrossCheck': sum(1 for t in out if t['verification']['V4_total_matches_total_table']),
            'questionFromTotalTable': sum(1 for t in out if t['questionSource'].startswith('πίνακας')), 'years': collections.Counter((t['publishedAt'] or '????')[:4] for t in out)}
    os.makedirs(os.path.dirname(SUM), exist_ok=True); json.dump(summ, open(SUM, 'w'), ensure_ascii=False, indent=1)
    print(json.dumps(summ, ensure_ascii=False, indent=1, default=str)[:2500])

if __name__ == '__main__': main()
