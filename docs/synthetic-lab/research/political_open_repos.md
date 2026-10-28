# Πολιτικά μικροδεδομένα για την Ελλάδα σε ανοιχτά αποθετήρια έρευνας

Ημερομηνία: **2026-10-28**. Πλήρης κατάλογος: [`political_open_repos_inventory.csv`](political_open_repos_inventory.csv) (70 γραμμές, μία ανά σύνολο δεδομένων).

## Τι καλύπτει

Αναζητήσαμε σύνολα δεδομένων με απαντήσεις **ανά ερωτώμενο** από Έλληνες ερωτώμενους που έχουν πολιτικές μεταβλητές:
- πρόθεση ψήφου και ψήφος στις προηγούμενες εκλογές
- κομματική ταύτιση
- αξιολόγηση κομμάτων και αρχηγών
- αυτοτοποθέτηση αριστερά–δεξιά
- συμμετοχή στις εκλογές
- έγκριση της κυβέρνησης
- λαϊκισμός και εμπιστοσύνη

Τα αποθετήρια που ψάξαμε:
- Harvard Dataverse και άλλες εγκαταστάσεις Dataverse
- Zenodo, figshare, OSF, Dryad
- ICPSR/openICPSR, GESIS και FORS, μόνο ως μεταδεδομένα μέσω DataCite
- GitHub και Kaggle

Τα αρχεία ESS, EVS, ISSP, CSES, Eurobarometer και SoDaNet τα καλύπτουν άλλες απογραφές. Εδώ σημειώνονται μόνο όταν εμφανίστηκαν στην αναζήτηση.

## Αριθμοί

| Αποθετήριο | Ευρήματα (μοναδικά) | Γραμμές στον κατάλογο | Κατεβασμένα |
|---|---|---|---|
| DataCite (ευρετήριο για όλα τα αποθετήρια) | 15.503 + 4.038 (στοχευμένα) | – | – |
| Harvard Dataverse | 3.152 | 25 | 19 |
| Άλλες εγκαταστάσεις Dataverse (107 απάντησαν, 46 με ελληνικά ευρήματα) | 294 | 3 (DataverseNL, LiDA, SODHA) | 1 |
| Zenodo | 4.562 | 9 | 7 (+1 μόνο κωδικοβιβλίο) |
| figshare (μαζί με θεσμικά figshare: UvA, Middlesex, Open University, T&F, SAGE) | 5.786 | 5 | 5 |
| OSF (κόμβοι, καταχωρίσεις, SHARE) | 300 + 435 | 3 | 3 |
| Dryad | 47 | 0 | 0 |
| openICPSR / ICPSR | (μέσω DataCite) | 10 | 0 (login) |
| GESIS / FORS / Sikt / DANS / SoDaNet | (μέσω DataCite) | 16 | 0 (login ή εκτός αντικειμένου) |
| GitHub / Kaggle | ~40 αποθετήρια / 45 σύνολα | 0 | 0 |

**Σύνολο:** 70 σύνολα δεδομένων. Κατεβάσαμε τα 32 (σύνολο 736 MB). Το καθένα βρίσκεται στο `.synthetic-lab-data/raw/political/repos/<repo>_<id>/` με τρία αρχεία:
- `manifest.json`: URL, sha256, μέγεθος, άδεια, ώρα λήψης
- `meta.json`
- `summary.json`: πλήθος Ελλήνων, πολιτικές μεταβλητές, ημερομηνίες, βάρη, όλα μετρημένα μέσα στο αρχείο

Κατηγορίες πρόσβασης:
- **A** (λήψη τώρα): 40 σύνολα
- **B** (δωρεάν λογαριασμός ή αποδοχή όρων): 26
- **C** (embargo ή περιορισμένη πρόσβαση): 4

## Τα πιο χρήσιμα: ανοιχτά, με πρόθεση ή ανάκληση ψήφου

Το n είναι Έλληνες ερωτώμενοι, μετρημένοι μέσα στο αρχείο.

1. **MAPLE I**, Harvard `AGFZFO`, CC0.
   - Πάνελ 2 κυμάτων: Φεβ–Απρ και Ιουν–Αυγ 2019, n=2.081, online με ποσοστώσεις.
   - Μεταβλητές: πρόθεση ψήφου, ανάκληση ψήφου, κομματική ταύτιση, αξιολόγηση αρχηγών, αριστερά–δεξιά, πρόθεση ψήφου στις ευρωεκλογές, PTV.
   - Έχει βάρη.
