# Cross-national social / public-opinion surveys with a Greek sample: access, licences, commercial-use verdicts (as of 27 Oct 2026)

Scope: survey programmes with Greek (GR/EL) data that could ground a Greek synthetic-respondent lab and validate it against real data. The focus is legal and programmatic usability for a private, possibly commercial product. Facts were checked live where possible on 2026-10-27. Several sites blocked automated fetching: gesis.org returned HTTP 403, and eur-lex, eurofound and oecd.org returned 202, 429 or 403. Claims that rest only on search snippets, not the fetched primary page, are flagged as such.

### Summary matrix (details and citations in the sections below)

| Source | Greek data (years) | Greek N | Microdata / aggregates | Licence / terms | Commercial verdict | Registration | Programmatic download without login |
|---|---|---|---|---|---|---|---|
| ESS | R1 2002, R2 2004, R4, R5 2010/11; R10 2021/22; R11 2023/24 (latest released); R12 fielded 2025/26, data due Jan 2027 | R10 ≈2,799 (third-party); R11 not verified; R1 3,227 households issued | Microdata (CSV, SAV, DTA; parquet via API) | Data CC BY-NC-SA 4.0; documentation CC BY-SA 4.0 | Non-commercial only (data); documentation may be used commercially with share-alike | Yes (portal login) | No. The beta API needs a `userId` from a logged-in account. |
| EVS | 2008, 2017 (fieldwork 2018/19) via GESIS (ZA7500 integrated; ZA7546 Greece) | Conflicting (1,200 design target; a GESIS table snippet says 3,892 CAWI) | Microdata | GESIS terms (historically "academic research and teaching") | Non-commercial; written request needed for anything else (unverified for the newest category scheme) | Yes | No |
| WVS | Wave 7, Greece 2017 (first-ever WVS in Greece) | 1,200 | Microdata | WVS "Conditions of use": non-profit only, no redistribution | Non-commercial only | Yes (form) | No |
| Joint EVS/WVS 2017-22 | Greece included through the EVS/WVS 2017 data | n/a | Microdata (GESIS ZA7505) | GESIS terms | Non-commercial (unverified detail) | Yes | No |
| ISSP | Greece is a member (Aristotle Univ. Thessaloniki); e.g. ISSP 2021 Health (Greece) at GESIS | not verified | Microdata via GESIS | GESIS terms | Non-commercial (GESIS default) | Yes | No |
| Eurobarometer: aggregated volumes | Every Standard, Special and Flash wave; latest Standard found: EB104 Autumn 2025 | ~1,000 per wave (typical; not verified this session) | Aggregated xlsx tables (vol. A, AA, AP, B, C, D) | "European Commission reuse notice" = Decision 2011/833/EU | Commercial reuse allowed with attribution (subject to third-party-rights exclusions) | No | Yes. The data.europa.eu search API plus direct webgate xlsx links worked with no login (HTTP 200). |
| Eurobarometer: microdata | Every wave, GESIS ZA series (e.g. ZA9128 = EB103.3, ZA9130 = EB104.1) | ~1,000 | Microdata (SPSS, Stata) | GESIS terms ("academic research and teaching") | Non-commercial; written request otherwise | Yes | No |
| Pew Global Attitudes | Greece in Spring 2025 and Spring 2026 waves (telephone since 2021) | not verified | Microdata datasets + topline PDFs | Pew T&C §13: royalty-free, non-exclusive, revocable, excerpt-only | Unclear. Not explicitly barred, but limited to excerpts with no full redistribution. | Datasets: account needed (unverified) | Toplines (PDF): yes |
| OECD (PISA, PIAAC, How's Life) | PISA 2000-2022; PIAAC Cycle 1 Round 2 (2014-15) | PISA 2022: 6,578 students, 242 schools | Microdata (PISA) + aggregates | CC BY 4.0 for content published from 1 Jul 2024; older content "similar to CC BY 4.0" | Allowed with attribution (data-specific terms for PISA microdata unverified) | No (PISA public-use files) | Yes for aggregates; PISA files likely (unverified) |
| Eurofound (EQLS, EWCS, EWCTS, COVID e-survey) | EQLS 2003-2016 (EU27 incl. Greece) | not verified | Microdata via UK Data Service | Free for non-commercial use; commercial requests to Eurofound | Non-commercial without Eurofound authorisation | Yes (UKDS) | No |
| SHARE | Greece in waves incl. Wave 9 (2021-22) | not verified | Microdata | SHARE Conditions of Use: scientific purposes only | Commercial expressly excluded | Yes | No |
| EU-SILC / EU-LFS microdata | Greece included | n/a | Scientific-use files (SUFs) + public-use files (PUFs) | Reg. (EU) 557/2013: recognised research entities only | SUFs non-commercial; PUFs unverified | Yes (SUFs) | PUFs: likely (unverified) |
| Gallup World Poll | Greece in panel (annual) | ~1,000 typical (not verified for GR) | Microdata | Commercial subscription licence | Commercial (paid) | Yes | No |
| CSES | Greece via ELNES (not researched) | – | – | – | Political; out of scope | – | – |

## European Social Survey (ESS)

### Takeaway
Greece is in ESS Round 11 (2023/24), the latest released round as of Oct 2026, with final Edition 4.0 released on 21 Nov 2025. Round 12 (2025/26) was fielded in Greece by EKKE, and its data are expected in January 2027. ESS data are licensed CC BY-NC-SA 4.0, not CC BY 4.0, and ESS says the data are free "for not-for-profit purposes". A commercial synthetic-respondent product cannot use ESS microdata under the public licence without separate permission from ESS ERIC. Download needs a free login, including through the beta API.

### Cited Findings
- **Licence (verbatim):** "European Social Survey data is licensed under CC BY-NC-SA 4.0" and "European Social Survey documentation is licensed under CC BY-SA 4.0" — [ESS Disclaimer](https://www.europeansocialsurvey.org/contact/disclaimer)
- The same page says: "The data are available without restrictions, for not-for-profit purposes." It also says "'commercial use' is defined by the nature of the activity, not the sector in which the actor is operating." — [ESS Disclaimer](https://www.europeansocialsurvey.org/contact/disclaimer)
- **Conditions on that page:** cite ESS ERIC correctly; "you make clear that the datasets are freely available to download from our Data Portal"; "you give no impression that you are linked to or authorised by the ESS ERIC". Also: "The use of remixed or transformed ESS data or documentation must meet the same conditions". The page recommends that datasets are not hosted on external websites, and that modified data are cited as "Adapted from ESS Round X, version number X". — [ESS Disclaimer](https://www.europeansocialsurvey.org/contact/disclaimer)
- **Conflict to note:** the Norwegian national data catalogue entry for the ESS API (operated by Sikt) lists the licence as "Creative Commons Attribution 4.0 International (CC BY 4.0)". The ESS ERIC disclaimer (CC BY-NC-SA 4.0) is the data owner's statement and should prevail. — [data.norge.no ESS API entry](https://data.norge.no/en/data-services/19fd0800-e6da-39d3-a862-bd9473051283); contradicted by [ESS Disclaimer](https://www.europeansocialsurvey.org/contact/disclaimer)
- The ESS prospectus describes the data as freely available to all for non-commercial use (search snippet). — [ESS Prospectus PDF](https://www.europeansocialsurvey.org/sites/default/files/2023-05/ESS_Prospectus_English.pdf)
- **Round 11 final release:** 21 Nov 2025, integrated file Edition 4.0, 30 countries. Greece is in the Edition 3.0 country list carried into 4.0. Round 11 was fielded in 31 countries; Czechia (self-completion) is available only as a separate country file. — [ESS: Final release of Round 11 data](https://www.europeansocialsurvey.org/news/article/final-release-round-11-data)
- The first Round 11 release (20 June 2024, 13 countries) did not include Greece. Greece arrived in the second release (24 countries). — [ESS: Round 11 data now available](https://www.europeansocialsurvey.org/news/article/round-11-data-now-available); [ESS: Second release of Round 11](https://www.europeansocialsurvey.org/news/article/second-release-round-11-data-now-available)
- **Round 12 (2025/26):** data "expected to be published for the first time in January 2027". The questionnaire was published on 12 Jan 2026. — [ESS: Final release of Round 11 data](https://www.europeansocialsurvey.org/news/article/final-release-round-11-data). EKKE runs the Greek R12 fieldwork on a nationwide representative sample. — [EKKE R12 project page](https://www.ekke.gr/en/research/project/ereuna-pediou-gia-ton-12o-giro-tis-europaikis-kinonikis-ereunas-stin-ellada)
- The ESS site carries a news item titled "Greece becomes member of ESS ERIC". The date and details were not retrieved. — [ESS: Round 11 data now available (site navigation)](https://www.europeansocialsurvey.org/news/article/round-11-data-now-available)
- **Greek participation history:** Greece "took part in four of the first five rounds of the ESS but have not taken part since Round 5 (2010/11)". It returned in Round 10 as a guest country with EKKE as national centre. — [City Univ. Sociology blog / ESS notice](https://blogs.city.ac.uk/sociology/?p=412). R10 fieldwork in Greece ran 19 Nov 2021 to mid-Feb 2022. — [GSRI](https://gsri.gov.gr/en/european-social-survey-10th-wave/). R11 in Greece was funded by ELIDEK, and EKKE presented the results on 16 Dec 2024. — [EKKE](https://www.ekke.gr/en/announcement-front/imerida-parousiasis-ton-apotelesmaton-tis-europaikis-kinonikis-ereunas-ess)
- **Greek sample sizes:** R10 Greece N = 2,799 (third-party catalogue, probability multi-stage sample, ages 15+). — [World Database of Happiness](https://worlddatabaseofhappiness.eur.nl/studies/European%20Social%20Survey%20(ESS)%20(2022):%20study%20GR%202022-20428). R1 (2002-03) was issued to 3,227 households with an 80% response rate; R2 to 3,002 households with 74.2%. — [EKKE journal article](https://ejournals.epublishing.ekt.gr/index.php/SCAD/article/view/9018). ESS requires a minimum effective sample of 1,500 for countries with more than 2 million people aged 15+. — [ESS11 survey specification](https://www.europeansocialsurvey.org/sites/default/files/2023-06/ESS11_survey_specification.pdf)
- **Access and formats:** the portal is ess.sikt.no, built by Sikt. Users download "by logging into the Data Portal" in CSV, SPSS and Stata formats. — [ESS news on Data Portal (search snippet)](https://europeansocialsurvey.org/node/419); [data.norge.no ESS3 entry: "downloaded freely after authentication / login"](https://data.norge.no/en/datasets/fb1c5827-8c20-3a06-ae48-374291bebf05/ess3-integrated-file-edition-37-latvia-and-romania-not-included)
- **API (checked live 2026-10-27):** OpenAPI title "European Social Survey API Documentation". It says "The ESS API is currently in beta. It currently consists of a single endpoint". The endpoint is `GET https://api.ess.sikt.no/v1/data/dataFile/{doiPrefix}/{doiSuffix}?userId=…&fileFormat=parquet|csv|sav|dta&recodeMissingValues`. `userId` is required: "Go to https://ess.sikt.no/en/api and log in to see your user ID … not for authentication - it is used to track usage statistics". Some large files cannot be downloaded through the API. A success returns a 307 redirect to the file. Unauthenticated calls without userId returned HTTP 400. — [ESS API docs](https://api.ess.sikt.no/docs) (spec at https://api.ess.sikt.no/docs/openapi). The community R package `essurvey` also exists. — [rOpenSci essurvey](https://docs.ropensci.org/essurvey/index.html)
- **Weights:** dweight (design), pspwght (post-stratification on age, gender, education, region), pweight (population size, cross-country), and anweight (= pspwght × pweight). ESS says: "We recommend to use the analysis weight (anweight), which is suitable for all types of analysis". anweight is in integrated files from Round 9 onward. — [ESS weighting](https://www.europeansocialsurvey.org/methodology/ess-methodology/data-processing-and-archiving/weighting)
- **Variable groups:** the core in every round covers climate change and energy, crime and justice, democracy and government, immigration, health and wellbeing, institutional and social trust, media and internet use, identity, perceived discrimination, political affiliation/interest/participation, religion, social exclusion, and values (human values scale). R11 rotating modules are Gender (new) and Social inequalities in health (repeating R7). — [ESS: Round 11 data now available](https://www.europeansocialsurvey.org/news/article/round-11-data-now-available)
- The ESS site flags an SPSS recoding script for a Greek coding error in recent data. — [ESS Data Portal page](https://www.europeansocialsurvey.org/data-portal)

### Inferences
- ESS is the best-quality Greek attitudinal benchmark: probability samples, rich trust, politics, wellbeing, immigration and values data, and good weights. However, the NC clause, which ESS defines by the nature of the activity, makes direct use inside a paid product non-compliant without a separate agreement. ShareAlike would also force any derived dataset under CC BY-NC-SA.
- Defensible options: (a) use ESS only for internal, non-commercial validation research, published as such; (b) ask ESS ERIC (essdatasupport@sikt.no) for written commercial permission; (c) use ESS documentation, which is CC BY-SA 4.0 and has no NC clause, for questionnaire wording. Whether publishing aggregate statistics computed from ESS counts as "remixed data" under ShareAlike is a legal question to resolve.
- Programmatic pipelines are feasible after a one-time free registration (userId plus API), but not anonymously.

### Gaps
- Greek achieved N and response rate for R11 not found (the documentation and country files on the portal would give them). Whether Greece was in R4 and R5, and the exact skipped early round, not verified on the ESS country page (404).
- The date of Greece's ESS ERIC membership was not retrieved.
- No ESS statement found on commercial licensing arrangements or fees.

## European Values Study (EVS), World Values Survey (WVS), joint EVS/WVS

### Takeaway
Greece has EVS data (2008 and 2017, the latter fielded 2018/19) and WVS Wave 7 data (2017, N = 1,200, the first-ever WVS in Greece). WVS terms explicitly restrict use to "non-profit purposes" and forbid redistribution. EVS and the joint file are distributed by GESIS under its scientific/academic-use terms. Neither is usable in a commercial product without permission.

### Cited Findings
- **WVS Conditions of Use (verbatim):** "These data files are available without restrictions, provided: a) that they are used for non-profit purposes; … the data files themselves are not redistributed; … proper citation to the WVS data is included into the references list of the publication". Download needs a registration form (name, institution, e-mail, project) and ticking "I have read the 'Conditions of use' and agree with them". — [WVS download licence page](https://www.worldvaluessurvey.org/AJDownloadLicense.jsp)
- **Conflict:** the 2020 WVS7 release announcement said access was "free, with no registration or payments required". The current download page requires the form. — [WVS news ID=413 (search snippet)](https://www.worldvaluessurvey.org/WVSNewsShow.jsp?ID=413)
- **WVS7 Greece:** 1,200 respondents, Sept-Oct 2017, CAPI, probability multi-stage cluster sample, adults 18+. Organised by diaNEOsis with EKKE; fieldwork by Metron Analysis; the first WVS survey in Greece. — [diaNEOsis WVS 2018 report](https://www.dianeosis.org/wp-content/uploads/2018/09/wvs_2018.pdf); [WVS news](https://www.worldvaluessurvey.org/WVSNewsShow.jsp?ID=388) (via search snippets). A B2FIND record "7th Wave of the World Values Survey for Greece" exists. — [B2FIND](https://b2find.eudat.eu/dataset/05dbde1a-1878-59e9-8a87-23ef3d03d72c)
- The latest WVS7 cross-national version seen is WVS7 v5.0.0 (2017-2022). — [B2FIND](https://b2find.eudat.eu/dataset/ca564f45-3091-5430-aced-d69dd8bd4941)
- **EVS 2017 Greece:** GESIS lists "EVS 2017: Greece (ZA7546) | 15-12-2018 - 31-01-2019 | CAWI | 3892". This comes from a search snippet of a GESIS table and conflicts with the EVS design target (effective N 1,200 for countries above 2 million). — [GESIS EVS 5th wave page](https://www.gesis.org/en/european-values-study/data-and-documentation/5th-wave-2017) (403 on direct fetch); integrated dataset ZA7500 — [GESIS DBK ZA7500](https://dbk.gesis.org/dbksearch/sdesc2.asp?db=e&no=7500)
- The joint EVS/WVS 2017-2022 dataset (GESIS ZA7505) has 156,658 cases; WVS7 contributes 97,220 cases from 66 countries and territories. — [GESIS joint dataset page](https://www.gesis.org/en/european-values-study/data-and-documentation/joint-evs/wvs-2017-2022-dataset) (search snippet; 403 on direct fetch)
- **GESIS usage regulations (2023 version, via search snippet):** "Unless explicitly indicated differently, GESIS makes data and documents available only for scientific analysis carried out in a project limited to a specific time period in academic research and teaching. Any processing or usage for other purposes requires advance written agreement with GESIS." — [GESIS Usage regulations PDF](https://www.gesis.org/fileadmin/upload/Datenservices/Nutzungsbedingungen/2023-06-30_Usage_regulations.pdf)
- GESIS has since revised its access categories. "Scientific use" replaces "academic research and teaching". Commercial use is permitted only for a portion of data in an open-access class, and "still not permitted for most of the data". The new categories are "being gradually implemented". — [GESIS news: new access categories](https://www.gesis.org/en/gesis-news/article/gesis-has-new-access-categories-and-terms-of-use-for-research-data) (search snippet; 403 on fetch); [GESIS data access page](https://www.gesis.org/en/data-services/about-the-data-services/standards-and-workflows-data-services/data-access-access)
- A GESIS data use agreement states that "processing and/or usage for commercial purposes are expressly prohibited" (search snippet; this applies to that agreement type). — [GESIS Data Use Agreement](https://www.gesis.org/fileadmin/upload/dienstleistung/daten/secure_data_center/GESIS_Data_Use_Agreement_Off-Site.pdf)

### Inferences
- EVS and WVS give Greek values items (religion, family, work, politics, trust, Inglehart-Welzel dimensions) that are useful as validation targets. Commercial use is not permitted by default, and redistributing derived microdata is barred by WVS.
- Publishing aggregate marginals from WVS or EVS inside a commercial product sits in a grey zone. WVS forbids redistributing the "data files", not results, but "non-profit purposes" covers the use itself.

### Gaps
- GESIS pages could not be fetched (HTTP 403). The exact current access category for ZA7500, ZA7505 and ZA7546 under the new GESIS scheme is unverified, and so is whether any of them falls into the open-access class.
- The EVS 2017 Greece N is unresolved (1,200 design target vs a 3,892 snippet). There is no confirmed info on an EVS 2026 (6th wave) Greek fieldwork or a WVS Wave 8 Greek survey.

## ISSP (International Social Survey Programme)

### Takeaway
Greece is a current ISSP member. Its member institution is the School of Political Sciences, Aristotle University of Thessaloniki, the ELNES team. Greek ISSP data, e.g. ISSP 2021 Health and Health Care (Greece), are archived at GESIS under GESIS terms, so they are non-commercial by default.

### Cited Findings
- Greece appears on the ISSP "member countries 2024" map, which links to issp.org/member-states/greece/ (checked live). — [ISSP member states](https://issp.org/members/member-states/)
- The Greek member page names the "School of Political Sciences, Aristotle University of Thessaloniki". It says the ELNES researchers have been collecting voter and candidate data since 2007 and cooperate with the VAA HelpMeVote. — [ISSP Greece](https://issp.org/member-states/greece/)
- The GESIS knowledge graph lists "ISSP 2021 (Greece)" (Health and Health Care), with Ioannis Andreadis as PI. — [data.gesis.org ZA8784 (search snippet)](https://data.gesis.org/gesiskg/resource/ZA8784)

### Inferences
- ISSP modules (role of government, social inequality, environment, national identity, health, work orientations, religion, family/gender) would be strong Greek validation targets. Access and licence follow GESIS rules: scientific use, with written agreement for other purposes.

### Gaps
- Full list of modules and years with Greek data not retrieved (the issp.org per-year data pages and GESIS ZACAT were not reachable). Greek N per module unverified.

## Eurobarometer (Standard, Special, Flash)

### Takeaway
This is the clearest legally reusable source. The aggregated Eurobarometer result tables (Volume A, AA, AP, B and others, in xlsx) are catalogued on data.europa.eu under the "European Commission reuse notice" (Decision 2011/833/EU), which permits commercial reuse with acknowledgement. They can be found and downloaded programmatically with no login. Respondent-level microdata are only via GESIS under scientific-use terms, so they are non-commercial by default.

### Cited Findings
- **data.europa.eu search API (live, 2026-10-27):** `https://data.europa.eu/api/hub/search/search?q=eurobarometer&filter=dataset` returned 1,175 datasets. Standard EB 99 (Spring 2023, publisher DG Communication) has distributions such as "Eurobarometer_Standard_99_Spring 2023_volume_A.xlsx" and volumes AA, AP, AAP, B, BP, plus Volume C/D zips. Each carries licence `{"id":"COM_REUSE","label":"European Commission reuse notice","resource":"http://data.europa.eu/eli/dec/2011/833/oj"}`. — [data.europa.eu dataset s3052_99_4_std99_eng](https://data.europa.eu/data/datasets/s3052_99_4_std99_eng) (API: https://data.europa.eu/api/hub/search/datasets/s3052_99_4_std99_eng)
- **Latest Standard EB found:** "Standard Eurobarometer 104 – Autumn 2025", issued 2025-12-11 (dataset id s3378_104_1_std104_eng). It has volumes A, AA, AP, AAP, B, BP (xlsx) and Volume C per-country zips (e.g. "volumes C_AT-HR", which would include EL). All carry the "European Commission reuse notice". — [data.europa.eu s3378_104_1_std104_eng](https://data.europa.eu/data/datasets/s3378_104_1_std104_eng)
- **Direct download without login (HEAD, live):** `https://webgate.ec.europa.eu/ebsm/api/public/odp/download?key=0CCD7D6A9EDFF30E68F80A00649E91B6` returned HTTP 200, `Content-Disposition: attachment; filename="Eurobarometer_Standard_99_Spring 2023_volume_A.xlsx"`, an xlsx content type. — [data.europa.eu](https://data.europa.eu/data/datasets/s3052_99_4_std99_eng)
- A Parlemeter dataset published by the European Parliament is under "Creative Commons Attribution 4.0 International" (from the same API query). — [data.europa.eu s2396_78_2_null_eng](https://data.europa.eu/data/datasets/s2396_78_2_null_eng)
- **data.europa.eu copyright notice:** "reuse of the editorial content on this website owned by the EU is authorized under CC BY 4.0"; non-EU-owned content may need permission from rightholders. — [data.europa.eu copyright notice](https://data.europa.eu/en/copyright-notice). Decision 2011/833/EU on reuse of Commission documents. — [EUR-Lex 32011D0833](https://eur-lex.europa.eu/legal-content/en/ALL/?uri=CELEX%3A32011D0833). The Decision excludes documents where the Commission "is not in a position to allow their reuse in view of intellectual property rights of third parties" (search snippet). The article text could not be fetched (eur-lex bot challenge). Its general principle that documents are reusable "for commercial or non-commercial purposes", subject to acknowledgement and no distortion, is therefore from the Decision's known content and was not re-verified this session.
- **Conflict:** the re3data record for Eurobarometer quotes a report notice: "Reproduction is authorised, except for commercial purposes, provided the source is acknowledged". This appears in older printed Eurobarometer reports. — [re3data Eurobarometer](https://www.re3data.org/repository/r3d100011725). The current data.europa.eu metadata for the xlsx volumes cites the Commission reuse notice (Decision 2011/833/EU) instead. — [data.europa.eu](https://data.europa.eu/data/datasets/s3378_104_1_std104_eng)
- **Microdata (GESIS):** "the European Commission grants access to Eurobarometer primary data for re-use in social science research and training". Questionnaires are "reproduced with the licence granted by the European Commission, DG Communication". GESIS general usage regulations apply. — [GESIS Eurobarometer Data Service](https://www.gesis.org/en/eurobarometer-data-service/data-and-documentation) (search snippets). GESIS Eurobarometer dataset pages state "Data and documents are released for academic research and teaching". — [data.gesis.org (search snippet)](https://data.gesis.org/datasearchkg/Dataset/10.4232/1.2689)
- **Recent GESIS EB studies:** EB 103.3 = ZA9128 (fieldwork 26 Mar to 22 Apr 2025, Verian; "archive pre-release v1.0.0" as of 2026-06-16); EB 103.4 = ZA9129; EB 104.1 = ZA9130 (Oct-Nov 2025, pre-release); EB 103.2 = ZA9127. — [GESIS EB Data Service listings (search snippets)](https://www.gesis.org/en/eurobarometer-data-service/data-and-documentation/standard-special-eb)
- Community tooling exists for GESIS EB microdata (R: `eurobarometer`, `retroharmonize`, `gesisdata`). The `gesisdata` vignette notes GESIS terms forbid passing downloaded data to third parties. — [gesisdata vignette](https://fsolt.org/gesisdata/articles/gesisdata-vignette.html); [retroharmonize](https://retroharmonize.dataobservatory.eu/articles/eurobarometer.html)

### Inferences
- For a commercial Greek lab, Eurobarometer volume tables are the backbone validation set. They give Greek marginals, often broken down by sociodemographics in Volume C country tables, for trust in institutions, the economic situation, EU image, top concerns, media use, climate and consumer topics, every six months. They are legally reusable with attribution, machine-readable (xlsx), and discoverable through the data.europa.eu REST API without a key.
- Respondent-level validation (joint distributions) would need GESIS microdata, which is non-commercial. Synthetic respondents could be calibrated commercially only to published cross-tabs.
- The europa.eu/eurobarometer site is a JS app with an internal "ebsm" API (`webgate.ec.europa.eu/ebsm/api/public/...`). The documented, stable route is data.europa.eu.

### Gaps
- Greek N per wave (~1,000 face-to-face) not verified this session. Volume A was not downloaded, by instruction.
- Whether Special and Flash EB volumes are all on data.europa.eu with the same COM_REUSE licence was not checked individually. The search API sorted by date returned noise for "105" and "2026" queries, so Standard EB 105 (Spring 2026) availability is unverified.
- Current GESIS access category for EB microdata under the revised scheme unverified (403).

## Pew Research Center Global Attitudes

### Takeaway
Greece is in Pew's Spring 2025 and Spring 2026 Global Attitudes waves, by telephone since 2021. Pew grants a royalty-free but non-exclusive, revocable, excerpt-only dataset licence and forbids scraping. Commercial use is not explicitly barred, but full redistribution is, so it is unclear for productisation.

### Cited Findings
- The Spring 2026 topline ("US image 2026", June 2026) and the Spring 2025 topline (Russia/NATO) both include Greece rows, e.g. "Greece Spring, 2026 …". They note: "Since 2021, the Greece survey has been conducted by telephone; all prior surveys in Greece were conducted face-to-face." — [Pew topline US image 2026 (PDF)](https://www.pewresearch.org/wp-content/uploads/sites/20/2026/06/pg_2026.06.23_us-image-2026_topline.pdf); [Pew topline Russia/NATO 2025 (PDF)](https://www.pewresearch.org/wp-content/uploads/sites/20/2025/06/pg_2025.06.23_global-views-russia-nato_topline.pdf)
- **T&C §13 datasets:** a "nonexclusive, non-sublicensable, non-transferable, revocable, worldwide, and royalty-free license". Use is limited to excerpts, with no publication "in full or substantially in full". Required disclaimer: "Pew Research Center bears no responsibility for the analyses or interpretations of the data presented here." American Trends Panel data have separate terms. §3 bans "unauthorized spidering, 'scraping,' or harvesting". §14 bans re-identification. — [Pew Terms and Conditions](https://www.pewresearch.org/about/terms-and-conditions/)
- Fieldwork is run by Gallup, Langer Research Associates and the Social Research Centre (mixed mode). — [Pew methodology 2025](https://www.pewresearch.org/global/2025/06/11/methodology-us-image-2025/)

### Inferences
- Pew Greek toplines (PDF) are useful external validation points for international attitudes. Using them commercially as excerpts with attribution seems compatible with the T&C. Ingesting full datasets into a product is risky.

### Gaps
- Greek N per wave (likely ~1,000) not verified. The international methods database was not fetched. Dataset download registration not verified this session. Pew releases global datasets with a lag, and the latest Greek dataset available is unverified.

## OECD (PISA, PIAAC, How's Life)

### Takeaway
OECD content published from 1 July 2024 defaults to CC BY 4.0, and older content is available "for commercial and non-commercial purposes" on terms similar to CC BY. That makes OECD aggregates commercially reusable with attribution. Greece is in PISA (2000 to 2022; 2022 sample 6,578 students, 242 schools) and PIAAC Cycle 1 Round 2 (results June 2016). It is likely absent from PIAAC Cycle 2 (2023).

### Cited Findings
- The OECD open-by-default policy says content published from 1 July 2024 is generally under CC licences, default CC BY 4.0. Older content is "generally available for commercial and non-commercial purposes on terms similar to CC BY 4.0". The licence does not apply to third-party material. — [OECD Open by default policy](https://oecd.org/en/about/oecd-open-by-default-policy.html); [OECD press release July 2024](https://www.oecd.org/en/about/news/press-releases/2024/07/oecd-data-publications-and-analysis-become-freely-accessible.html)
- PISA 2022 Greece: 6,578 students from 242 schools (Greek press). Greece first took part in 2000. — [To Vima](https://www.tovima.com/society/pisa-2022-rankings-greek-students-plummet-in-maths-science/amp/); [OECD Greece country note](https://www.oecd.org/en/publications/pisa-2022-results-volume-i-and-ii-country-notes_ed6fbcc5-en/greece_a24e696b-en.html)
- PIAAC: Greece was in the second round of Cycle 1, with results released June 2016. — [Greek Ministry of Education](https://minedu.gov.gr/news-in-english-all/21950-29-06-16-oecd-survey-of-adult-skills-on-greece-released); [Cedefop](https://www.cedefop.europa.eu/en/node/9051). Cycle 2 participation is ambiguous in the NCES table. — [NCES PIAAC countries](https://nces.ed.gov/surveys/piaac/countries.asp)

### Inferences
- OECD is mainly a source of contextual and aggregate benchmarks (skills, wellbeing, How's Life indicators), not opinion microdata. It is low legal risk for commercial use.

### Gaps
- Specific terms for PISA and PIAAC public-use microdata (whether CC BY 4.0 applies to data files) unverified; oecd.org returned 403. PIAAC Cycle 2 Greek non-participation not confirmed.

## Eurofound (EQLS, EWCS, EWCTS, Living/working and COVID-19 e-survey)

### Takeaway
Eurofound microdata (including the EQLS integrated file 2003-2016, EU27 including Greece) are deposited at the UK Data Service. They are free for non-commercial use, and commercial requests are forwarded to Eurofound for authorisation.

### Cited Findings
- Eurofound survey datasets are held by the UK Data Service and are free for non-commercial use. Commercial-use requests are forwarded to Eurofound. Users register with UKDS. — [Eurofound data availability](https://www.eurofound.europa.eu:443/surveys/about-eurofound-surveys/data-availability) (search snippet; the direct fetch got HTTP 429); [Eurofound node 677](https://www.eurofound.europa.eu/node/677)
- The latest EQLS release is the Integrated Data File 2003-2016. The 2003-2012 combined file is SN 7348 under the UKDS End User Licence. An open-access 2007/2011 subset has 195 variables and about 80,000 cases. — [data.gov.uk EQLS](https://www.data.gov.uk/dataset/28df9224-6d58-453f-9820-565fe444908a/european-quality-of-life-survey1); [B2FIND EQLS open access](https://b2find.eudat.eu/dataset/765a0730-f633-58ab-a8f3-617f90aeffc0)

### Inferences
- The EQLS open-access teaching subset (UKDS Open licence is typical) might be usable more freely, but its licence was not verified. Eurofound publications and online data visualisations generally fall under the EU reuse policy (unverified this session).

### Gaps
- Greek N per EQLS wave; the Living, working and COVID-19 e-survey licence and Greek N (a non-probability e-survey); and Eurofound's legal notice (HTTP 429) are all unverified.

## SHARE (Survey of Health, Ageing and Retirement in Europe)

### Takeaway
Greece is in SHARE, including Wave 9 (2021-22, fieldwork by Kapa Research). SHARE Conditions of Use restrict data to "scientific purposes only" and say "any use for commercial purposes is expressly excluded". This rules it out for a commercial product.

### Cited Findings
- **Conditions of Use (verbatim):** "the SHARE data may be used for scientific purposes only"; "any use for commercial purposes is expressly excluded"; "Users are not allowed to make copies of the data available to others and/or enable any third party access to the database." — [SHARE Conditions of Use](https://share-eric.eu/data/data-access/conditions-of-use)
- Access is "free of charge for scientific use globally", granted "on an individual basis via the user registration procedure". — [SHARE data access](https://share-eric.eu/data/data-access)
- Wave 9 (2021-2022) covers 28 countries including Greece. — [SHARE waves overview](https://share-eric.eu/data/data-documentation/waves-overview). Greek fieldwork was by Kapa Research. — [Kapa Research](https://www.kaparesearch.com/?p=2990)

### Gaps
- List of Greek waves (Greece was in early waves and skipped some) and Greek N not verified. The Wave 9 methodology volume was not fetched.

## EU-SILC / EU-LFS microdata (Eurostat)

### Takeaway
Scientific-use microdata are granted only to recognised research entities under Regulation (EU) 557/2013, project by project. Public-use files exist with reduced detail. Eurostat aggregate statistics are reusable commercially with attribution.

### Cited Findings
- Access is under Regulation (EU) No 557/2013, and "only organisations recognized as research entities are granted access"; each project is assessed individually. — [CESSDA DMEG: Microdata at Eurostat (EU-SILC)](https://dmeg.cessda.eu/content/download/4375/49208/file/microdata%20at%20eurostat%20-%20eusilc.pdf)
- EU-SILC and EU-LFS public-use files, derived from SUFs, are openly available. — [EUI Eurostat public use guide](https://eui.eu/Research/Library/ResearchGuides/Economics/Statistics/DataPortal/EurostatPublicUse)
- Eurostat policy allows reuse of statistical data "for commercial or non-commercial purposes" with attribution. — [Eurostat copyright notice](https://ec.europa.eu/eurostat/help/copyright-notice) (search snippet)

### Gaps
- PUF licence terms (commercial?) and whether Greece is in the PUF set unverified.

## Gallup World Poll; CSES; consumer-specific Eurobarometers

### Takeaway
Gallup World Poll is a paid commercial licence, with about 1,000 respondents per country typically. It is legally the cleanest commercial microdata route but costs money. CSES (Greece via ELNES) is political and was not researched. Special Eurobarometers on consumer topics fall under the same data.europa.eu COM_REUSE regime as other EB volumes (not individually verified).

### Cited Findings
- Gallup "typically surveys 1,000 individuals in each country or area". Country sample sizes are in the "Country Dataset Details" file. — [Gallup World Poll methodology](https://news.gallup.com/file/poll/165404/World_Poll_Methodology_112219.pdf); [Gallup Country Data Set Details](https://www.gallup.com/services/177797/country-data-set-details.aspx)
- A "Gallup World Poll Data License" is sold on AWS Marketplace. — [AWS Marketplace](https://aws.amazon.com/marketplace/pp/prodview-uapupqnfizgci)

### Gaps
- Greek Gallup N, pricing and commercial licence clauses unverified. CSES Greek modules and licence not researched (political; likely excluded). Consumer-focused Special and Flash EB titles for Greece not enumerated.

---
### Overall inferences for a commercial Greek synthetic-research lab
- **Commercially usable now (with attribution):** Eurobarometer aggregated volumes on data.europa.eu (COM_REUSE / Decision 2011/833/EU; API and direct xlsx, no login); OECD aggregates (CC BY 4.0 from 1 Jul 2024); Eurostat aggregates; ESS documentation and questionnaires (CC BY-SA 4.0, share-alike).
- **Non-commercial only without separate permission:** ESS microdata (CC BY-NC-SA 4.0); WVS ("non-profit purposes"); EVS, ISSP and Eurobarometer microdata via GESIS (scientific use; written agreement for other purposes); Eurofound microdata (non-commercial; Eurofound authorises commercial use); SHARE (commercial "expressly excluded"); Eurostat SUFs (research entities only).
- **Unclear:** Pew datasets (royalty-free, excerpt-only, revocable).
- **Paid commercial:** Gallup World Poll.
- A practical design: calibrate and validate synthetic Greek respondents against Eurobarometer Greek marginals and cross-tabs, which are commercially reusable. Use ESS, EVS, WVS and ISSP microdata only in a separately labelled non-commercial research or validation track, or after obtaining written permission (ESS ERIC: essdatasupport@sikt.no; GESIS Eurobarometer Data Service; WVSA).
