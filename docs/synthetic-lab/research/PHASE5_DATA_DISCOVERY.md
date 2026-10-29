# Phase 5: international data discovery and acquisition

**Date:** 29/10/2026. **Scope:** respondent-level multi-country surveys usable to learn international behavioural relationships and test their transfer to Greece (PHASE5_PREREGISTRATION.md, GLOBAL_LAKE_SPEC.md).

**Machine-readable outputs:**
- `.synthetic-lab-data/raw/phase5/catalog.jsonl`: one record per source considered, with the 18 attributes. It has 81 records: 25 held, 23 downloaded and 33 blocked or not downloaded.
- `.synthetic-lab-data/raw/phase5/manifest.jsonl`: one record per download, with files, bytes, sha256, countries, n and Greek n.
- `.synthetic-lab-data/raw/phase5/failures.jsonl`: blocked items, with the reason for each.

**Greek holdout rule (followed):** for newly downloaded files, Greek rows were only **counted** from the country variable. No Greek marginal, distribution, missingness pattern or table was computed. The cross-country coverage figures in §3 were computed after dropping Greek rows. Under preregistration §1, the Greek rows of every new file belong to the **F3+ locked final holdout**.

## 1. Totals

| | Datasets | Respondents (rows) | Distinct countries | Greek rows |
|---|---|---|---|---|
| **New downloads (this sprint)** | 23 | 3,239,228 | 116 | 99,527 (F3+ locked) |
| Already held (multi-country, catalogued) | 25 | 1,946,073 (recorded n) | ≈150 (WRP/WGM/COVIDiSTRESS global) | 54,273 |
| Blocked / not downloaded | 33 | n/a | n/a | n/a |

Disk used by Phase 5 downloads: **2.35 GB**, within the 4 GB budget. Several files are kept zipped: CSES IMD, which is 1.45 GB unzipped, the PIAAC SPSS files, Afrobarometer R10 and the LiTS SSA extension.

Notes on the totals:
- The respondent total counts **rows**. Three files overlap with other files:
  - The CSES IMD is a superset of the CSES Module 5 rows for Module 5 polities.
  - The VTGQ9Q stacked EB file repeats the held EB 84.3 and 86.2 rows for 8 countries.
  - The EB trend file has no overlap with held waves.
- After de-duplication, the CSES Module 5 rows (114,714) and the two duplicated VTGQ9Q waves (≈35,700 rows) drop out. This gives **≈3.09 M unique new respondents**. Section 5 lists all overlaps.
- The Greek row total also counts the 2,402 CSES Module 5 Greek rows twice, because they are contained in the IMD. That leaves 97,125 unique Greek rows. The distinct-country count treats Northern Cyprus (CY-TCC, an EB sample) as its own unit.
- About 70k of the Greek rows come from the 1980–2002 EB trend file. Recent Greek F3+ rows (2010 or later) come mainly from:
  - EB 75.3, 78.1 and 97.5–101.3 (≈7,060 rows)
  - LiTS III
  - QoG EQI 2010/2013/2017
  - PIAAC
  - CSES 2015/2019
  - JRC waste-sorting
  - EB cultural participation 2013/2017
  - Sea2See

## 2. Downloaded this sprint (summary table)

