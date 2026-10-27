# Greek social-science data archives, research institutes and think tanks: survey data about Greek society and whether it can be reused (as of 27 Oct 2026)

Method note: most counts below come from direct calls to the CESSDA Data Catalogue API and the data.gov.gr CKAN API, run on 2026-10-27. The calls and their results are described inline. The SoDaNet Dataverse API could not be reached by script because it sits behind a Cloudflare "Just a moment..." JavaScript challenge. Items marked **[UNVERIFIED]** could not be confirmed from a primary source within the research budget.

## Q1. SoDaNet (So.Da.Net / Greek Research Infrastructure for Social Science, EKKE-led): holdings, access, licences, formats, API

### Takeaway
SoDaNet's catalogue is a Dataverse instance at datacatalogue.sodanet.gr (DOI prefix 10.17903). It has about 621 Greek-language study records, and roughly 35% of those are Greek Eurobarometer files. The rest is mostly small academic studies, the Greek ESS rounds 1, 2, 4 and 5, WVS-7 Greece, and some COVID-era values surveys. Access conditions are not stated in machine-readable form (every record is "Uncategorized" in CESSDA), and the access model is "open or registration/request". I found no blanket open licence. Treat the holdings as academic or registration-gated with a per-study check, not as commercially reusable by default.

### Cited Findings
- SoDaNet lists eight categories of data projects: Quantitative Studies, Qualitative Studies, Mixed Studies, Cubes, Indices & Classifications, Metadata of Statistical Surveys, Corpora, and Replication Data for Quantitative Analysis. — [SoDaNet catalogue landing](https://datacatalogue.sodanet.gr); [sodanet.gr data catalogue page](https://sodanet.gr/data/data-catalogue)
- EKKE's user-observatory report says the catalogue "hosts over 600 data projects". Resources are made available "either as open access or through a connection (either directly or after a proper request)". For access via a connection, "the user registers through a relevant form, allowing their profile to be identified." — [EKKE: User observatory of the SoDaNet data catalogue](https://www.ekke.gr/en/research/dimosieuseis/paratiritirio-christon-tou-katalogou-dedomenon-tis-ereunitikis-ipodomis-sodanet)
- The governing document is "Regulations of the Greek Research Infrastructure So.Da.Net_GR". It covers user obligations and access terms, digital content and personal-data protection. It was added to the CESSDA Resource Directory on 2022-09-20 and last modified on 2024-12-26. I could not retrieve its full text. — [CESSDA Resource Directory entry](https://www.cessda.eu/Resource-Directory/Resource-crdr-4429?page=10)
- **Platform is Dataverse.** Study DOIs use prefix `10.17903/FK2/...`, where FK2 is the default Dataverse shoulder. They resolve (HTTP 302) to `https://datacatalogue.sodanet.gr/citation?persistentId=doi:...`, which is the Dataverse URL pattern. Direct calls to `/api/info/version`, `/api/search` and `/api/datasets/:persistentId` all returned a Cloudflare JS challenge page instead of JSON (tested 2026-10-27). In principle the standard Dataverse native and search APIs exist, but they are not usable for unattended scripts unless SoDaNet allow-lists the client. — test via [doi.org/10.17903/FK2/ZZYHL6](https://doi.org/10.17903/FK2/ZZYHL6)
- **CESSDA harvest of SoDaNet:** the CESSDA API returns 621 records with `metadataLanguage=el`, all with publisher "SoDaNet Greek Research Infrastructure for Social Science", and 128 SoDaNet records with `metadataLanguage=en` (`publishers=` filter). All 621 Greek-language SoDaNet records have `dataAccess = "Uncategorized"` and empty `dataAccessFreeTexts`, so access conditions cannot be filtered or inferred from the catalogue metadata. — [CESSDA Data Catalogue API](https://datacatalogue.cessda.eu/api/DataSets/v2/search?metadataLanguage=el&limit=200)
- **Composition of the 621 Greek-language records** (my analysis of the API dump):
  - 219 are Eurobarometer or Flash Eurobarometer Greek files.
  - Collection decade: 1980s: 24, 1990s: 45, 2000s: 163, 2010s: 137, 2020s: 16. 236 records have no year.
  - Most frequent creators: A. Papakostas (55), Ch. Koulouri (44), Reif (Eurobarometer, 32), V. Georgiadou (28), R. van Boeschoten (16), Christensen (15), Welzel (WVS, 15), G. Tsirbas (14), N. Demertzis (12).
  - Collection modes: Interview 166, Face-to-face 142, Telephone 44, CATI 19, PAPI 16.
  - Many records are qualitative oral histories.
  - Source: [CESSDA API](https://datacatalogue.cessda.eu/api/DataSets/v2/search?metadataLanguage=el&limit=200)
- **Example deposits relevant to attitudes, values and social conditions** (titles and DOIs from the CESSDA API):
  - European Social Survey Greece, Round 1 (2003): [10.17903/FK2/ZZYHL6](https://doi.org/10.17903/FK2/ZZYHL6)
  - European Social Survey Greece, Round 2 (2005): [10.17903/FK2/VHJD9I](https://doi.org/10.17903/FK2/VHJD9I)
  - European Social Survey Greece, Round 4 (2009): [10.17903/FK2/54SCB8](https://doi.org/10.17903/FK2/54SCB8)
  - European Social Survey Greece, Round 5 (2011): [10.17903/FK2/YJ9ZUC](https://doi.org/10.17903/FK2/YJ9ZUC)
  - Ελληνική Εκδοχή του 7ου Γύρου της Παγκόσμιας Έρευνας Αξιών (Greek version of World Values Survey 7), 2017. DOI is under 10.17903/FK2 but was truncated in my output.
  - Αξίες στην κρίση της πανδημίας Covid-19 (πρώτο κύμα) / Values in the Covid-19 pandemic crisis (first wave), 2020: [10.17903/FK2/1EWKVT](https://doi.org/10.17903/FK2/1EWKVT)
  - Ριζοσπαστισμός και νεολαία στην Ελλάδα της κρίσης / Radicalism and youth in crisis Greece, 2016: [10.17903/FK2/EMVV0Z](https://doi.org/10.17903/FK2/EMVV0Z)
  - Ενσωμάτωση της δεύτερης γενιάς μεταναστών / Integration of second-generation migrants, 2011: [10.17903/FK2/JOXXZS](https://doi.org/10.17903/FK2/JOXXZS)
  - Γυναικεία μετανάστευση στην Ελλάδα / Female migration in Greece, 2011: [10.17903/FK2/2XKYWS](https://doi.org/10.17903/FK2/2XKYWS)
  - Ευάλωτες Κοινωνικά Ομάδες και διακρίσεις στην αγορά εργασίας / Socially vulnerable groups and labour-market discrimination, 2011: [10.17903/FK2/4G8QMR](https://doi.org/10.17903/FK2/4G8QMR)
  - Κοινωνικοοικονομικές αλλαγές και συνθήκες εργασίας / Socio-economic change and working conditions, 2011: [10.17903/FK2/1ZAK3Q](https://doi.org/10.17903/FK2/1ZAK3Q)
  - Συλλογική δράση και διαμαρτυρία στην Ελλάδα της κρίσης 2009–2013 / Collective action and protest in crisis Greece: [10.17903/FK2/FHQKEU](https://doi.org/10.17903/FK2/FHQKEU)
  - Ενέργεια και Τοπικές Κοινωνίες / Energy and local communities, 2016: [10.17903/FK2/KGOQ7J](https://doi.org/10.17903/FK2/KGOQ7J)
  - Οικιακή εργασία / Domestic work, 1996: [10.17903/FK2/C1IBVG](https://doi.org/10.17903/FK2/C1IBVG)
  - Έμφυλες διαστάσεις της μετανάστευσης από ΝΑ Ευρώπη / Gender dimensions of migration from SE Europe, 2004: [10.17903/FK2/S0LV2R](https://doi.org/10.17903/FK2/S0LV2R)
  - Σχέσεις εργασίας–οικογένειας και ευημερία / Work–family relations and wellbeing, 2004: [10.17903/FK2/1WS13Z](https://doi.org/10.17903/FK2/1WS13Z)
  - A distributive-policy social experiment, 2016, and a "Πανελλαδική έρευνα πολιτικών εξελίξεων" (national political-developments survey) from January 2015, which is political.
- Example of record metadata quality: the EKPA postgraduate-alumni survey (2016–17) shows `typeOfSamplingProcedures = Non-probability: Availability` and mode "Self-administered questionnaire: E-mail". Many deposits are small non-probability academic samples. — [CESSDA record doi:10.17903/FK2/09WVTC](https://doi.org/10.17903/FK2/09WVTC)

### Inferences
- Most of the value for a product is in the national-probability items: ESS Greece rounds, WVS-7 Greece and Eurobarometer. These are also available from their international owners (ESS ERIC, WVSA, GESIS), each under its own licence. The ESS licence is non-commercial (see Q6), and the Eurobarometer GESIS terms are typically academic. The Greek-only SoDaNet deposits are mostly small or non-probability samples. They suit topic-specific priors but are not suitable for population validation.
- With no stated open licence, any commercial use would need written permission from SoDaNet/EKKE and, for deposited studies, from the depositor.

### Gaps
- Exact text of the So.Da.Net_GR Regulations and per-study "Terms of Use"/licence fields (Dataverse `termsOfUse`/`license`) not retrieved: the API is Cloudflare-blocked and the regulations PDF was not fetched.
- Whether SoDaNet holds the "Hellenic Panel", EKKE panel surveys or Greek ESS rounds 9–11: **[UNVERIFIED]**. They did not appear in my keyword-filtered title scan.
- File formats (SPSS/Stata/CSV) per study not confirmed.

## Q2. EKKE (National Centre for Social Research): national surveys, data portals, access

### Takeaway
EKKE runs SoDaNet, Socioscope ("Ανοικτά Κοινωνικά Δεδομένα", open social data), the Panorama of Census Data (with ELSTAT; censuses 1991/2001/2011) and Surveys Hub, which is a fieldwork facility and not a data archive. It is the Greek ESS national team, including Round 12 fieldwork. Census aggregates are the most reusable output. Survey microdata goes through SoDaNet or ESS.

### Cited Findings
- EKKE lists these data infrastructures: EKKE Data Repository, Panorama of Census Data, Socioscope and Surveys Hub. It also lists online atlases: Athens Social Atlas and Thessaloniki Social Atlas. — [EKKE ESS12 project page (site nav)](https://www.ekke.gr/en/research/project/ereuna-pediou-gia-ton-12o-giro-tis-europaikis-kinonikis-ereunas-stin-ellada)
- The Panorama of Census Data was developed by an EKKE team in collaboration with ELSTAT for mapping the last three censuses (1991, 2001, 2011). — [EKKE Panorama](https://www.ekke.gr/en/services/census-data); [gov.gr service page](https://www.gov.gr/en/upourgeia/upourgeio-anaptuxes/ethniko-kentro-koinonikon-ereunon/panorama-apographikon-dedomenon-ethnikou-kentrou-koinonikon-ereunon-ekke)
- EKKE is conducting fieldwork for ESS Round 12 in Greece. According to a search summary of that page, the ESS data will be made openly available. — [EKKE ESS12 project](https://www.ekke.gr/en/research/project/ereuna-pediou-gia-ton-12o-giro-tis-europaikis-kinonikis-ereunas-stin-ellada)
- Surveys Hub is "η ολοκληρωμένη ψηφιακή ερευνητική υποδομή του ΕΚΚΕ" ("EKKE's integrated digital research infrastructure"). It offers telephone, web and face-to-face surveys to EKKE researchers "αλλά και σε τρίτους" ("and also to third parties"). It has sampling frames, CAPI/CATI/CAWI software, ELSTAT building-block maps, 15 CATI seats, 50+ face-to-face interviewers and "Διαδικτυακό πάνελ" (an online panel). It is a fieldwork service, not a data download. — [Surveys Hub](https://surveyshub.ekke.gr)
- socioscope.gr ("Socioscope – Ανοικτά Κοινωνικά Δεδομένα") is a JavaScript single-page app, and no content could be retrieved without JS. — [socioscope.gr](https://socioscope.gr)

### Inferences
- Commissioning EKKE Surveys Hub, which serves third parties, is a possible legal route to *own* fresh Greek probability-sample data for validation. It would cost money, but the product would own the IP.

### Gaps
- Socioscope's dataset list, licence and API: **[UNVERIFIED]** (needs a JS-rendered visit).
- "Κοινωνικό Πορτραίτο" (Social Portrait) as an EKKE portal: no evidence found. **[UNVERIFIED / possibly non-existent]**.
- Licence of Panorama census tables: not found. ELSTAT census data are normally free to reuse with attribution, but I did not verify that here.

## Q3. diaNEOsis "Τι πιστεύουν οι Έλληνες" (What Greeks Believe)

### Takeaway
This is the most directly useful Greek attitude survey. The 2024 wave (7th) by Metron Analysis, N>1,000 nationwide, has downloadable **SPSS microdata (.SAV, zipped), XLSX tables and DOCX questionnaires** on dianeosis.org. The site footer says "All rights reserved", and I found no explicit open licence for the data. It is fine for internal validation, but commercial redistribution needs permission.

### Cited Findings
- The research page links results for 2016, 2017, 2018, 2020 and 2022, and calls 2024 the "έβδομο κύμα" (seventh wave). The 2024 wave: nationwide, "άνω των 1.000 ατόμων" (over 1,000 people), Metron Analysis, Jan–Feb 2024, published in three parts in April–May 2024. — [diaNEOsis: Τι πιστεύουν οι Έλληνες](https://www.dianeosis.org/research/ti-pistevoun-oi-ellines/)
- Topics:
  - Part A: climate change, technology, religion, institutions, women, same-sex couples, core values and ideology.
  - Part B: emotions, EU, state of the world, migration.
  - Part C: ideologies and values, economy and politics, public administration, health, labour and **daily habits**.
  - Source: [diaNEOsis TPE page](https://www.dianeosis.org/research/ti-pistevoun-oi-ellines/); see also [Brochure TPE24 Part C](https://www.dianeosis.org/wp-content/uploads/2024/05/Brochure_TPE24_Part-C.pdf)
- Direct file links found on the page:
  - [Questionnaire_TPE_2024_Part_A.docx](https://www.dianeosis.org/wp-content/uploads/2024/04/Questionnaire_TPE_2024_Part_A.docx)
  - [TPE_2024_Part_A.xlsx](https://www.dianeosis.org/wp-content/uploads/2024/04/TPE_2024_Part_A.xlsx)
  - [data_part1_w.zip](https://www.dianeosis.org/wp-content/uploads/2024/04/data_part1_w.zip)
  - [data_part2_w-fix.zip](https://www.dianeosis.org/wp-content/uploads/2024/05/data_part2_w-fix.zip)
  - [TPE24_Part_C_DATA.SAV.zip](https://www.dianeosis.org/wp-content/uploads/2024/05/TPE24_Part_C_DATA.SAV.zip)
  - [TPE24_Part_C_Tables.xlsx](https://www.dianeosis.org/wp-content/uploads/2024/05/TPE24_Part_C_Tables.xlsx)
  - [Questionnaire_TPE24_Part_C.docx](https://www.dianeosis.org/wp-content/uploads/2024/05/Questionnaire_TPE24_Part_C.docx)
  - The "_w" suffix suggests weighted microdata (inference).
- Footer: "© 2026 Dianeosis. All rights reserved." The English "Terms of Use and Privacy Policy" page is essentially a GDPR privacy policy ("The present Privacy Policy... concerns the conditions for the collection, storage and use of your personal data"), and I found no data-licence clause in it. — [diaNEOsis Terms of Use (EN)](https://www.dianeosis.org/en/terms-of-use/)
- diaNEOsis also has a "Data" / "Δείκτες" / "Charts" section. The Data page (dated June 2021) rendered without retrievable content. — [diaNEOsis Data](https://www.dianeosis.org/data/)
- Other 2026 diaNEOsis outputs include "Ψηφιακή Ενημέρωση και Παραπληροφόρηση στην Ελλάδα" (June 2026, digital news and disinformation) and an essay on AI attitudes (March 2026). — [diaNEOsis site listing](https://www.dianeosis.org/data/); [AI essay PDF](https://www.dianeosis.org/wp-content/uploads/2026/03/AI_VOGIATZIS_essay.pdf)
- The survey has run since 2015, and a search snippet says it is biennial. There was also a "Togetherness" survey publication in 2024. — [diaNEOsis Togetherness PDF](https://www.dianeosis.org/wp-content/uploads/2024/09/Togetherness_entypo_2709.pdf); [Protothema coverage](https://www.protothema.gr/politics/article/1498873/ereuna/)

### Inferences
- The SAV files give real Greek respondent-level values and attitudes with weights. That makes them excellent for validating synthetic respondents and for joint-distribution priors, such as values × age × region.
- Legal position: the files are publicly downloadable but carry no licence and "all rights reserved". Downloading for internal analysis is defensible, but shipping the microdata or derived per-respondent records in a product needs written permission. Publishing aggregate facts with citation is generally low-risk. I recommend emailing diaNEOsis for a reuse licence.

### Gaps
- Whether a 2025 or 2026 wave exists: none found as of Oct 2026. The biennial pattern suggests one in 2026, **[UNVERIFIED]**.
- Whether pre-2024 waves have SAV downloads: not checked.
- Exact sample N and mode for 2024: the page says only ">1,000".

## Q4. Other institutes and think tanks: ELIAMEP, KEPE, IOBE, INE-GSEE/KANEP, ENA, Eteron, Kapa Research, Metron Analysis / Prorata / aboutpeople, Generation 2.0

### Takeaway
Apart from diaNEOsis, Greek think-tank and pollster social surveys are published almost entirely as **PDF reports or press slides**, with no microdata and no licence. Eteron runs a steady stream of topical surveys (youth precarity, Gen Z, mental health, economic fairness, overtourism, AI, gender divide). IOBE is the Greek partner for the EU harmonised consumer survey, whose aggregates are reusable through the European Commission.

### Cited Findings
- **Eteron (Institute for Research and Social Change)** lists these survey projects on its homepage:
  - "Οικονομική Δικαιοσύνη | Είναι η Ελλάδα μια άδικη χώρα;" (Economic fairness: is Greece an unfair country?)
  - "Νέα έρευνα για την Ψυχική Υγεία" (new mental-health survey, 09.07.2026)
  - "Rap & GenZ"
  - "Ακτινογραφία των Ψηφοφόρων: Ιδεολογίες, Αξίες, Τοποθετήσεις" (X-ray of voters: ideologies, values, positions)
  - "Από την Τεχνητή στη Συλλογική Νοημοσύνη" (From artificial to collective intelligence, on AI)
  - "Έχει υπερτουρισμό η Ελλάδα; Staycation Nation" (Does Greece have overtourism?)
  - "Eteron x King's College | Gender Divide"
  - "50 χρόνια Δημοκρατία" (50 years of democracy)
  - "Η εργασιακή επισφάλεια των νέων – Youth Precarity" (youth job precarity)
  - "Δημογραφικό στην Στερεά Ελλάδα" (demographics in Central Greece)
  - "Ακτινογραφία της Ακροδεξιάς" (X-ray of the far right)
  - Views on the Palestine and Ukraine wars
  - "Η νέα γενιά μετά τα Τέμπη – Youth Voice On" (the new generation after Tempi)
  - "Mind the Roof" (housing, 03.03.2026)
  - Source: [eteron.org](https://eteron.org/)
- **IOBE / Consumer surveys:** **[UNVERIFIED in this session]**. IOBE is understood to be the Greek partner of the EU Business & Consumer Surveys, and DG ECFIN publishes harmonised consumer-confidence aggregates. I did not fetch IOBE or ECFIN pages to confirm the licence.
- **ELIAMEP, KEPE, INE-GSEE, KANEP-GSEE, ENA Institute, Kapa Research, Metron Analysis, Prorata, aboutpeople, Generation 2.0:** no primary-source pages were retrieved within budget. All are **[UNVERIFIED]**. See Gaps.

### Inferences
- For these sources the realistic reuse model is to extract published aggregate percentages from reports, with citation, as *validation targets*, for example "% of youth in precarious work" from Eteron. Facts and statistics are generally not protected, but the full reports and tables are copyrighted. Microdata is not public.
- Eteron's topic set (housing, youth, mental health, AI, tourism, fairness) lines up well with product validation needs.

### Gaps
- Fieldwork partners, N and data availability for Eteron surveys: not verified.
- Two items are not verified: ELIAMEP's migration and foreign-policy attitude surveys (e.g. with Metron/aboutpeople), and Kapa Research "Οι Έλληνες και..." (Greeks and...) studies (data availability and terms).
- INE-GSEE annual reports, which are mainly ELSTAT/Eurostat secondary analysis, and KEPE: not checked for primary surveys.
- Metron Analysis, Prorata and aboutpeople non-electoral social barometers, such as Prorata attitude surveys and aboutpeople surveys for Eteron/ENA: PDFs only as far as is known, **[UNVERIFIED]**.
- "Η Ελλάδα σε αριθμούς" (Greece in figures): this is commonly an ELSTAT pocket publication. Not verified here.
- Generation 2.0 (migrant-rights NGO): no survey dataset found.

## Q5. data.gov.gr: relevant datasets, licence, API

### Takeaway
data.gov.gr is a CKAN portal with about 23,000 datasets, a full CKAN API, and explicit terms that permit commercial reuse. However, it holds almost no attitude or social-survey data: its content is administrative, municipal and environmental. Licence per dataset varies, and about 15% of datasets are "notspecified".

### Cited Findings
- The terms of use define open data as data enabling "την ελεύθερη χρήση, την τροποποίηση, τον συνδυασμό και τη διανομή για οποιονδήποτε σκοπό, συμπεριλαμβανομένης της εμπορικής εκμετάλλευσης" ("free use, modification, combination and distribution for any purpose, including commercial exploitation"). Art. 3.2: users may "επαναχρησιμοποιεί δεδομένα για οποιονδήποτε νόμιμο σκοπό, συμπεριλαμβανομένης της εμπορικής εκμετάλλευσης, χρησιμοποιεί τα API για αυτοματοποιημένες αντλήσεις" ("reuse data for any lawful purpose, including commercial exploitation, and use the APIs for automated retrieval"). Art. 3.4: "Οι Χρήστες οφείλουν να χρησιμοποιούν τα σύνολα δεδομένων μέσα στα όρια της άδειας με την οποία αυτά παρέχονται" ("Users must use datasets within the limits of the licence under which they are provided"), naming CC0 and CC BY 4.0 as the most common. Art. 4.4 sets API rate limits, and 4.3 bans "αυτοματοποιημένη άντληση καταχρηστικού όγκου δεδομένων" ("automated retrieval of an abusive volume of data"). — [data.gov.gr Όροι Χρήσης](https://data.gov.gr/pages/terms-of-use)
- **API check (CKAN `package_search`, 2026-10-27):**
  - Total of 23,004 datasets.
  - Licence facet: notspecified 3,559; other-open 1,585; other-nc (non-commercial) 925; odc-odbl 525; cc-by 457; cc-by-sa 133; other-pd 118; CC_BY_4_0 (EU URI) 53; cc-nc 38; gfdl 17; other-at 16; odc-by 12; other-closed 7; odc-pddl 2.
  - The facet counts sum to well under 23,004, so many datasets apparently have no licence_id. That is my inference from the counts.
  - Source: [data.gov.gr CKAN API](https://data.gov.gr/api/3/action/package_search?rows=0)
- Largest publishers: Δήμος Χανίων (Municipality of Chania) 2,224, Δήμος Αγρινίου (Agrinio) 1,197, Περιφέρεια Κρήτης (Region of Crete) 948, and others. Keyword hits:
  - "ΕΛΣΤΑΤ" (ELSTAT): 168, mostly settlements and toponyms.
  - "κοινωνικ" (social): 263, e.g. municipal social services.
  - "νοικοκυρι" (household): 9, e.g. "Νοικοκυριά 4 μελών (2021)", 4-member households from the census.
  - "survey": 38, e.g. "Καινοτομία στις ελληνικές επιχειρήσεις" (innovation in Greek enterprises).
  - "ευημερ" (wellbeing): 2.
  - Source: [data.gov.gr CKAN API](https://data.gov.gr/api/3/action/package_search?q=survey)
- The portal also offers "Προστατευόμενα Δεδομένα" (protected data, `is_nsip=Yes`), high-value datasets and API services pages. — [data.gov.gr](https://data.gov.gr/)
- The legal basis is Law 4727/2020, which obliges the public sector to publish open data. A Hellenic Parliament document notes Greece ranked second-to-last on reuse impact in the ODMR. — [Parliament document](https://www.hellenicparliament.gr/UserFiles/c0d5184d-7550-4265-8e0b-078e1bc7375a/12590801.pdf)

### Inferences
- data.gov.gr is useful for census and household-structure marginals and municipal context, through the CKAN API under the stated licences. It is not useful for attitudes. Filter on `license_id` in {cc-by, cc-zero, CC_BY_4_0, odc-by, odc-pddl, other-pd, other-open} and exclude `other-nc` and `cc-nc`.

### Gaps
- Whether ELSTAT social surveys (SILC, HBS, LFS aggregates) are mirrored on data.gov.gr: not checked. They are better taken from ELSTAT or Eurostat directly, which other researchers cover.

## Q6. CESSDA Data Catalogue entries for Greece: count, access conditions, API

### Takeaway
The CESSDA CDC has an open, unauthenticated JSON API. On 2026-10-27 it returned 621 Greek-language SoDaNet records, 128 English-language SoDaNet records, and 663 English records with study area Greece, of which 623 are GESIS cross-national studies (Eurobarometer, ISSP, EVS and similar). Access conditions are poorly coded: GESIS and SoDaNet records are all "Uncategorized".

### Cited Findings
- API endpoint: `GET https://datacatalogue.cessda.eu/api/DataSets/v2/search`. Parameters observed to work are `metadataLanguage` (en/el/...), `limit` (≤200), `offset`, `studyAreaCountries=Greece` and `publishers=<full publisher name>`. Free-text `query=` and `publisherFilter=` were silently ignored. Deep paging fails beyond offset+limit = 10,000 ("Result window is too large... must be less than or equal to: [10000]"). Unfiltered, there are 32,014 English-language records in total. — [CESSDA API](https://datacatalogue.cessda.eu/api/DataSets/v2/search?metadataLanguage=en&studyAreaCountries=Greece&limit=1)
- `studyAreaCountries=Greece` with `metadataLanguage=en` reported 830 available, and 663 unique records were retrieved. By publisher:
  - GESIS 623, all dataAccess "Uncategorized"
  - SND 16 (13 Restricted, 3 Open)
  - FSD 7 (6 Open, 1 Restricted)
  - AUSSDA 6
  - ADP 4
  - UniData 4 (Open)
  - SODHA 3
  - Source: [CESSDA API](https://datacatalogue.cessda.eu/api/DataSets/v2/search?metadataLanguage=en&studyAreaCountries=Greece&limit=200)
- Record fields include `dataAccess`, `dataAccessFreeTexts`, `pidStudies`, `studyUrl`, `typeOfModeOfCollections`, `typeOfSamplingProcedures`, `universe`, `keywords` (ELSST), `classifications` (CESSDA topics) and `studyXmlSourceUrl` (DDI). This allows automated discovery and metadata harvesting, but not data download. — [CESSDA API](https://datacatalogue.cessda.eu/api/DataSets/v2/search?metadataLanguage=el&limit=1)
- **ESS (which includes the Greek rounds) licence:** "European Social Survey data is licensed under CC BY-NC-SA 4.0. European Social Survey documentation is licensed under CC BY-SA 4.0. Under the terms of Creative Commons licences, 'commercial use' is defined by the nature of the activity, not the sector in which the actor is operating." ESS asks that datasets not be re-hosted externally and that users link to the ESS Data Portal. — [ESS conditions of use](https://europeansocialsurvey.org/node/58)

### Inferences
- The CESSDA API is a good tool for building a metadata inventory automatically, but it says nothing reliable about licences for Greek holdings, so each one must be checked at the source.
- Greek ESS microdata cannot be used inside a commercial product under CC BY-NC-SA. Published ESS aggregate statistics, such as Greek trust levels, can be cited as facts for validation. Facts are generally not copyrightable, but a legal check is advised.

### Gaps
- The English count reported 830 available but only 663 unique records came back from 5 pages. The difference may come from a duplicate or language-variant mechanism. This is unresolved.

## Q7. Bank of Greece / ECB Household Finance and Consumption Survey (HFCS)

### Takeaway
The HFCS (which includes Greece) provides household-level microdata on wealth, debt, income and consumption. It is released by the ECB **only to researchers for research purposes**, on application with ID, CV and a request form. It is not reusable inside a private commercial product. Published aggregate tables can serve as validation targets.

### Cited Findings
- "The HFCS datasets are available to researchers for research purposes." The access request requires "a copy of your government-issued photo identification document", "a Resume or Curriculum Vitae in English" and a "completed access request form". The datasets exclude Ireland. — [ECB HFCS page](https://www.ecb.europa.eu/stats/ecb_surveys/hfcs/html/index.en.html)
- Waves were released in April 2013, December 2016, March 2020 and July 2023. — [ECB HFCN researcher page](https://www.ecb.europa.eu/pub/research-networks/html/researcher_hfcn.en.html)

### Inferences
- The HFCS is unsuitable as an in-product data source. Use ECB-published aggregate statistical tables for Greece only as external validation benchmarks, with citation.

### Gaps
- Greece's participation per wave, and the Bank of Greece national terms or contact: **[UNVERIFIED]**.
- Whether a 2025–26 (fifth) wave release has occurred: not found.
- Licence of the ECB aggregate HFCS tables: not retrieved. ECB statistics generally allow reuse with source attribution, but that is **[UNVERIFIED]**.

## Q8. University survey labs (Panteion, NKUA, University of Macedonia, Hellenic Open University) and summary suitability matrix

### Takeaway
University survey output reaches the public mainly through SoDaNet deposits (NKUA/Tsirbas, Panteion/Demertzis and others). No separate open university data portal with a licence was found. Overall ranking for (a) validation and (b) priors for synthetic respondents:
- diaNEOsis TPE SAV files are the best Greek-only microdata, but rights are reserved.
- ESS/WVS Greece are high-quality probability samples, but non-commercial (ESS) or academic.
- SoDaNet topical studies are niche, and their terms are unclear.
- Eteron, think-tank and pollster PDFs give aggregate validation targets only.
- data.gov.gr and EKKE census give marginals and allow commercial use.

### Cited Findings
- Frequent SoDaNet depositors include Γ. Τσίρμπας (G. Tsirbas, NKUA; e.g. the EKPA postgraduate-alumni survey), Ν. Δεμερτζής (N. Demertzis), Β. Γεωργιάδου (V. Georgiadou) and Κ. Ρόντος (K. Rontos). — [CESSDA API, SoDaNet el records](https://datacatalogue.cessda.eu/api/DataSets/v2/search?metadataLanguage=el&limit=200); example [doi:10.17903/FK2/09WVTC](https://doi.org/10.17903/FK2/09WVTC)

### Inferences
Suitability summary (my assessment):

| Source | Microdata? | Licence / terms | Machine access | (a) Validation | (b) Priors |
|---|---|---|---|---|---|
| diaNEOsis TPE 2024 (+2016–22) | Yes (SAV, XLSX) | "All rights reserved"; no data licence | Direct file URLs | High (aggregates citeable) | High internally; permission needed for product use |
| ESS Greece (R1,2,4,5 at SoDaNet; later rounds at ESS) | Yes | CC BY-NC-SA 4.0, registration | ESS portal; CESSDA metadata API | High (aggregates) | Not in a commercial product |
| WVS-7 Greece (SoDaNet) | Yes | Unclear at SoDaNet; WVS's own terms not checked | Dataverse (Cloudflare-blocked) | High | Check terms |
| SoDaNet topical studies (migration, youth radicalism, COVID values, work–family) | Mostly | Open or registration/request; Regulations not retrieved | Dataverse; CESSDA API metadata | Medium | Medium; permission needed |
| Eteron surveys | No (PDF/web) | Not stated | None | Medium (cite figures) | Low |
| HFCS Greece | Yes | Research purposes only, by application | None | Aggregates only | Not allowed |
| data.gov.gr | Admin/census aggregates | Per dataset; commercial reuse allowed when open-licensed | CKAN API | Marginals | Marginals |
| EKKE Panorama/Socioscope | Census aggregates | Not verified | Web app | Marginals | Marginals |

### Gaps
- Panteion, University of Macedonia and Hellenic Open University survey labs: no dedicated pages retrieved. **[UNVERIFIED]**
- Licence of WVS-7 Greek data at SoDaNet versus WVSA's own terms: not checked.