2. **MAPLE II**, Harvard `RCNK8E`, CC0.
   - Πάνελ πριν και μετά τις εκλογές του Ιουλίου 2019, n=1.383.
   - Μεταβλητές: πρόθεση και ανάκληση ψήφου, συμμετοχή, αρχηγοί, αριστερά–δεξιά, τοποθέτηση κομμάτων, Πρέσπες.
   - Έχει βάρη `weight*_gr_*`.
3. **EUENGAGE κύμα 1**, Harvard `RJAVLV`, CC0.
   - Ιούνιος–Ιούλιος 2016, n=2.276 (μόνο γενικός πληθυσμός).
   - Μεταβλητές: πρόθεση ψήφου (`QG2`), κόμμα που νιώθει πιο κοντά (`QG3`), αριστερά–δεξιά (`QG1`).
   - Έχει βάρη `gp_wt*`.
   - Το πλήρες αρχείο 2016–2018 (Zenodo 5167557) έχει 697 MB και δεν το κατεβάσαμε.
4. **UNDPOLAR**, DataverseNL `IME1EY`, CC BY 4.0.
   - Δεκ 2021–Ιαν 2022, n=1.213.
   - Μεταβλητές: πρόθεση ψήφου, κομματική ταύτιση, αριστερά–δεξιά, συναισθηματική πόλωση, λαϊκισμός.
   - Έχει βάρη.
5. **Λαϊκισμός σε Ιταλία, Ελλάδα, Ισπανία 2022**, Zenodo 20772797, CC BY 4.0.
   - n=1.082.
   - Μεταβλητές: πρόθεση ψήφου, ανάκληση ψήφου, στάση προς κάθε κόμμα, αριστερά–δεξιά, εμπιστοσύνη.
6. **Δημοψήφισμα 2015** (Walter, Dinas κ.ά.), Harvard `KYCG3P`, CC0.
   - Έρευνα της 4ης Ιουλίου 2015, n=989.
   - Μεταβλητές: πρόθεση ψήφου στο δημοψήφισμα, ψήφος τον Ιανουάριο 2015.
   - Έχει βάρος.
   - Περιέχει και πείραμα με n=2.003.
7. **Έρευνα στα νησιά του Αιγαίου 2016** (Hangartner κ.ά.), Harvard `XGVQDT`, CC0.
   - 12.312 γραμμές στο αρχείο.
   - Μεταβλητές: ψήφος Σεπτεμβρίου και Ιανουαρίου 2015, αριστερά–δεξιά.
   - Έχει βάρη.
   - Το ίδιο αρχείο υπάρχει και στο `MGUYVO`.
8. **Kosmidis, AJPS**, Harvard `K7OCDX`.
   - Ιούνιος 2014, n=1.072.
   - Μεταβλητές: πρόθεση ψήφου, ψήφος στις ευρωεκλογές 2014 και στις εκλογές Ιουνίου 2012, αριστερά–δεξιά.
   - Άδεια: CC0 με επιπλέον όρους.
9. **Voters and the IMF**, Harvard `6HMLST`, CC0.
   - Σεπ–Οκτ 2020, n=1.355.
   - Μεταβλητές: ψήφος, κομματική ταύτιση, αριστερά–δεξιά, εμπιστοσύνη, έγκριση ανακοίνωσης του πρωθυπουργού.
10. **O Xenos**, Harvard `CPDFPQ`, CC0.
    - 2023–24, n=3.026 και n=2.007.
    - Μεταβλητή: επιλογή κόμματος, με Σπαρτιάτες, Νίκη και Ελληνική Λύση.
11. **Once We Too Were Strangers**, Harvard `ADQPHQ`, CC0.
    - Ελληνικά δείγματα: 2022 με n=2.483 (με βάρη) και περίπου 2016 με n=1.897.
    - Μεταβλητές: κόμμα (ΧΑ, ΑΝΕΛ, Ποτάμι κ.ά.), ιδεολογία.
12. **Αποδοχή προσφύγων**, Harvard `5CSZWG`, CC0.
    - n=5.916.
    - Μεταβλητές: κόμμα, ΣΥΡΙΖΑ και Χρυσή Αυγή (ψευδομεταβλητές), αριστερά–δεξιά.
    - Έχει βάρη entropy balancing.
13. **ELNES και Choose4Greece**, Harvard `KOO6MP`, CC0.
    - Μόνο αποσπάσματα: 2012 (n=1.029), 2015 W1/W2 (1.139/1.356), Choose4Greece (57.829 χρήστες VAA).
    - Τα πλήρη αρχεία είναι στο openICPSR και στο GESIS (B).
