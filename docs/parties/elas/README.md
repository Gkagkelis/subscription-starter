# ΕΛ.Α.Σ.: πηγές προφίλ (ενημέρωση 29/9/2026)

Τα πλήρη κείμενα από τα οποία χτίστηκε το προφίλ της ΕΛ.Α.Σ. στη βάση
(`political_party_profiles`, `party_key = 'elas'`, `profile_version = 'official_2026_09_29'`).

| Αρχείο | Περιεχόμενο |
|---|---|
| 01_idrytiki_diakiryxi_2026-05-26.txt | Ιδρυτική Διακήρυξη |
| 02_politiki_epitropi.tsv | Πολιτική Επιτροπή (67 ονόματα με ρόλους) |
| 03_ethniko_symvoulio.txt | Εθνικό Συμβούλιο (400+1) |
| 04_ethniko_sxedio_anasygkrotisis_DETH_2026-09-02.txt | Οικονομικό πρόγραμμα, Θεσσαλονίκη |
| 05_donations_diafaneia_2026-09-18.txt | Πλατφόρμα δωρεών |
| 06_kostologisi_dnews_2026-09-04.txt | Κοστολόγηση και απάντηση στην κυβέρνηση |
| 07_asktsipras_2026-07-17.txt | #AskTsipras: 15 ερωτήσεις μελών και απαντήσεις του Προέδρου |
| 08_metanasteftiko_tomeis_2026-08-30.txt | Τομείς Μεταναστευτικής Πολιτικής και Προστασίας του Πολίτη |
| build_profile_sql.py / addendum.py / key_officials.json | Παράγουν το `elas_profile_update_2026-09-29.sql` (πλήρες προφίλ) |

Το προηγούμενο προφίλ και οι οργανισμοί πριν την αλλαγή έχουν κρατηθεί στον πίνακα
`noraya_backups` (kind = `political_party_profiles` / `organizations`).
Επαναφορά του παλιού προφίλ, αν χρειαστεί:

```sql
update political_party_profiles p set
  strategic_positioning = b.data->>'strategic_positioning',
  advisor_instructions  = b.data->>'advisor_instructions',
  known_positions = b.data->'known_positions', red_lines = b.data->'red_lines',
  core_themes = b.data->'core_themes', core_audiences = b.data->'core_audiences',
  issue_lens = b.data->'issue_lens', key_officials = b.data->'key_officials',
  ideological_family = b.data->>'ideological_family', default_tone = b.data->>'default_tone',
  opportunity_frame = b.data->>'opportunity_frame', risk_frame = b.data->>'risk_frame',
  competitor_frame = b.data->>'competitor_frame', sources = b.data->'sources',
  profile_version = b.data->>'profile_version'
from (select data from noraya_backups where kind = 'political_party_profiles' and ref = 'elas'
      order by id limit 1) b
where p.party_key = 'elas';
```