| Slug | Survey | Period | Respondents | Countries | Greek n | Vars | Domain(s) | Licence / commercial |
|---|---|---|---|---|---|---|---|---|
| `ebrd_lits_iii` | Life in Transition Survey III (2016) | 2015-11 to 2016 (LiTS III fieldwork lat… | 51,206 | 34 | 1,503 | 1290 | ECONOMIC EXPECTATIONS, SOCIAL, POLITICAL ATTITUDES, CONSUMER | No explicit data licence; free public download without registration o… / unclear (no licence stated) |
| `ebrd_lits_ii` | Life in Transition Survey II (2010) | 2010 (autumn) | 38,864 | 35 | 0 | 627 | ECONOMIC EXPECTATIONS, SOCIAL, POLITICAL ATTITUDES | No explicit licence; free public download (EBRD) / unclear |
| `ebrd_lits_i` | Life in Transition Survey I (2006) | 2006 (Aug–Oct) | 29,002 | 29 | 0 | 1198 | ECONOMIC EXPECTATIONS, SOCIAL, POLITICAL ATTITUDES | No explicit licence; free public download (EBRD) / unclear |
| `ebrd_lits_iv_ssa` | Life in Transition Survey IV — Sub-Saharan Africa & Iraq extension (2024) | 2024-02 to 2024-10 (start_date) | 7,209 | 7 | 0 | 1671 | ECONOMIC EXPECTATIONS, SOCIAL, CONSUMER | No explicit licence; free public download (EBRD) / unclear |
| `eb_753_2011_harvard_4XXD3E` | Eurobarometer 75.3 (May 2011), full GESIS file — via Harvard Dataverse replicat… | 2011-05 | 31,769 | 33 | 1,000 | 753 | ECONOMIC EXPECTATIONS, POLITICAL ATTITUDES, SOCIAL, MEDIA & TECH | Harvard Dataverse deposit CC0 1.0 (third-party redistribution of GESI… / unclear |
| `eb_781_2012_harvard_KMWN9M` | Eurobarometer 78.1 (Nov 2012), GESIS ZA5685 v2.0.0 — via Harvard Dataverse depo… | 2012-11 | 32,731 | 34 | 1,001 | 735 | ECONOMIC EXPECTATIONS, POLITICAL ATTITUDES, SOCIAL, MEDIA & TECH, CONSUMER | Harvard Dataverse deposit CC0 1.0 (third-party redistribution of GESI… / unclear |
| `eb_975_982_994_1002_1013_2022_2024_harvard_OBTOD4` | Eurobarometer 97.5 (2022), 98.2 (2023), 99.4 (2023), 100.2 (2023), 101.3 (2024)… | EB 97.5 summer 2022, 98.2 winter 2022-2… | 184,866 | 41 | 5,060 | 496–564 | ECONOMIC EXPECTATIONS, POLITICAL ATTITUDES, SOCIAL, MEDIA & TECH | Harvard Dataverse deposit CC0 1.0 (third-party redistribution of GESI… / unclear |
| `eb_stacked_2005_2016_harvard_VTGQ9Q` | Stacked Eurobarometer subset (10 Standard EB waves 79.3–88.3, 2013–2017; 8 coun… | 2013-05 to 2017-11 (EB 79.3, 80.1, 81.2… | 197,622 | 8 | 0 | 188 | POLITICAL ATTITUDES, ECONOMIC EXPECTATIONS, MEDIA & TECH | Harvard Dataverse CC0 1.0 (derived from GESIS EB files) / unclear |
| `eb_trendfile_1970_2002_harvard_9QZFDH` | Mannheim Eurobarometer Trend File 1970–2002 (GESIS ZA3521 v2.0.1) — via Harvard… | 1970–2002 (Greece from 1980/81) | 1,134,384 | 16 | 70,266 | 146 | POLITICAL ATTITUDES, SOCIAL, ECONOMIC EXPECTATIONS | Harvard Dataverse CC0 1.0 (third-party copy of GESIS ZA3521); GESIS t… / unclear |
| `eb_cultural_participation_harmonized_zenodo5781672` | Harmonized Cultural Access & Participation Dataset (from EB 67.1/2007, 79.2/201… | 2007, 2013, 2017 | 83,190 | 28 | 3,008 | 22 | CONSUMER, MEDIA & TECH | CC BY 4.0 (Zenodo record) / yes with attribution (CC BY), underlyin… |
| `ess_r3_r6_r7_r8_r9_no_greece_harvard_2DPD79` | European Social Survey Rounds 3, 6, 7, 8, 9 integrated files (no Greek particip… | R3 2006-07, R6 2012-13, R7 2014-15, R8 … | 233,430 | 35 | 0 | 519–624 | SOCIAL, POLITICAL ATTITUDES, MEDIA & TECH, ECONOMIC EXPECTATIONS | ESS data CC BY-NC-SA 4.0 (ESS ERIC); deposit labelled CC0; ESS recomm… / no (non-commercial; ESS conditional com… |
| `afrobarometer_r10_merged` | Afrobarometer Round 10 merged data (38 countries) | 2024–2025 | 50,961 | 38 | 0 | 425 | POLITICAL ATTITUDES, ECONOMIC EXPECTATIONS, SOCIAL, MEDIA & TECH | Copyright Afrobarometer; free download without registration; citation… / unclear (no clause) |
| `afrobarometer_r9_merged` | Afrobarometer Round 9 merged data (39 countries) | 2021–2023 | 53,444 | 39 | 0 | 421 | POLITICAL ATTITUDES, ECONOMIC EXPECTATIONS, SOCIAL, MEDIA & TECH | as R10 / unclear |
| `qog_eqi_2013_individual` | European Quality of Government Index 2010 & 2013 — individual-level microdata (… | 2010 (n=33,540; 18 countries; GR 780) a… | 118,711 | 25 | 2,393 | 59 | POLITICAL ATTITUDES, SOCIAL | QoG: data free of charge for researchers and practitioners; cite Char… / no (non-commercial academic) |
| `qog_eqi_2017_individual` | European Quality of Government Index 2017 — individual-level microdata | 2017 | 77,966 | 21 | 1,620 | 67 | POLITICAL ATTITUDES, SOCIAL | as EQI 2013 / no (non-commercial academic) |
| `cses_module5_2016_2021` | CSES Module 5 Full Release (2016–2021): Democracy Divided? | 2015–2021 (Greece 2015-09 and 2019-07 e… | 114,714 | 45 | 2,402 | 605 | POLITICAL ATTITUDES, SOCIAL | CSES: free download, no registration; cite dataset (cses.org) / unclear (no clause) |
| `cses_imd_1996_2021` | CSES Integrated Module Dataset (IMD) 1996–2021 | 1996–2021 (Modules 1–5) | 395,797 | 59 | 5,461 | 406 | POLITICAL ATTITUDES, SOCIAL | CSES: free download, cite / unclear |
| `jrc_waste_sorting_labels_21eu` | Design and behavioural research study to create evidence-based, EU harmonised c… | ≈2023–2024 (see README) | 16,380 | 21 | 797 | 5982 | CONSUMER | CC BY 4.0 (JRC copyright.txt: Commission reuse policy, Decision 2011/… / yes with attribution |
| `jrc_sustainability_labelling_cz_de_es` | Positive, negative or graded sustainability labelling — online choice experimen… | ≈2022–2023 | 2,312 | 3 | 0 | 207 | CONSUMER | CC BY 4.0 (JRC) / yes with attribution |
| `jrc_digital_food_information_bg_de_es_2023` | Consumer attitudes to digital food information (QR codes) — behavioural study, … | 2023-02 (questionnaire version "DEF Feb… | 3,835 | 3 | 0 | 218 | CONSUMER, MEDIA & TECH | CC BY 4.0 (JRC) / yes with attribution |
| `zenodo_21099493_sea2see_seafood_fr_gr_pt_es` | SEA2SEE consumer survey on seafood consumption (France, Greece, Portugal, Spain… | ≈2024–2025 | 382 | 4 | 91 | 37–38 | CONSUMER | CC BY 4.0 / yes with attribution |
| `oecd_piaac_cycle1_puf` | OECD PIAAC Cycle 1 (Survey of Adult Skills 2011–2018) — international Public Us… | Round 1 2011-12, Round 2 2014-15 (incl.… | 230,691 | 35 | 4,925 | 1327–1349 | MEDIA & TECH, ECONOMIC EXPECTATIONS, SOCIAL | OECD terms: content before 1 Jul 2024 "available for commercial and n… / yes with attribution (OECD terms) |
| `oecd_piaac_cycle2_puf` | OECD PIAAC Cycle 2 (Survey of Adult Skills 2023) — international Public Use Fil… | 2022-09 to 2023-06 | 149,762 | 28 | 0 | 2483 | MEDIA & TECH, ECONOMIC EXPECTATIONS, SOCIAL | OECD terms / CC BY 4.0 / yes with attribution |

## 3. Cross-country common variables (computed on non-Greek rows only)

A variable counts as present in a country if it has at least one non-missing value there. For EB, QoG and CSES files, DK and inapplicable are coded as missing, so this is a fair measure. LiTS and Afrobarometer code "not applicable" as a numeric value, so their counts overstate common coverage.

| Dataset | Non-Greek countries | Vars total | In all countries | In ≥90 % | In ≥50 % |
|---|---|---|---|---|---|
| `eb_753_2011_harvard_4XXD3E` | 34 | 753 | 278 | 379 | 553 |
| `eb_781_2012_harvard_KMWN9M` | 35 | 735 | 340 | 400 | 574 |
| `eb_trendfile_1970_2002_harvard_9QZFDH` | 15 | 146 | 95 | 106 | 144 |
| `ebrd_lits_iii` | 33 | 1290 | 546 | 714 | 1179 |
| `qog_eqi_2013_individual` | 24 | 59 | 58 | 59 | 59 |
| `qog_eqi_2017_individual` | 20 | 67 | 67 | 67 | 67 |
| `jrc_waste_sorting_labels_21eu` | 20 | 5982 | 3673 | 3849 | 4535 |
| `ebrd_lits_ii` | 35 | 627 | 625 | 627 | 627 |
| `afrobarometer_r10_merged` | 38 | 425 | 424 | 424 | 424 |
| `eb_1013_2024_OBTOD4` | 38 | 564 | 285 | 292 | 490 |
| `eb_975_2022_OBTOD4` | 39 | 496 | 260 | 272 | 427 |

ESS Rounds 3 and 6–9 use the identical ESS core, about 200 items per round, as the held Greek rounds 1/2/4/5/10/11. The ESS 9 coverage scan failed on a string-encoding error, so ESS has no row in the table, but its core is common by design. PIAAC Cycle 1 has an identical background questionnaire in all 36 files.

## 4. The 18 attributes for each downloaded source

### `ebrd_lits_iii`: Life in Transition Survey III (2016)

- **Producer / source:** EBRD / World Bank. https://www.ebrd.com/home/what-we-do/office-of-the-chief-economist/lits/life-in-transition-survey-data.html
- **1. Respondents:** 51,206.  **2. Countries:** 34 (AL, AM, AZ, BA, BG, BY, CY, CZ, DE, EE, GE, GR, HR, HU, IT, KG, KZ, LT, LV, MD, ME, MK, MN, PL, RO, RS, RU, SI, SK, TJ, TR, UA, UZ, XK).  **3. Period:** 2015-11 to 2016 (LiTS III fieldwork late 2015–2016).  **4. Number of questions (variables):** [1290].
- **5. Respondent-level availability:** yes (household + primary/secondary respondent).
- **6. Cross-country common questions:** LiTS core repeated in LiTS I/II/III/IV: life satisfaction, economic/political situation vs 4 years ago, trust in institutions, preferences for market vs planned economy/democracy, corruption/bribes, wealth ladder, crisis impact, banking/savings/borrowing, media sources (q904), values; strong overlap with held LiTS IV.
- **7. Demographics:** age, gender, education (ISCED-like), employment, household roster, urban/rural, region, income/wealth proxies.
- **8. Weights:** weight_sample, weight_population, weight_one.  **9. Sampling design:** nationally representative two-stage random sample of households (PSU + random walk), ~1,500 per country (Greece included as comparator), face-to-face.
- **10. Wording availability:** full English questionnaire PDF downloaded (LiTS-III-Questionnaire.pdf); variable labels in file.  **11. Response scales:** 5-point agree, 10-step ladders, 4-point trust/likelihood, yes/no, multi-mention flags.
- **12. Missingness:** -97 DK, -98 n/a, -99 refusal; several country-specific modules (e.g. Greek vote recall q1008–q1012 must be excluded from transfer).
- **13. Construct linkability:** high with LiTS IV (held, Greek dev), ESS/EB trust and economy items, World Risk Poll/WGM trust.
- **14. Greek evaluability:** Greek n = 1,503; role: final_locked (F3+).
- **15. Licence:** No explicit data licence; free public download without registration on EBRD LiTS page; ebrd.com terms of use; cite EBRD LiTS III.  **16. AI-training restrictions:** not restricted (none stated).  **17. Commercial use:** unclear (no licence stated).
- **18. Overlap with existing data:** Different respondents from LiTS IV (2022-23); no overlap with other held files.

### `ebrd_lits_ii`: Life in Transition Survey II (2010)

- **Producer / source:** EBRD / World Bank. https://www.ebrd.com/home/what-we-do/office-of-the-chief-economist/lits/life-in-transition-survey-data.html
- **1. Respondents:** 38,864.  **2. Countries:** 35 (AL, AM, AZ, BA, BG, BY, CZ, DE, EE, FR, GB, GE, HR, HU, IT, KG, KZ, LT, LV, MD, ME, MK, MN, PL, RO, RS, RU, SE, SI, SK, TJ, TR, UA, UZ, XK).  **3. Period:** 2010 (autumn).  **4. Number of questions (variables):** [627].
- **5. Respondent-level availability:** yes.
- **6. Cross-country common questions:** LiTS core (life satisfaction, trust, economic perceptions, crisis impact, values); Western comparators FR/DE/IT/SE/UK.
- **7. Demographics:** age, gender, education, employment, household roster, urban/rural.
- **8. Weights:** weight (democratic), XCweight (federalist).  **9. Sampling design:** two-stage random household sample, ~1,000 per country, face-to-face.
- **10. Wording availability:** English questionnaire PDF downloaded; variable labels in file.  **11. Response scales:** 5-point agree, 10-step ladder, yes/no.
- **12. Missingness:** DK/refusal codes; module routing.
- **13. Construct linkability:** high with LiTS III/IV, ESS trust/economy.
- **14. Greek evaluability:** Greek n = 0; role: absent.
- **15. Licence:** No explicit licence; free public download (EBRD).  **16. AI-training restrictions:** not restricted (none stated).  **17. Commercial use:** unclear.
- **18. Overlap with existing data:** none.

### `ebrd_lits_i`: Life in Transition Survey I (2006)

- **Producer / source:** EBRD / World Bank. https://www.ebrd.com/home/what-we-do/office-of-the-chief-economist/lits/life-in-transition-survey-data.html
- **1. Respondents:** 29,002.  **2. Countries:** 29 (AL, AM, AZ, BA, BG, BY, CZ, EE, GE, HR, HU, KG, KZ, LT, LV, MD, ME, MK, MN, PL, RO, RS, RU, SI, SK, TJ, TR, UA, UZ).  **3. Period:** 2006 (Aug–Oct).  **4. Number of questions (variables):** [1198].
- **5. Respondent-level availability:** yes.
- **6. Cross-country common questions:** LiTS core (see LiTS III); transition countries + Turkey.
- **7. Demographics:** age, gender, education, employment, household roster.
- **8. Weights:** weight_0/1 (democratic), weight_2 (federalist).  **9. Sampling design:** two-stage random household sample, ~1,000 per country, face-to-face.
- **10. Wording availability:** English questionnaire PDF downloaded.  **11. Response scales:** 5-point agree, ladders, yes/no.
- **12. Missingness:** DK/refusal codes.
- **13. Construct linkability:** medium–high with LiTS III/IV.
- **14. Greek evaluability:** Greek n = 0; role: absent.
- **15. Licence:** No explicit licence; free public download (EBRD).  **16. AI-training restrictions:** not restricted (none stated).  **17. Commercial use:** unclear.
- **18. Overlap with existing data:** none.

### `ebrd_lits_iv_ssa`: Life in Transition Survey IV — Sub-Saharan Africa & Iraq extension (2024)

- **Producer / source:** EBRD. https://www.ebrd.com/home/what-we-do/office-of-the-chief-economist/lits/life-in-transition-survey-data.html
- **1. Respondents:** 7,209.  **2. Countries:** 7 (BJ, CI, GH, IQ, KE, NG, SN).  **3. Period:** 2024-02 to 2024-10 (start_date).  **4. Number of questions (variables):** [1671].
- **5. Respondent-level availability:** yes.
- **6. Cross-country common questions:** LiTS IV questionnaire (same item set as held LiTS IV incl. bank/financial inclusion and media items).
- **7. Demographics:** age, gender, education, employment, household.
- **8. Weights:** weight (mean 1), weight_pop.  **9. Sampling design:** LiTS IV random household sample, ~1,000 per country, face-to-face.
- **10. Wording availability:** SSA questionnaire PDF + labelbook xlsx.  **11. Response scales:** as LiTS IV.
- **12. Missingness:** DK/refusal codes.
- **13. Construct linkability:** very high with LiTS IV (identical items).
- **14. Greek evaluability:** Greek n = 0; role: absent.
- **15. Licence:** No explicit licence; free public download (EBRD).  **16. AI-training restrictions:** not restricted (none stated).  **17. Commercial use:** unclear.
- **18. Overlap with existing data:** separate countries from LiTS IV.

### `eb_753_2011_harvard_4XXD3E`: Eurobarometer 75.3 (May 2011), full GESIS file — via Harvard Dataverse replication deposit

- **Producer / source:** European Commission DG COMM / TNS; redistributed in doi:10.7910/DVN/4XXD3E. https://doi.org/10.7910/DVN/4XXD3E (file id 5255028)
- **1. Respondents:** 31,769.  **2. Countries:** 33 (AT, BE, BG, CY, CY-TCC, CZ, DE, DK, EE, ES, FI, FR, GB, GR, HR, HU, IE, IS, IT, LT, LU, LV, ME, MK, MT, NL, PL, PT, RO, SE, SI, SK, TR).  **3. Period:** 2011-05.  **4. Number of questions (variables):** [753].
- **5. Respondent-level availability:** yes.
- **6. Cross-country common questions:** Standard EB trend block shared with held EB 84.3/86.2/88.4/93.1/94.3: life satisfaction, economic situation & expectations (12 items), most important issues, trust in institutions, EU image, democracy satisfaction, political discussion, media use, difficulties paying bills; crisis/reform module.
- **7. Demographics:** age (exact), gender, age at end of education, occupation (current/last), marital status, household composition, type of community (rural/town/city), region (NUTS), social class self-placement, internet use.
- **8. Weights:** post-stratification weights per country (w1/W1 etc.) plus EU-aggregate weights; extra-population weight (wex).  **9. Sampling design:** multi-stage random (probability) sample, residents 15+, ~1,000 per country (500 in small states), face-to-face CAPI.
- **10. Wording availability:** variable labels in file (abbreviated English); full master questionnaire (basic questionnaire) at GESIS (login/Cloudflare) — not downloaded; Greek-language questionnaire wording not available.  **11. Response scales:** 4-point agree/satisfaction, trust tend to/tend not, mentioned/not mentioned multi-response, 10-point left-right, 3-point frequency.
- **12. Missingness:** DK/refusal coded as explicit categories; split-ballot items (A/B) and country-specific routing (inap.) create structural missingness.
- **13. Construct linkability:** very high with the 6 held EB waves and EB 78.1.
- **14. Greek evaluability:** Greek n = 1,000; role: final_locked (F3+).
- **15. Licence:** Harvard Dataverse deposit CC0 1.0 (third-party redistribution of GESIS Eurobarometer file); underlying data (c) European Union (DG COMM), EC lists Eurobarometer under CC BY 4.0 on data.europa.eu; GESIS redistribution terms not verifiable (Cloudflare). Same policy as Phase 4 EB downloads..  **16. AI-training restrictions:** not restricted (none stated).  **17. Commercial use:** unclear.
- **18. Overlap with existing data:** new wave (not held); no respondent overlap.

### `eb_781_2012_harvard_KMWN9M`: Eurobarometer 78.1 (Nov 2012), GESIS ZA5685 v2.0.0 — via Harvard Dataverse deposit KMWN9M

- **Producer / source:** European Commission DG COMM / TNS; redistributed in doi:10.7910/DVN/KMWN9M. https://doi.org/10.7910/DVN/KMWN9M (file id 11788770)
- **1. Respondents:** 32,731.  **2. Countries:** 34 (AT, BE, BG, CY, CY-TCC, CZ, DE, DK, EE, ES, FI, FR, GB, GR, HR, HU, IE, IS, IT, LT, LU, LV, ME, MK, MT, NL, PL, PT, RO, RS, SE, SI, SK, TR).  **3. Period:** 2012-11.  **4. Number of questions (variables):** [735].
- **5. Respondent-level availability:** yes.
- **6. Cross-country common questions:** Standard EB trend block (as above) + media use (TV/radio/press/internet/social networks), news sources, ownership of durables (TV, DVD, internet, car, flat), phone availability, internet use frequency, crisis/financial market reform, international contact/travel.
- **7. Demographics:** age (exact), gender, age at end of education, occupation (current/last), marital status, household composition, type of community (rural/town/city), region (NUTS), social class self-placement, internet use.
- **8. Weights:** post-stratification weights per country (w1/W1 etc.) plus EU-aggregate weights; extra-population weight (wex).  **9. Sampling design:** multi-stage random (probability) sample, residents 15+, ~1,000 per country (500 in small states), face-to-face CAPI.
- **10. Wording availability:** variable labels in file (abbreviated English); full master questionnaire (basic questionnaire) at GESIS (login/Cloudflare) — not downloaded; Greek-language questionnaire wording not available.  **11. Response scales:** 4-point agree/satisfaction, trust tend to/tend not, mentioned/not mentioned multi-response, 10-point left-right, 3-point frequency.
- **12. Missingness:** DK/refusal coded as explicit categories; split-ballot items (A/B) and country-specific routing (inap.) create structural missingness.
- **13. Construct linkability:** very high with held EB waves; ownership-of-durables and internet items link to consumer/tech domain.
- **14. Greek evaluability:** Greek n = 1,001; role: final_locked (F3+).
- **15. Licence:** Harvard Dataverse deposit CC0 1.0 (third-party redistribution of GESIS Eurobarometer file); underlying data (c) European Union (DG COMM), EC lists Eurobarometer under CC BY 4.0 on data.europa.eu; GESIS redistribution terms not verifiable (Cloudflare). Same policy as Phase 4 EB downloads..  **16. AI-training restrictions:** not restricted (none stated).  **17. Commercial use:** unclear.
- **18. Overlap with existing data:** new wave; same deposit as held EB 86.2 but different file.

### `eb_975_982_994_1002_1013_2022_2024_harvard_OBTOD4`: Eurobarometer 97.5 (2022), 98.2 (2023), 99.4 (2023), 100.2 (2023), 101.3 (2024) — full GESIS Standard EB files via Harvard Dataverse replication deposit (Hlatky)

- **Producer / source:** European Commission DG COMM / Kantar-Verian; redistributed in doi:10.7910/DVN/OBTOD4. https://doi.org/10.7910/DVN/OBTOD4 (file ids 13169700, 13169710, 13169713, 13169699, 13169704; md5 verified)
- **1. Respondents:** 184,866.  **2. Countries:** 41 (AL, AT, BA, BE, BG, CH, CY, CY-TCC, CZ, DE, DK, EE, ES, FI, FR, GB, GE, GR, HR, HU, IE, IS, IT, LT, LU, LV, MD, ME, MK, MT, NL, NO, PL, PT, RO, RS, SE, SI, SK, TR, XK).  **3. Period:** EB 97.5 summer 2022, 98.2 winter 2022-23, 99.4 spring 2023, 100.2 autumn 2023, 101.3 spring 2024.  **4. Number of questions (variables):** [496, 521, 546, 521, 564].
- **5. Respondent-level availability:** yes (full files, 496–564 vars each).
- **6. Cross-country common questions:** Standard EB trend block identical across the 5 waves and with held EB 93.1/94.3/103.3: life satisfaction, economic expectations, important issues (country/personal/EU), direction of country, institutional trust, democracy satisfaction, voice counts, EU image/attachment, left-right, Ukraine-invasion statements; media use & online social networks & false/misleading news (98.2, 100.2); NextGenerationEU / Green Deal; internet use.
- **7. Demographics:** age (exact), gender, age at end of education, occupation (current/last), marital status, household composition, type of community (rural/town/city), region (NUTS), social class self-placement, internet use.
- **8. Weights:** post-stratification weights per country (w1/W1 etc.) plus EU-aggregate weights; extra-population weight (wex).  **9. Sampling design:** multi-stage random (probability) sample, residents 15+, ~1,000 per country (500 in small states), face-to-face CAPI.
- **10. Wording availability:** variable labels in file (abbreviated English); full master questionnaire (basic questionnaire) at GESIS (login/Cloudflare) — not downloaded; Greek-language questionnaire wording not available.  **11. Response scales:** 4-point agree/satisfaction, trust tend to/tend not, mentioned/not mentioned multi-response, 10-point left-right, 3-point frequency.
- **12. Missingness:** DK/refusal coded as explicit categories; split-ballot items (A/B) and country-specific routing (inap.) create structural missingness.
- **13. Construct linkability:** very high (5 consecutive Standard EB waves 2022–2024 bridging held 94.3 (2021) and 103.3 (2025)).
- **14. Greek evaluability:** Greek n = 5,060; role: final_locked (F3+).
- **15. Licence:** Harvard Dataverse deposit CC0 1.0 (third-party redistribution of GESIS Eurobarometer file); underlying data (c) European Union (DG COMM), EC lists Eurobarometer under CC BY 4.0 on data.europa.eu; GESIS redistribution terms not verifiable (Cloudflare). Same policy as Phase 4 EB downloads..  **16. AI-training restrictions:** not restricted (none stated).  **17. Commercial use:** unclear.
- **18. Overlap with existing data:** new waves (not held); no respondent overlap.

### `eb_stacked_2005_2016_harvard_VTGQ9Q`: Stacked Eurobarometer subset (10 Standard EB waves 79.3–88.3, 2013–2017; 8 countries) — replication data "The Battle for the Public Perception"

- **Producer / source:** Depositor-harmonised EB subset; doi:10.7910/DVN/VTGQ9Q. https://doi.org/10.7910/DVN/VTGQ9Q (file id 4193323)
- **1. Respondents:** 197,622.  **2. Countries:** 8 (DE, DK, ES, FR, GB, IE, IT, NL).  **3. Period:** 2013-05 to 2017-11 (EB 79.3, 80.1, 81.2, 82.3, 83.3, 84.3, 85.2, 86.2, 87.3, 88.3).  **4. Number of questions (variables):** [188].
- **5. Respondent-level availability:** yes (harmonised subset of 188 variables).
- **6. Cross-country common questions:** important issues (country/EU, 16 each), EU image, democracy satisfaction, globalisation, EU future, left-right, political discussion, voice counts, direction of country/EU, first news source.
- **7. Demographics:** age, gender, education age, urbanisation, income proxy.
- **8. Weights:** weight_national, weight_EU.  **9. Sampling design:** Standard EB (see EB).
- **10. Wording availability:** harmonised short labels only; original wording via EB questionnaires.  **11. Response scales:** as EB, recoded.
- **12. Missingness:** DK recoded as category; harmonisation by depositor.
- **13. Construct linkability:** high (same EB trend items) but no Greece; useful for time-series of 8 large EU countries.
- **14. Greek evaluability:** Greek n = 0; role: absent.
- **15. Licence:** Harvard Dataverse CC0 1.0 (derived from GESIS EB files).  **16. AI-training restrictions:** not restricted (none stated).  **17. Commercial use:** unclear.
- **18. Overlap with existing data:** CONTAINS respondents of held EB 84.3 and EB 86.2 (DE, FR, IT, ES, NL, IE, DK, UK rows) — drop waves 843/862 when pooling.

### `eb_trendfile_1970_2002_harvard_9QZFDH`: Mannheim Eurobarometer Trend File 1970–2002 (GESIS ZA3521 v2.0.1) — via Harvard Dataverse deposit 9QZFDH

- **Producer / source:** MZES / GESIS (Schmitt, Scholz et al.); redistributed in doi:10.7910/DVN/9QZFDH. https://doi.org/10.7910/DVN/9QZFDH (file id 10538007); original doi:10.4232/1.10074
- **1. Respondents:** 1,134,384.  **2. Countries:** 16 (AT, BE, DE, DK, ES, FI, FR, GB, GR, IE, IT, LU, NL, NO, PT, SE).  **3. Period:** 1970–2002 (Greece from 1980/81).  **4. Number of questions (variables):** [146].
- **5. Respondent-level availability:** yes (1.13M respondents).
- **6. Cross-country common questions:** harmonised trend items: life satisfaction, democracy satisfaction, EU membership good/bad & benefit, left-right, materialism/post-materialism, political interest/discussion, national pride, feeling European, religion, union membership.
- **7. Demographics:** age, sex, education (age finished), occupation, income quartile, size of community, marital status.
- **8. Weights:** wsample, wnation, weuro.  **9. Sampling design:** Standard EB samples harmonised across ~120 waves.
- **10. Wording availability:** harmonised variable labels; original questionnaires in GESIS codebook (not downloaded).  **11. Response scales:** mostly 4-point, 10-point left-right, binary.
- **12. Missingness:** "DK,NA" (8) and inap (9) codes; items asked only in some waves.
- **13. Construct linkability:** high for trend items shared with held EB/ESS (life satisfaction, democracy satisfaction, left-right, EU support).
- **14. Greek evaluability:** Greek n = 70,266; role: final_locked (F3+) — Greek rows 1980–2002.
- **15. Licence:** Harvard Dataverse CC0 1.0 (third-party copy of GESIS ZA3521); GESIS terms not verifiable.  **16. AI-training restrictions:** not restricted (none stated).  **17. Commercial use:** unclear.
- **18. Overlap with existing data:** no overlap with held EB waves (all held waves ≥2015).

### `eb_cultural_participation_harmonized_zenodo5781672`: Harmonized Cultural Access & Participation Dataset (from EB 67.1/2007, 79.2/2013, 88.1/2017)

- **Producer / source:** Daniel Antal (Zenodo 10.5281/zenodo.5781672), derived from GESIS ZA4529/ZA5688/ZA6925. https://doi.org/10.5281/zenodo.5781672
- **1. Respondents:** 83,190.  **2. Countries:** 28 (AT, BE, BG, CY, CZ, DE, DK, EE, ES, FI, FR, GB, GR, HR, HU, IE, IT, LT, LU, LV, MT, NL, PL, PT, RO, SE, SI, SK).  **3. Period:** 2007, 2013, 2017.  **4. Number of questions (variables):** [22].
- **5. Respondent-level availability:** yes (harmonised subset, 22 vars).
- **6. Cross-country common questions:** frequency of visiting concerts, public libraries, museums/galleries (categorical + numeric + binary) — identical across 3 waves and 28 countries.
- **7. Demographics:** age (exact), age at end of education, student status, geo (NUTS), country.
- **8. Weights:** w, w1 (post-stratification), wex (projected population).  **9. Sampling design:** Special EB (probability, face-to-face).
- **10. Wording availability:** harmonised labels + PDF description; original EB special questionnaires at GESIS.  **11. Response scales:** frequency categories (never … more than 5 times).
- **12. Missingness:** harmonised; DK dropped/NA.
- **13. Construct linkability:** cultural consumption → links to ESS/ISSP leisure & media items and to Greek cultural survey (held Mendeley).
- **14. Greek evaluability:** Greek n = 3,008; role: final_locked (F3+).
- **15. Licence:** CC BY 4.0 (Zenodo record).  **16. AI-training restrictions:** not restricted.  **17. Commercial use:** yes with attribution (CC BY), underlying EB rights as EB.
- **18. Overlap with existing data:** none with held EB waves.

### `ess_r3_r6_r7_r8_r9_no_greece_harvard_2DPD79`: European Social Survey Rounds 3, 6, 7, 8, 9 integrated files (no Greek participation) — via Harvard Dataverse deposit 2DPD79

- **Producer / source:** ESS ERIC; redistributed by L. Pelke (doi:10.7910/DVN/2DPD79). https://doi.org/10.7910/DVN/2DPD79 (file ids 4462951, 4462946, 4462949, 4462947, 4462948; md5 verified)
- **1. Respondents:** 233,430.  **2. Countries:** 35 (AL, AT, BE, BG, CH, CY, CZ, DE, DK, EE, ES, FI, FR, GB, HR, HU, IE, IL, IS, IT, LT, LV, ME, NL, NO, PL, PT, RO, RS, RU, SE, SI, SK, UA, XK).  **3. Period:** R3 2006-07, R6 2012-13, R7 2014-15, R8 2016-17, R9 2018-19.  **4. Number of questions (variables):** [519, 624, 601, 534, 557].
- **5. Respondent-level availability:** yes.
- **6. Cross-country common questions:** ESS core identical to held R1/2/4/5/10/11 (Greek dev): social/political trust (9+ items), satisfaction with life/economy/government/democracy, left-right, media use, internet use, human values (21 PVQ), immigration attitudes, religiosity, wellbeing, health, redistribution; rotating modules (R6 democracy, R7 immigration/health, R8 welfare/climate, R9 justice/life course).
- **7. Demographics:** age, gender, education (ISCED/edulvlb), employment, income decile, household, urban/rural, region.
- **8. Weights:** dweight, pspwght, pweight (anweight from R9).  **9. Sampling design:** strict probability samples, 15+, face-to-face CAPI.
- **10. Wording availability:** full source questionnaires public (CC BY-SA); variable labels in file.  **11. Response scales:** 0–10, 4/5-point, binary.
- **12. Missingness:** 7/77 refusal, 8/88 DK, 9/99 no answer; module routing.
- **13. Construct linkability:** very high (identical core items with Greek dev rounds).
- **14. Greek evaluability:** Greek n = 0; role: absent (pure international training).
- **15. Licence:** ESS data CC BY-NC-SA 4.0 (ESS ERIC); deposit labelled CC0; ESS recommends obtaining from ESS portal.  **16. AI-training restrictions:** not restricted (none stated; ShareAlike applies to derived data).  **17. Commercial use:** no (non-commercial; ESS conditional commercial use).
- **18. Overlap with existing data:** R3 was deleted in Phase 4 only because it lacked Greek rows; no overlap with held rounds.

### `afrobarometer_r10_merged`: Afrobarometer Round 10 merged data (38 countries)

- **Producer / source:** Afrobarometer. https://www.afrobarometer.org/data/merged-data/
- **1. Respondents:** 50,961.  **2. Countries:** 38 (AO, BJ, BW, CG, CI, CM, CV, GA, GH, GM, GN, GW, KE, KM, LR, LS, MA, MG, ML, MR, MU, MW, MZ, NA, NG, SC, SL, SN, ST, SZ, TD, TG, TN, TZ, UG, ZA, ZM, ZW).  **3. Period:** 2024–2025.  **4. Number of questions (variables):** [425].
- **5. Respondent-level availability:** yes.
- **6. Cross-country common questions:** direction of country, present/retrospective/prospective economic condition, lived poverty, trust in institutions, democracy support/satisfaction, media/internet/mobile phone use, corruption, identity.
- **7. Demographics:** age, gender, education, employment, urban/rural, region.
- **8. Weights:** withinwt_ea/hh, Combinwt.  **9. Sampling design:** nationally representative clustered random samples (~1,200–2,400), face-to-face.
- **10. Wording availability:** merged codebook PDF downloaded.  **11. Response scales:** 4/5-point, binary.
- **12. Missingness:** -1 missing, 8 refused, 9 DK.
- **13. Construct linkability:** medium (economic perception, trust, democracy items parallel EB/ESS/LiTS; African context).
- **14. Greek evaluability:** Greek n = 0; role: absent.
- **15. Licence:** Copyright Afrobarometer; free download without registration; citation required ("Afrobarometer Data, [Country], [Round], available at www.afrobarometer.org").  **16. AI-training restrictions:** not restricted (none stated).  **17. Commercial use:** unclear (no clause).
- **18. Overlap with existing data:** none.

### `afrobarometer_r9_merged`: Afrobarometer Round 9 merged data (39 countries)

- **Producer / source:** Afrobarometer. https://www.afrobarometer.org/data/merged-data/
- **1. Respondents:** 53,444.  **2. Countries:** 39 (AO, BF, BJ, BW, CG, CI, CM, CV, ET, GA, GH, GM, GN, KE, LR, LS, MA, MG, ML, MR, MU, MW, MZ, NA, NE, NG, SC, SD, SL, SN, ST, SZ, TG, TN, TZ, UG, ZA, ZM, ZW).  **3. Period:** 2021–2023.  **4. Number of questions (variables):** [421].
- **5. Respondent-level availability:** yes.
- **6. Cross-country common questions:** as R10.
- **7. Demographics:** age, gender, education, employment, urban/rural.
- **8. Weights:** withinwt, Combinwt.  **9. Sampling design:** as R10.
- **10. Wording availability:** merged codebook PDF downloaded.  **11. Response scales:** 4/5-point, binary.
- **12. Missingness:** -1/8/9 codes.
- **13. Construct linkability:** medium.
- **14. Greek evaluability:** Greek n = 0; role: absent.
- **15. Licence:** as R10.  **16. AI-training restrictions:** not restricted (none stated).  **17. Commercial use:** unclear.
- **18. Overlap with existing data:** none.

### `qog_eqi_2013_individual`: European Quality of Government Index 2010 & 2013 — individual-level microdata (combined file)

- **Producer / source:** QoG Institute, University of Gothenburg (Charron, Lapuente, Rothstein). https://www.qogdata.pol.gu.se/dataarchive/qog_eqi_ind_2013.dta
- **1. Respondents:** 118,711.  **2. Countries:** 25 (AT, BE, BG, CZ, DE, DK, ES, FI, FR, GB, GR, HR, HU, IE, IT, NL, PL, PT, RO, RS, SE, SK, TR, UA, XK).  **3. Period:** 2010 (n=33,540; 18 countries; GR 780) and 2013 (n=85,167; 25 countries incl. RS/XK/TR/UA; GR 1,613).  **4. Number of questions (variables):** [59].
- **5. Respondent-level availability:** yes.
- **6. Cross-country common questions:** quality/impartiality/corruption of public education, health care, police (Q1–Q16), bribery experience, trust; repeated in EQI 2017/2021/2024 (held 2021/2024).
- **7. Demographics:** age, gender, education, income, NUTS2 region, urban/rural.
- **8. Weights:** Dweight, PSweight, Pweight.  **9. Sampling design:** CATI random digit dialling, ~400 per NUTS region.
- **10. Wording availability:** EQI 2013 codebook/questionnaire PDF downloaded.  **11. Response scales:** 0–10, 4-point, yes/no.
- **12. Missingness:** DK/refuse codes.
- **13. Construct linkability:** very high with held EQI 2021/2024 (same core items).
- **14. Greek evaluability:** Greek n = 2,393; role: final_locked (F3+).
- **15. Licence:** QoG: data free of charge for researchers and practitioners; cite Charron et al.; QoG data "free and open for non-commercial academic use".  **16. AI-training restrictions:** not restricted (none stated).  **17. Commercial use:** no (non-commercial academic).
- **18. Overlap with existing data:** new wave; vote-intention Q24 excluded from transfer.

### `qog_eqi_2017_individual`: European Quality of Government Index 2017 — individual-level microdata

- **Producer / source:** QoG Institute, University of Gothenburg. https://www.qogdata.pol.gu.se/dataarchive/qog_eqi_ind_2017.dta
- **1. Respondents:** 77,966.  **2. Countries:** 21 (AT, BE, BG, CZ, DE, DK, ES, FI, FR, GB, GR, HR, HU, IE, IT, NL, PL, PT, RO, SE, SK).  **3. Period:** 2017.  **4. Number of questions (variables):** [67].
- **5. Respondent-level availability:** yes.
- **6. Cross-country common questions:** EQI core (as 2013) + trust in parliament, immigration, social trust.
- **7. Demographics:** age, gender, education, income, NUTS2.
- **8. Weights:** Iweight, Dweight, Pweight, PSweight.  **9. Sampling design:** CATI, ~400 per NUTS region.
- **10. Wording availability:** EQI 2017 PDF downloaded.  **11. Response scales:** 0–10, 4-point.
- **12. Missingness:** 99 DK/refused.
- **13. Construct linkability:** very high with EQI 2013/2021/2024.
- **14. Greek evaluability:** Greek n = 1,620; role: final_locked (F3+).
- **15. Licence:** as EQI 2013.  **16. AI-training restrictions:** not restricted (none stated).  **17. Commercial use:** no (non-commercial academic).
- **18. Overlap with existing data:** new wave; vote intention Q25 excluded.

### `cses_module5_2016_2021`: CSES Module 5 Full Release (2016–2021): Democracy Divided?

- **Producer / source:** Comparative Study of Electoral Systems (CSES). https://cses.org/data-download/cses-module-5-2016-2021/ (Full Release July 25, 2023; doi:10.7804/cses.module5.2023-07-25)
- **1. Respondents:** 114,714.  **2. Countries:** 45 (AL, AT, AU, BE, BR, CA, CH, CL, CR, CZ, DE, DK, FI, FR, GB, GR, HK, HU, IE, IL, IN, IS, IT, JP, KR, LT, LV, ME, MX, NL, NO, NZ, PE, PL, PT, RO, SE, SK, SV, TH, TN, TR, TW, US, UY).  **3. Period:** 2015–2021 (Greece 2015-09 and 2019-07 elections).  **4. Number of questions (variables):** [605].
- **5. Respondent-level availability:** yes.
- **6. Cross-country common questions:** left-right self-placement, democracy satisfaction, political efficacy, populism/elite attitudes battery, out-group attitudes, economic evaluations, trust; vote choice (EXCLUDED from transfer).
- **7. Demographics:** age, gender, education, employment, income quintile, religion, urban/rural, household.
- **8. Weights:** E1010 sample, E1011 demographic, E1012 political weights.  **9. Sampling design:** national post-election studies (probability/mixed by polity), harmonised.
- **10. Wording availability:** full codebook (6 parts, incl. question wording) downloaded.  **11. Response scales:** 0–10, 4/5-point, binary.
- **12. Missingness:** 9999xx codes for missing/DK/refused, polity-level missing items.
- **13. Construct linkability:** high for democracy/efficacy/left-right items shared with ESS/EB/EQI.
- **14. Greek evaluability:** Greek n = 2,402; role: final_locked (F3+), pending ELNES overlap check.
- **15. Licence:** CSES: free download, no registration; cite dataset (cses.org).  **16. AI-training restrictions:** not restricted (none stated).  **17. Commercial use:** unclear (no clause).
- **18. Overlap with existing data:** Greek CSES component = ELNES post-election samples (2015, 2019): POSSIBLE respondent overlap with held ELNES 2019 standalone (sprint) — check IDs before treating Greek rows as independent holdout; module-5 rows also in CSES IMD.

### `cses_imd_1996_2021`: CSES Integrated Module Dataset (IMD) 1996–2021

- **Producer / source:** CSES. https://cses.org/data-download/cses-integrated-module-dataset-imd/ (Feb 27, 2024 version; doi:10.7804/cses.imd.2024-02-27)
- **1. Respondents:** 395,797.  **2. Countries:** 59 (AL, AR, AT, AU, BE, BG, BR, BY, CA, CH, CL, CR, CZ, DE, DK, EE, ES, FI, FR, GB, GR, HK, HR, HU, IE, IL, IN, IS, IT, JP, KE, KG, KR, LT, LV, ME, MX, NL, NO, NZ, PE, PH, PL, PT, RO, RS, RU, SE, SI, SK, SV, TH, TN, TR, TW, UA, US, UY, ZA).  **3. Period:** 1996–2021 (Modules 1–5).  **4. Number of questions (variables):** [406].
- **5. Respondent-level availability:** yes (harmonised across modules).
- **6. Cross-country common questions:** harmonised core: left-right, democracy satisfaction, efficacy, economic evaluations, party/leader likes (EXCLUDED), turnout.
- **7. Demographics:** age, gender, education, employment, income, religion, urban/rural.
- **8. Weights:** IMD sample/demographic/political weights.  **9. Sampling design:** national election studies, harmonised.
- **10. Wording availability:** IMD codebook (5 parts) downloaded.  **11. Response scales:** 0–10, 4/5-point.
- **12. Missingness:** structured missing codes; items absent in some modules.
- **13. Construct linkability:** high (long time series, 59 polities).
- **14. Greek evaluability:** Greek n = 5,461; role: final_locked (F3+), pending ELNES overlap check.
- **15. Licence:** CSES: free download, cite.  **16. AI-training restrictions:** not restricted (none stated).  **17. Commercial use:** unclear.
- **18. Overlap with existing data:** SUPERSET of CSES Module 5 respondents for module-5 polities; Greek rows overlap with held ELNES (see M5). Stored zipped (1.45 GB unzipped)..

### `jrc_waste_sorting_labels_21eu`: Design and behavioural research study to create evidence-based, EU harmonised consumer waste sorting labels — online survey/experiment (Wide data)

- **Producer / source:** European Commission JRC (CCBI). https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/CCBI-DATA-PUBLIC/ (zip member "WSL Dataset/Wide data.dta", extracted by HTTP range request; salience/understanding task long files not downloaded)
- **1. Respondents:** 16,380.  **2. Countries:** 21 (AT, BE, CZ, DE, DK, EE, ES, FI, FR, GR, HU, IE, IT, LT, LV, MT, PL, PT, RO, SE, SK).  **3. Period:** ≈2023–2024 (see README).  **4. Number of questions (variables):** [5982].
- **5. Respondent-level availability:** yes (wide: one row per respondent, 5,982 columns incl. experiment tasks).
- **6. Cross-country common questions:** identical online questionnaire in 21 EU countries: waste-sorting behaviour, label comprehension/salience tasks, environmental attitudes, demographics.
- **7. Demographics:** age, gender, education, country, region.
- **8. Weights:** quota online panel; check README for weights.  **9. Sampling design:** online access panel with national quotas (non-probability).
- **10. Wording availability:** README docx downloaded; questionnaire wording in variable labels.  **11. Response scales:** Likert, binary choice, task accuracy.
- **12. Missingness:** experiment routing (many structural NA).
- **13. Construct linkability:** low–medium (sustainability/waste attitudes; links to EB environment & EFSA food items).
- **14. Greek evaluability:** Greek n = 797; role: final_locked (F3+).
- **15. Licence:** CC BY 4.0 (JRC copyright.txt: Commission reuse policy, Decision 2011/833/EU).  **16. AI-training restrictions:** not restricted.  **17. Commercial use:** yes with attribution.
- **18. Overlap with existing data:** none.

### `jrc_sustainability_labelling_cz_de_es`: Positive, negative or graded sustainability labelling — online choice experiment (CZ, DE, ES)

- **Producer / source:** European Commission JRC / Thøgersen et al. 2024. https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/CCBI-DATA-PUBLIC/ (member labelling_spss.sav)
- **1. Respondents:** 2,312.  **2. Countries:** 3 (CZ, DE, ES).  **3. Period:** ≈2022–2023.  **4. Number of questions (variables):** [207].
- **5. Respondent-level availability:** yes (long: ~2,312 participants × 20 rows).
- **6. Cross-country common questions:** product choice tasks (smartphones etc.) under label treatments; purchase intention, sustainability attitudes.
- **7. Demographics:** age, gender, education, country.
- **8. Weights:** none (quota online sample).  **9. Sampling design:** online panel experiment (non-probability).
- **10. Wording availability:** variable labels in SPSS.  **11. Response scales:** choice, Likert.
- **12. Missingness:** task routing.
- **13. Construct linkability:** low (experimental choice, no Greece).
- **14. Greek evaluability:** Greek n = 0; role: absent.
- **15. Licence:** CC BY 4.0 (JRC).  **16. AI-training restrictions:** not restricted.  **17. Commercial use:** yes with attribution.
- **18. Overlap with existing data:** none.

### `jrc_digital_food_information_bg_de_es_2023`: Consumer attitudes to digital food information (QR codes) — behavioural study, BG/DE/ES

- **Producer / source:** European Commission JRC (Gaudeul & Krawczyk 2024). https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/CCBI-DATA-PUBLIC/Gaudeul&Krawczyk(2024)Consumer_attitudes_to_digital_food_information.zip
- **1. Respondents:** 3,835.  **2. Countries:** 3 (BG, DE, ES).  **3. Period:** 2023-02 (questionnaire version "DEF Feb 2023").  **4. Number of questions (variables):** [218].
- **5. Respondent-level availability:** yes (long file: 3,835 respondents, 61,360 rows).
- **6. Cross-country common questions:** food purchase choices with/without digital (QR) information, price/weight, smartphone use, information-seeking attitudes.
- **7. Demographics:** age, gender, education, income, country (CO).
- **8. Weights:** none stated.  **9. Sampling design:** online panel, national quotas (non-probability).
- **10. Wording availability:** questionnaire PDF + DATAMAP.xlsx (in zip).  **11. Response scales:** choice, Likert.
- **12. Missingness:** task routing.
- **13. Construct linkability:** low–medium (food purchase & tech adoption; links to EFSA/TealHelix food items).
- **14. Greek evaluability:** Greek n = 0; role: absent.
- **15. Licence:** CC BY 4.0 (JRC).  **16. AI-training restrictions:** not restricted.  **17. Commercial use:** yes with attribution.
- **18. Overlap with existing data:** none.

### `zenodo_21099493_sea2see_seafood_fr_gr_pt_es`: SEA2SEE consumer survey on seafood consumption (France, Greece, Portugal, Spain/Catalonia)

- **Producer / source:** SEA2SEE project (Horizon Europe). https://doi.org/10.5281/zenodo.21099492 (version 21099493)
- **1. Respondents:** 382.  **2. Countries:** 4 (ES, FR, GR, PT).  **3. Period:** ≈2024–2025.  **4. Number of questions (variables):** [37, 37, 37, 38].
- **5. Respondent-level availability:** yes (anonymised, per-country xlsx).
- **6. Cross-country common questions:** same questionnaire in 4 countries: seafood consumption frequency, purchase barriers, perceptions of responsible seafood.
- **7. Demographics:** limited (age group, gender, stakeholder type).
- **8. Weights:** none.  **9. Sampling design:** convenience/stakeholder sample (non-probability, ~90–110 per country).
- **10. Wording availability:** column headers carry question text.  **11. Response scales:** Likert, multi-choice.
- **12. Missingness:** anonymisation removed some fields.
- **13. Construct linkability:** low (small, non-representative).
- **14. Greek evaluability:** Greek n = 91; role: final_locked (F3+) — tiny.
- **15. Licence:** CC BY 4.0.  **16. AI-training restrictions:** not restricted.  **17. Commercial use:** yes with attribution.
- **18. Overlap with existing data:** none.

### `oecd_piaac_cycle1_puf`: OECD PIAAC Cycle 1 (Survey of Adult Skills 2011–2018) — international Public Use Files, all countries

- **Producer / source:** OECD. https://webfs.oecd.org/piaac/index.html (cy1-puf-data/SPSS)
- **1. Respondents:** 230,691.  **2. Countries:** 35 (AT, BE, CA, CL, CZ, DE, DK, EC, EE, ES, FI, FR, GB, GR, HU, IE, IL, IT, JP, KR, KZ, LT, MX, NL, NO, NZ, PE, PL, RU, SE, SG, SI, SK, TR, US).  **3. Period:** Round 1 2011-12, Round 2 2014-15 (incl. Greece), Round 3 2017-18.  **4. Number of questions (variables):** [1328, 1328, 1328, 1328, 1328, 1328, 1328, 1328, 1328, 1328, 1328, 1328, 1328, 1328, 1328, 1328, 1327, 1328, 1328, 1328, 1328, 1328, 1328, 1328, 1328, 1328, 1328, 1328, 1328, 1328, 1328, 1328, 1328, 1328, 1328, 1349].
- **5. Respondent-level availability:** yes (adults 16–65).
- **6. Cross-country common questions:** identical background questionnaire in all countries: ICT use at home/work (email, internet for information, online transactions/banking/buying, spreadsheets, programming), reading/numeracy practices, learning, trust in others, political efficacy, volunteering, health, income/earnings deciles, plus literacy/numeracy/problem-solving plausible values.
- **7. Demographics:** age bands (PUF), gender, education (ISCED), employment, occupation (ISCO 1-digit), income deciles, parents' education, household.
- **8. Weights:** SPFWT0 final weight + 80 replicate weights.  **9. Sampling design:** probability household samples, ~5,000 per country, CAPI + computer-based assessment.
- **10. Wording availability:** SPSS variable/value labels; BQ master questionnaire public at OECD (not downloaded: oecd.org 403 to automated client).  **11. Response scales:** 5-point frequency, 4/5-point agree, binary, deciles.
- **12. Missingness:** valid skip / don't know / refused / not stated codes; some country-specific suppressions in PUF (e.g. age in 5-year bands).
- **13. Construct linkability:** medium–high for tech adoption/online transactions, trust, efficacy (links to ESS internet use, EB internet use, ISSP DigSoc pretest).
- **14. Greek evaluability:** Greek n = 4,925; role: final_locked (F3+).
- **15. Licence:** OECD terms: content before 1 Jul 2024 "available for commercial and non-commercial purposes on terms similar to CC BY 4.0"; CC BY 4.0 default after 1 Jul 2024.  **16. AI-training restrictions:** not restricted (none stated).  **17. Commercial use:** yes with attribution (OECD terms).
- **18. Overlap with existing data:** none.

### `oecd_piaac_cycle2_puf`: OECD PIAAC Cycle 2 (Survey of Adult Skills 2023) — international Public Use Files

- **Producer / source:** OECD. https://webfs.oecd.org/piaac/index.html (cy2-puf-data/SPSS)
- **1. Respondents:** 149,762.  **2. Countries:** 28 (AT, BE, CA, CH, CL, CZ, DE, DK, EE, ES, FI, FR, GB, HR, HU, IE, IL, IT, JP, KR, LT, LV, NZ, PL, PT, SG, SK, US).  **3. Period:** 2022-09 to 2023-06.  **4. Number of questions (variables):** [2483, 2483, 2483, 2483, 2483, 2483, 2483, 2483, 2483, 2483, 2483, 2483, 2483, 2483, 2483, 2483, 2483, 2483, 2483, 2483, 2483, 2483, 2483, 2483, 2483, 2483, 2483, 2483].
- **5. Respondent-level availability:** yes (adults 16–65).
- **6. Cross-country common questions:** Cycle 2 background questionnaire (revised): ICT use, digital skills, learning, trust, political efficacy, social outcomes, wellbeing; adaptive problem solving.
- **7. Demographics:** age, gender, education, employment, income.
- **8. Weights:** SPFWT0 + replicate weights.  **9. Sampling design:** probability household samples, tablet-based.
- **10. Wording availability:** SPSS labels.  **11. Response scales:** as Cycle 1 (some items revised).
- **12. Missingness:** as Cycle 1.
- **13. Construct linkability:** medium (no Greece; linkage via shared BQ items with Cycle 1 and other surveys).
- **14. Greek evaluability:** Greek n = 0; role: absent (Greece did not participate).
- **15. Licence:** OECD terms / CC BY 4.0.  **16. AI-training restrictions:** not restricted (none stated).  **17. Commercial use:** yes with attribution.
- **18. Overlap with existing data:** none.

## 5. Held sources (baseline lake, catalogued for completeness)

| Slug | Survey | Period | Respondents | Countries | Greek n | Greek role | Licence | Overlap |
|---|---|---|---|---|---|---|---|---|
| `ess_r1_r2_r4_r5` | ESS Rounds 1, 2, 4, 5 integrated | 2002–2011 | 200,635 | 22/26/29/27 per round | 9,759 | dev | ESS CC BY-NC-SA 4.0 | — |
| `ess_r10` | ESS Round 10 integrated (F2F) | 2021-22 | 33,351 | ≈22 | 2,799 | dev | ESS CC BY-NC-SA 4.0 | — |
| `ess_r11` | ESS Round 11 integrated | 2023-24 | 46,162 | 28 | 2,757 | dev (already revealed) | ESS CC BY-NC-SA 4.0 | — |
| `eb_843` | Eurobarometer 84.3 (Nov 2015) | 2015-11 | 32,833 | ≈34 samples | 1,002 | dev | CC0 deposit / EB | also inside new VTGQ9Q stacked file (8 non-Greek countries) |
| `eb_862` | Eurobarometer 86.2 (Nov 2016) | 2016-11 | 32,896 | ≈34 samples | 1,008 | dev | CC0 deposit / EB | also inside VTGQ9Q (8 countries) |
| `eb_884` | Eurobarometer 88.4 (Dec 2017) | 2017-12 | 28,031 | 28 | 1,010 | dev | CC0 deposit / EB | — |
| `eb_931` | Eurobarometer 93.1 (Jul–Aug 2020) | 2020-07 | 33,059 | ≈33 samples | 1,016 | dev | CC0 deposit / EB | — |
| `eb_943` | Eurobarometer 94.3 (Winter 2020–21) | 2021-02 | 38,718 | ≈42 codes | 1,058 | dev | CC BY 4.0 (Zenodo) | — |
| `eb_1033_trimmed` | Eurobarometer 103.3 (2025) trimmed | 2025-03 | 36,575 | ≈38 samples | 1,015 | dev | CC0 deposit / EB | — |
| `flash_eb_506` | Flash Eurobarometer 506 (2022) | 2022-04 | 26,053 | 27 | 1,074 | dev | CC0 deposit / EB | — |
| `efsa_eb_2019_2022_2025` | EFSA Food Safety Eurobarometers 2019 / 2022 / 2025 | 2019, 2022, 2025 | 87,207 | 28 / 27 / 34 | 3,042 | dev | CC BY 4.0 (Zenodo/EFSA) | — |
| `lrf_world_risk_poll` | Lloyd's Register Foundation World Risk Poll 2019/2021/2023/2025 | 2019–2025 | 570,475 | 121–142 per wave | 4,097 | dev | LRF/Gallup public file (see phase4 manifest) | Gallup World Poll vehicle — different respondents from WGM |
| `wellcome_global_monitor_2018` | Wellcome Global Monitor 2018 | 2018 | 149,000 | 144 | 1,000 | final_locked (F1) | no explicit licence; Wellcome page | — |
| `wellcome_global_monitor_2020` | Wellcome Global Monitor 2020 | 2020 | 119,088 | ≈113 | 1,006 | dev | no explicit licence | — |
| `tisp` | TISP — Trust in Science and Science-related Populism (68 countries) | 2022-23 | 71,922 | 68 | 1,436 | dev | CC BY 4.0 | — |
| `covidistress` | COVIDiSTRESS global survey 2020 | 2020-03/05 | 125,306 | ≈170 (convenience) | 642 | dev | CC0 | — |
| `lits_iv` | EBRD Life in Transition Survey IV | 2022-12/2023-03 | 37,478 | ≈37 | 1,001 | dev (already revealed) | no explicit licence (EBRD) | LiTS III/II/I new downloads = different respondents |
| `qog_eqi_2021` | QoG EQI 2021 individual | 2020-10/2021-02 | 129,991 | 27 | 6,842 | final_locked (F2) | QoG non-commercial academic | — |
| `qog_eqi_2024` | QoG EQI 2024 individual | 2023-09/10 | 135,242 | 27 | 8,246 | dev | QoG non-commercial academic | — |
| `maple` | MAPLE (Greek waves; see PERSONA_MICRODATA_AUDIT) | 2019 | 1,383 | GR | 1,383 | dev | CC0 | — |
| `cses_m6_advance` | CSES Module 6 advance release (no Greece) | 2021–2024 | data deleted (codebook only) | 18 | 0 | absent | CSES free | — |
| `tealhelix_11eu` | TealHelix food-label survey (11 EU incl. GR) | 2025 | 2,767 | 11 | 303 | dev | CC BY 4.0 | — |
| `valereco_legumes` | VALERECO legumes consumers (7 countries) | 2024–25 | 600 | 7 | 116 | dev | CC BY 4.0 | — |
| `populism_it_gr_es` | Populist attitudes IT/GR/ES 2022 | 2022 | 3,246 | 3 | 1,082 | dev | CC BY 4.0 | — |
| `issp_digsoc_pretest` | ISSP Digital Societies pretest (5 countries) | ≈2022–23 | 4,055 | 5 | 1,579 | dev | CC BY 4.0 | — |

The remaining attributes for held sources (wording, scales, missingness, sampling) are documented in `.synthetic-lab-data/raw/phase4/manifest.jsonl` and `.synthetic-lab-data/raw/sprint/microdata/manifest.jsonl`. In `catalog.jsonl` these records point to those manifests.

**Overlaps and leakage risks found in this sprint:**
1. **CSES Module 5 / IMD Greek rows and held ELNES 2019 (sprint).**
   - The Greek CSES component is fielded inside the Hellenic National Election Study.
   - The Greek CSES 2019 rows are therefore probably the same respondents as the held ELNES 2019 standalone file.
   - Before the CSES Greek rows are used as an F3+ holdout, match respondent IDs, n and fieldwork dates against ELNES. If they match, treat them as already-seen data.
   - The 2015 Greek CSES rows may likewise overlap with ELNES 2015 (not held).
2. **The VTGQ9Q stacked EB file contains the held EB 84.3 and 86.2 waves (8 non-Greek countries).** Drop survey_id 843/862 when pooling.
3. **CSES IMD ⊃ CSES Module 5** for the Module 5 polities. Use one of the two, not both.
4. **LiTS III vs LiTS IV, QoG EQI 2010/2013/2017 vs 2021/2024, and EB 75.3/78.1/97.5/98.2/99.4/100.2/101.3 vs held EB waves:** these are separate cross-sections with different respondents, so there is no overlap.
5. **ESS R3/R6–R9** come from the same Harvard deposit (2DPD79) as the held R1/2/4/5. The files are disjoint and have md5 checksums verified against Dataverse.

## 6. Blocked or not downloaded, and why

| Slug | Source | Status | Greek n | Why |
|---|---|---|---|---|
| `worldbank_findex_2025` | Global Findex Database 2025 (141 economies, per-country microdata) | blocked_terms_acceptance | ≈1,000 (GRC_2024_FINDEX_v02_M) | Download is a click-through acceptance of terms; per sprint rules terms are not accepted on the user's behalf. User can accept and download 141 files (~1–3 MB … |
| `worldbank_findex_2011_2021` | Global Findex 2011, 2014, 2017, 2021 (per-economy files) | blocked_login | ≈1,000 per wave | Requires Microdata Library account (no account creation). |
| `ecb_consumer_expectations_survey` | ECB Consumer Expectations Survey (CES) microdata | blocked_terms_acceptance | large (monthly Greek panel since 2022; not counted) | Direct CSV download but downloading = acceptance of terms; not accepted on the user's behalf. Highest-value economic-expectations source with Greek rows — reco… |
| `ecb_space_payments` | ECB SPACE — Study on the payment attitudes of consumers in the euro area (… | not_public | unknown | No respondent-level release located; contact ECB/Bank of Greece. |
| `ecb_hfcs` | ECB Household Finance and Consumption Survey (HFCS) | restricted_application | ≈3,000 households/wave | Application required. |
| `pvs_peoples_voice_survey` | People's Voice Survey (QuEST Network) — multi-country health-system user s… | blocked_guestbook | unknown (not counted) | Dataverse returns "You may not download this file without the required Guestbook response"; filling the form on the user's behalf is not allowed. High value (c… |
| `arab_barometer` | Arab Barometer (Waves I–VIII) | blocked_form | 0 | Registration-style form (no account creation / no form submission on user's behalf). |
| `latinobarometro` | Latinobarómetro | blocked_terms_acceptance | 0 | Requires accepting end-user agreement. |
| `asian_barometer` | Asian Barometer Survey | restricted_application | 0 | Application required. |
| `lapop_americasbarometer` | LAPOP AmericasBarometer | blocked_login | 0 | Registration (unverified this session). |
| `pew_global_attitudes` | Pew Research Center Global Attitudes surveys (incl. Greece 2018–2025) | blocked_login | ≈1,000 per wave | Account required (recorded in sprint; unchanged). |
| `wvs_evs` | World Values Survey wave 7 / European Values Study 2017 / Joint EVS-WVS | blocked_login | ≈1,200 (WVS7/EVS GR) | Registration/login; Harvard Dataverse copies (e.g. 2DPD79, WT9LMT ZA7505, OBGENQ, Y5Y6VD ZA7500) skipped as licence-conflicting redistributions. |
| `gesis_eb_issp_ees` | GESIS archive: further Eurobarometer waves, ISSP modules, EES voter studies | blocked_login_cloudflare | ≈1,000 per EB wave | Cloudflare + login. Consumer-themed EB waves only at GESIS/ICPSR (see icpsr_eb_consumer_waves). |
| `icpsr_eb_consumer_waves` | ICPSR copies of consumer/tech-themed Eurobarometers (EB 54.0 euro & financ… | blocked_login | ≈1,000 per wave | ICPSR/GESIS login required; Harvard Dataverse lists only metadata (0 files). |
| `harvard_eb915_7PGZIS` | Eurobarometer 91.5 (2019) — Harvard Dataverse doi:10.7910/DVN/7PGZIS | blocked_restricted_files | ≈1,000 | Files restricted. |
| `harvard_eb952_SNH4RC` | Eurobarometer 95.2 (2021) — Harvard doi:10.7910/DVN/SNH4RC | skipped_no_licence | ≈1,000 | No licence (same decision as Phase 4). |
| `harvard_eb_perceptions_C7A5TN` | EB_perceptions stacked EB file (109 MB) — Harvard doi:10.7910/DVN/C7A5TN | skipped_no_licence | unknown | No licence. |
| `harvard_eupinions_WRLXWI` | bertelsmann.rds (eupinions microdata) in Harvard doi:10.7910/DVN/WRLXWI | skipped_licence_conflict | small per wave | Original access conditions not compatible with third-party CC0 copy. |
| `harvard_eb_stacked_W1GW7A` | Stacked EB regional file (566,764 rows, 38 vars) — Harvard doi:10.7910/DVN… | considered_not_downloaded | not counted | Only 6 attitude items (trust EU/government, EU position, economic expectations, attachment, left-right); overlaps held EB waves; low marginal value vs 109 MB. |
| `harvard_ess1_10_cumulative_6TU1AX` | ESS 1–10 cumulative file (1.8 GB) — Harvard doi:10.7910/DVN/6TU1AX | considered_not_downloaded | Greek rounds already held | Duplicates held rounds; missing rounds (3,6–9) obtained separately at 1/10 of the size. |
| `eurofound_eqls_ewcs` | Eurofound EQLS (2003–2016), EWCS (1991–2015), EWCTS 2021, Living & Working… | blocked_login | ≈1,000 per wave | UKDS login required. |
| `share` | SHARE — Survey of Health, Ageing and Retirement in Europe | blocked_login | ≈3,000–5,000 per wave | Registration. |
| `eib_surveys` | EIB Investment Survey (EIBIS, firms) / EIB Climate Survey | restricted_application | ≈600 firms/yr (EIBIS) | Confidential/application; EIBIS is firm-level, not consumers. |
| `oecd_risks_that_matter` | OECD Risks that Matter survey (2018, 2020, 2022, 2024) | restricted_application | ≈1,000 per wave | Request required. |
| `global_preferences_survey` | Global Preferences Survey (Falk et al.) | blocked_unreachable | ≈1,000 | Site unreachable this session; registration expected. |
| `reuters_digital_news_report` | Reuters Institute Digital News Report (YouGov online, incl. Greece since 2… | restricted_on_request | ≈2,000 per year | On request only — highest-value media/streaming source with Greek rows. |
| `eurostat_silc_lfs` | Eurostat EU-SILC / EU-LFS / HBS / ICT usage microdata | restricted_application | large | Research-entity application (recorded in sprint). |
| `data_europa_consumer_surveys` | DG JUST Consumer Conditions Survey & Consumer Market Monitoring Survey (da… | not_microdata | ≈1,000 per wave | Only aggregate dissemination databases (85 KB zip; 5.8 MB 7z pivot tables) and PDFs; no respondent-level files. |
| `osf_hosted_multicountry` | OSF-hosted multi-country surveys with Greek samples (ICSMP COVID moral psy… | blocked_robots | ≈200–500 each | api.osf.io robots Disallow: / ; osf.io blocks AI crawlers — not accessed (as Phase 4). |
| `jrc_temporary_protection_conjoint` | JRC — Support for temporary protection of displaced populations in the EU:… | considered_not_downloaded | unknown | Migration conjoint experiment — low linkability to the consumer focus; Greek coverage unverified; candidate for a later sprint. |
| `jrc_cocomi_misinformation` | JRC — prebunks/debunks of misinformation, online experiments in four EU co… | considered_not_downloaded | unknown | Experiment with media stimuli; small; not prioritised. |
| `harvard_supply_chain_conjoint_URL6A4` | Cross-national public acceptance of sustainable global supply chains polic… | considered_not_downloaded | unknown | Conjoint design with few respondent-level attitude items; countries not labelled in DDI. |
| `yougov_imperial_covid_tracker` | Imperial College London YouGov COVID-19 Behaviour Tracker (GitHub) | considered_not_downloaded | 0 (unverified) | COVID-specific behaviour items; GitHub access not enabled for this session; low linkability. |

**Unlocks that need a user decision**, in order of value for the consumer and economic domains with Greek rows. None of these needs an account; each needs the user to accept terms or fill a form:
1. **ECB Consumer Expectations Survey:**
   - Direct CSV download.
   - "By downloading the data, you agree…": scientific use only, no commercial use.
   - Includes Greece from April 2022, monthly.
   - Covers inflation, income and spending expectations, consumption and credit.
2. **Global Findex 2025:**
   - World Bank "Direct access", with a click-through agreement: research use only, no redistribution.
   - 141 economies including Greece.
   - Covers accounts, digital payments, online purchases, saving, borrowing and connectivity.
3. **People's Voice Survey:**
   - CC0, but the Harvard Dataverse guestbook needs a name and email.
   - Includes Greece.
   - Covers health-service use, satisfaction and trust.
4. **Reuters Digital News Report** (media and streaming, Greece yearly) and **OECD Risks that Matter** (Greece) are available on request.

## 7. Recommendations: top 5 transfer experiments

The ranking is by the number of items common across countries including Greece, the size of the Greek holdout, and fit to the target domains.

1. **Eurobarometer standard trend block (14 Greek-bearing waves 2011–2025 including Flash 506, plus the 1970–2002 trend file).**
   - This sprint adds 7 full Standard EB waves with Greek rows: 75.3 (2011), 78.1 (2012), 97.5 (2022), 98.2, 99.4, 100.2 (2023) and 101.3 (2024).
   - The held waves are 84.3, 86.2, 88.4, 93.1, 94.3, 103.3t and FL506.
   - 260–340 variables per wave are present in all 34–39 non-Greek samples.
   - The trend block is the same in every wave:
     - economic situation and expectations
     - important issues (country, personal, EU)
     - institutional trust (≈10 items)
     - direction of the country and voice counts
     - life and democracy satisfaction
     - left-right
     - media and internet use, plus false-news items (98.2, 100.2)
     - durables ownership and difficulty paying bills (older waves)
   - The trend file adds 1.13 M respondents on about 95 harmonised items, with Greek rows for 1980–2002.
   - **Experiment:**
     - S1 and R0/Rm on the 7 new Greek waves (≈7,060 locked Greek rows), with model C trained on all EB waves and countries.
     - The 2022–24 run of consecutive waves also allows a temporal-transfer check against held 94.3 (dev) and 103.3t (dev).
     - These are ECONOMIC EXPECTATIONS and MEDIA & TECH targets.
2. **ESS, all 11 rounds (R1–R11; Greek in R1/2/4/5/10/11).**
   - The new non-Greek rounds 3 and 6–9 add 233k respondents on the identical core, about 200 items: social and political trust, satisfaction, values, internet use, wellbeing.
   - This gives the densest country × column matrix for model C. The rotating modules can be used for S2 (leave-one-family-out).
   - The Greek ESS rows are development data, so ESS is the main **development** bench rather than a holdout.
3. **LiTS I–IV (2006, 2010, 2016, 2022–24; ≈164k respondents; 44 countries in LiTS I–III and SSA, plus the held LiTS IV).**
   - LiTS III gives a new Greek holdout (n = 1,503) next to Cyprus, Italy, Germany, Turkey and Balkan neighbours.
   - It has 546 variables present in all 33 non-Greek countries.
   - Shared items include banking and savings, financial access, economic perceptions, trust, corruption, media sources and life satisfaction.
   - **Experiment:** CONSUMER and ECONOMIC transfer. Train on LiTS IV plus non-Greek LiTS III, calibrate on LiTS IV Greek (dev), and evaluate on LiTS III Greek (locked).
4. **QoG EQI 2010/2013/2017 (new) plus 2021/2024 (held): 5 waves, 461,910 respondents, about 59–67 items common in every country.**
   - Greek n is large: 780, 1,613 and 1,620 locked here, plus F2 = 6,842 and dev = 8,246.
   - Items cover the quality and impartiality of public services, corruption experience and trust.
   - This is the best-powered test of R0 vs R5/R10/R20 and of regional (NUTS2) post-stratification.
   - Party-vote items Q24/Q25 must be excluded.
5. **OECD PIAAC Cycle 1 (36 files: 35 countries, with the US in 2012 and 2017) plus Cycle 2 (28 files, no Greece).**
   - An identical background questionnaire covers ICT and internet use, online transactions, purchases and banking, reading and numeracy practices, trust, political efficacy and earnings.
   - Greece has n = 4,925 (F3+ locked).
   - This is the strongest **MEDIA & TECH / technology-adoption** transfer set that includes Greece. It also has replicate weights for uncertainty.

Honourable mentions:
- **CSES IMD / Module 5:** political attitudes such as democracy satisfaction and efficacy, after the ELNES overlap check, and with vote items excluded.
- **EB cultural participation 2007/2013/2017:** cultural consumption across 28 countries.
- **JRC waste-sorting survey:** 21 EU countries, consumer sustainability behaviour, Greek n = 797.

## 8. Method and compliance log

- **Discovery:**
  - Harvard Dataverse search and metadata API, plus DDI variable metadata to identify GESIS study numbers before downloading.
  - DataCite API for Zenodo and other repositories (Zenodo `/search` and `/api` are robots-disallowed; only `/api/records/*/files` and record pages were used).
  - The data.europa.eu search API.
  - The World Bank NADA catalogue API, used to find access types.
  - Producer pages: EBRD, OECD webfs, QoG, CSES, Afrobarometer and the JRC open-data FTP.
  - Web search, for access rules.
- **No accounts were created. No terms were accepted, and no guestbooks or forms were filled.** Sources gated by click-through terms (Findex 2025, ECB CES) or by a guestbook (PVS) were recorded as blocked.
- **Third-party Harvard copies:** Eurobarometer and ESS files were accepted on the Phase 4 precedent (EB at GESIS reportedly open-access class; ESS CC BY-NC-SA). EVS, ISSP, EES and eupinions redistributions were refused.
- **JRC zip members were fetched with HTTP range requests.** This avoided downloading the 2.2 GB archive in order to get one 156 MB file. Range reads are an ordinary feature of the public file server.
- **All parsing used `python3 -I`** with pyreadstat, pandas and zipfile. No code shipped in downloads (.do, .Rmd, .R, .sps) was executed.
- **Greek rows were counted only.** The coverage statistics in §3 dropped Greek rows before any computation.
