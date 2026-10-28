"""List DataCite records from a saved JSON (untrusted data; read only)."""
import json, sys
d = json.load(open(sys.argv[1]))
print('total', d['meta']['total'])
flt = sys.argv[2].lower() if len(sys.argv) > 2 else ''
for x in d['data']:
    a = x['attributes']
    t = a['titles'][0]['title'] if a['titles'] else ''
    pub = a.get('publisher')
    pub = pub.get('name') if isinstance(pub, dict) else pub
    if flt and flt not in (t + ' ' + str(pub) + ' ' + a['doi']).lower():
        continue
    print(a['doi'], '|', t[:120], '|', a.get('publicationYear'), '|', [r.get('rights') for r in a.get('rightsList', [])][:2], '|', pub, '|', a.get('types', {}).get('resourceTypeGeneral'))