14. **Solidarity in Europe 2023**, figshare, CC BY.
    - n=1.016.
    - Μεταβλητές: ανάκληση ψήφου, κόμμα.
15. **Έρευνες με λιγότερες πολιτικές μεταβλητές** (κυρίως αριστερά–δεξιά, εμπιστοσύνη ή λαϊκισμός):
    - DEMOTEC: n=3.000, CC BY
    - EQI 2021 (πείραμα): n=6.842, CC BY
    - Gries 2022: n=1.578, CC0, δύο σύνολα με το ίδιο δείγμα
    - COVID σε χρήστες μέσων κοινωνικής δικτύωσης 2020: n=8.637
    - Meta trust 2022: n=1.000
    - WIDELENS: n=529

**Προσοχή:**
- Τα περισσότερα είναι online panels με ποσοστώσεις, όχι πιθανοτικά δείγματα.
- Πολλά είναι πειράματα. Οι μεταβλητές που επηρεάζει το πείραμα δεν πρέπει να χρησιμοποιηθούν ως περιγραφικές.
- Το αρχείο VAA `1B1MXY/gr_Raw3.csv` έχει στήλη «IP Address», με τιμές που δεν μοιάζουν με διευθύνσεις IPv4. Πρέπει να αφαιρεθεί πριν από οποιαδήποτε χρήση.

## Τι δεν κατεβάσαμε και γιατί

- **Πολύ μεγάλα (>500 MB):**
  - EUENGAGE 2016–2018 (Zenodo 5167557, 697 MB)
  - German–Greek conflict (Harvard `ZS9QEC`, 678 MB)
- **Παράγωγα άλλων ερευνών**, που καλύπτονται από άλλες απογραφές:
  - CSES pooled (`QGHS1K`)
  - ESS (`1OPRYA`, `H7HDKZ`, `XSZA7U`)
  - SiE (`PCXEEU`)
- **Χρειάζονται λογαριασμό ή αποδοχή όρων (B):**
  - ELNES / Hellenic Voter Study 2009 και 2012, web panel 2015, πάνελ EES 2014, HelpMeVote 2012 και 2014, μελέτες υποψηφίων (openICPSR E100018–E100074). Το openICPSR απαντά 403.
  - DemoCrisis (ICPSR 313035)
  - IntUne 2007/2009: το LiDA ζητά συμπλήρωση guestbook, που δεν την παρακάμψαμε.
  - Transatlantic Trends 2014
  - Από το GESIS: Choose4Greece, Αγανακτισμένοι, Ριζοσπαστισμός, EU-Profiler 2009, Southern Europe 1985, SiE 2018–2025, TransSOL, ActEU
  - LIVEWHAT (FORS), PROTECT (Sikt), EES 1989/1994 (DANS)
  - SoDaNet (exit poll Metron Ιανουαρίου 2015, What2vote 2023)
- **Embargo (C):**
  - TransEuroWorkS (έως 2027-11-01)
  - Δημοσκόπηση για τη μετανάστευση σε 13 χώρες (έως 2028-11-01)
  - AI Adoption Greece (έως 2027-06-30)
  - VIC International SUF
- **Χωρίς μικροδεδομένα:**
  - Καταχωρίσεις OSF που έχουν μόνο ερωτηματολόγια ή σχέδιο ανάλυσης (4nqw3, r6ahy, 79zvh, up5ke, d27rk κ.ά.)
  - Συμπληρωματικό υλικό SAGE: το API επιστρέφει 404 για τις συλλογές
  - Kaggle: μόνο συγκεντρωτικά αποτελέσματα δημοσκοπήσεων
  - GitHub: δεν βρέθηκαν μικροδεδομένα
- **Σύνολα χωρίς δηλωμένη άδεια:** τα OSF `wtacy` και `q6yzt` τα κατεβάσαμε, αλλά επαναχρησιμοποιούνται μόνο με άδεια των δημιουργών.
- **Δεν επαληθεύτηκε:** το figshare 13078691 κατέβηκε (RData 82 MB), αλλά δεν διαβάστηκε. Το n για την Ελλάδα είναι άγνωστο.

## Πώς ξανατρέχει

Τα scripts βρίσκονται στο `scripts/synthetic-lab/political/harvest_repos/`:
- `polite.py`: ≤1 αίτημα/δευτερόλεπτο ανά host και σεβασμός του Retry-After
- `discover.py`
- `fetch.py`
- `analyse.py`
- `verify.py`
- `build_inventory.py`

Η Python τρέχει πάντα με `-I`. Για SAV/DTA χρειάζονται τα `pyreadstat` και `pandas`, για RData το `rdata`.

```
python3 -I discover.py <out> datacite harvard dataverses zenodo figshare osf trove dryad datacite_extra
python3 -I fetch.py targets.json .synthetic-lab-data/raw/political/repos
python3 -I analyse.py <dirs>;  python3 -I verify.py verify_spec.json <root> out.json
python3 -I build_inventory.py <root> docs/synthetic-lab/research/political_open_repos_inventory.csv
```

### Ερωτήματα αναζήτησης

**Γεωγραφικό μέρος** του κάθε ερωτήματος:
`(Greece OR Greek OR Greeks OR Hellenic OR Ελλάδα OR Ελλάδας) AND <όρος>`

**Πολιτικοί όροι** που μπαίνουν στη θέση του `<όρος>`:
election(s), electoral, vote, voting, voter(s), party/parties, partisan(ship), populism/populist, polarization/polarisation, "left-right", ideology/ideological, "Golden Dawn", SYRIZA, "New Democracy", PASOK, KKE, referendum, bailout, austerity, protest, "trust in government", "political trust", "political survey", "panel survey", "survey experiment", "replication data", "public opinion", "far right", "radical right", euroscepticism, "satisfaction with democracy", "political attitudes", "political behavio(u)r", conjoint, vignette, conspiracy, memoranda, "debt crisis", "economic crisis", "migration attitudes", "refugee crisis", nationalism, Macedonia, Prespa, "civil war", "government approval", "vote intention", turnout, Mitsotakis, Tsipras.

**Αυτοτελή ερωτήματα:** ELNES, "Hellenic Voter Study", "Hellenic/Greek National Election Study", Choose4Greece, HelpMeVote, "Greek voters/public opinion/electorate/elections/parliament/referendum/crisis/survey/respondents/sample/citizens/youth/students", "Χρυσή Αυγή", εκλογές, δημοσκόπηση, ψηφοφόροι, κόμμα, πολιτική συμπεριφορά, κοινή γνώμη.

**Στοχευμένα στο DataCite** (`datacite_extra`):
- Ονόματα έργων: REScEU, EUENGAGE, LIVEWHAT, TransSOL, EURYKA, Values in Crisis, COVIDiSTRESS, Solidarity in Europe, eupinions, ActEU, MAPLE, RECONNECT
- Συνδυασμοί χωρών (π.χ. "Greece, Italy" AND survey)
- Ονόματα εταιρειών δημοσκοπήσεων: MRB, Metron Analysis, Public Issue, Pulse, Prorata, GPO, Alco, Kapa

### APIs

| Πηγή | Endpoint και παράμετροι |
|---|---|
| DataCite | `api.datacite.org/dois?query=…&resource-type-id=dataset&page[size]=1000&page[cursor]=1` |
| Harvard Dataverse | `dataverse.harvard.edu/api/search?q=…&type=dataset&per_page=100&start=…` (έως 1.000 ανά ερώτημα) |
| Άλλες εγκαταστάσεις Dataverse | Λίστα από `IQSS/dataverse-installations` (data.json): probe σε κάθε host, μετά αναζήτηση στα 46 με ελληνικά ευρήματα |
| Zenodo | `zenodo.org/api/records?q=…&size=25&page=…` (έως 40 σελίδες· σταματά όταν μια σελίδα δεν αναφέρει Ελλάδα) |
| figshare | `POST api.figshare.com/v2/articles/search` (`page_size` 100) |
| OSF | `api.osf.io/v2/nodes` και `/registrations` με `filter[title][icontains]`, και `share.osf.io/trove/index-card-search` |
| Dryad | `datadryad.org/api/v2/search` |
| Kaggle | `kaggle.com/api/v1/datasets/list?search=` |
| GitHub | αναζήτηση μέσω GitHub MCP (το `gh search` είναι κλειστό σε αυτή τη συνεδρία) |

**Τεχνική σημείωση:** το Harvard Dataverse απάντησε 403 στο πρώτο UA που δοκιμάσαμε (`…PoliticalHarvest/1.0`). Δεν δοκιμάσαμε άλλα UA. Χρησιμοποιήσαμε το υπάρχον περιγραφικό UA του lake pipeline (`GreekSyntheticResearchLab-DataLake/1.0`), που γίνεται δεκτό.
