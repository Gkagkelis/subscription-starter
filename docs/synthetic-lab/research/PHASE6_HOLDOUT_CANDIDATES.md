# Phase 6: candidate sources for a blind final holdout of Greek survey ground truth

**Date:** 2026-10-29
**Scope:** discovery and cataloguing only. **No Greek response value was opened, printed, summarised or recorded in this file**, and none was written to disk outside short-lived temporary files (see §8).
**Rules followed:**
- no accounts were created;
- no terms, guestbooks or forms were accepted or filled;
- no logins, paywalls or robots rules were bypassed;
- no large downloads were kept.

Inputs checked against:
- `research/PHASE5_DATA_DISCOVERY.md`;
- `PHASE5_RESULTS.md` §A;
- `.synthetic-lab-data/raw/phase5/catalog.jsonl`;
- `.synthetic-lab-data/raw/sprint/{consumer_pdf,polls_pdf}/`;
- `.synthetic-lab-data/persona/pdf/documents.json`, the PDF ingest index (document names, partitions and question labels only; page text was not read).

---

## 0. Findings that change the plan

1. **The lab has already ingested many 2025–2026 Greek PDFs.** `scripts/synthetic-lab/persona/pdf_ingest.py` indexed 497 PDFs into `.synthetic-lab-data/persona/pdf/`, with full page text in `pages.jsonl` and partitions calibration ≤ 2026‑04‑30 < validation ≤ 2026‑07‑31 < final. The relevant ones are:
   - **Standard EB 104:** Greek national report.
   - **Standard EB 105:** Greek factsheet.
   - **Special EBs:** SP559, SP560 (Greek factsheet, EU report and data annex), SP562, SP566 and SP572 (Greek factsheets).
   - **Flash EBs:** FL014EP, FL566 and FL579 (both Greek factsheets).
   - **Consumer Conditions Survey 2024:** Greek factsheet, three presentations, and the volume AP/B xlsx in raw.
   - **diaNEOsis:** WVS‑2025 Greece report and trust report, AI survey (Jan 2026) results, AI‑ethics survey (May 2026) results, Digital News 2016–2026, Fake News.
   - **Reuters DNR:** 2025 and 2026.
   - **Market research:** Focus Bari (up to 2026‑10), GR.EC.A/ELTRUN e‑commerce 2026.
   - **Official and institute sources:** IOBE monthly (up to 2026‑10), IME‑GSEVEE 2025, EETT, ELSTAT.
   - **Greek polling companies:** Interview, Opinion Poll, Prorata, Marc, Palmos, Pulse, Metron, Kapa, GPO, MRB and Alco, **up to October 2026**.

   **None of these documents can serve as a blind holdout.** The surveys behind them are only partly blind: only the items that do not appear in the ingested PDFs could be used, after an item-level exclusion check (§6).
2. **Eurobarometer publishes full per-country tables as open XLSX.** These cover Standard, Special, Flash and EP waves. They are published on data.europa.eu as "Volume A" (all countries, Greece as a column), "Volume C" (each country × ~20 socio‑demographics) and so on.
   - **Access:** no registration.
   - **Licence:** Commission Decision 2011/833/EU, which allows reuse, including commercial reuse, with attribution.

   This is the largest clean pool. Most 2025–2026 Special and Flash waves have **not** been touched by the lab.
3. **The only truly prospective (future) holdouts** are surveys already in the field or scheduled but **not yet published** (§5). Predictions registered now cannot have been informed by the answers. This is the strongest design available.
4. **ESS Round 12 has not been released.** ESS ERIC announced on 2026‑09‑30 that the initial R12 release is scheduled for **January 2027** (it had been planned for end of November 2026).
   - EKKE is running Greek fieldwork for R12 (rotating modules: attitudes to immigrants and refugees; personal and social well-being).
   - Greek inclusion in the *first* release is **not confirmed**.
   - ESS R11 Greece is already held (dev).
   - CRONOS‑3 wave 7 (released 2026‑10‑13) covers 11 countries, **not Greece**.
5. **diaNEOsis has published no "Τι πιστεύουν οι Έλληνες" wave for 2025 or 2026.** The research page lists 2016–2024 only. The 2025–2026 diaNEOsis surveys with open SPSS microdata are WVS‑8 Greece 2025, AI Jan 2026 and AI‑ethics May 2026. Their result PDFs are already in the lab's ingest (point 1), so they are **not blind**.

---

## 1. Top 10 for a blind final holdout (available now, open, Greek tables not yet ingested)

Ranking criteria, in order:
1. no lab exposure;
2. a probability or national-representative design with a Greek N of about 1,000;
3. open machine-readable country tables;
4. domain diversity;
5. recency;
6. low overlap with trend items the lab already holds.

| # | Candidate | Publisher | URL(s) | Release | Unit / format | Access | Domain | Lab exposure |
|---|---|---|---|---|---|---|---|---|
| 1 | **Special EB wave 105.x (2026)**: SP571 Biodiversity, SP573 Corruption 2026, SP574 Sport & physical activity, SP578 Food innovation (+ SP577 CAP 2026, PDF annex only) | EC (DG COMM + DGs), Verian | survey pages `europa.eu/eurobarometer/surveys/detail/{3673,3693,3685,3703,3687}`; data `data.europa.eu/data/datasets/{s3673_105_1_sp571_eng, s3693_105_1_sp573_eng, s3685_105_3_sp574_eng, s3703_105_4_sp578_eng}` | Jun–Oct 2026 | country tables, XLSX (Vol. A/AA/B/C/D) | open, no registration; Decision 2011/833/EU | social/political/consumer (food, sport, environment) | none found |
| 2 | **Flash EB 2026, general public**: FL588 EU Ecolabel, FL576 Cybersecurity at workplace (employees), FL015EP Perception of the economy, FL584 EU challenges & priorities, FL585 Youth & democracy (15–30), FL574 Defence & space | EC / EP, Verian (typical) | detail ids 3705, 3681, 3732, 3677, 3701, 3652; data ids `s3705_fl588_eng, s3681_fl576_eng, s3732_fl015ep_eng, s3677_fl584_eng, s3701_fl585_eng, s3652_fl574_eng` | Feb–Oct 2026 | XLSX Vol. A/AA/B/C (+D) | open | consumer, media‑tech, economic, political | none found |
| 3 | **EP Eurobarometers**: EB049EP (Autumn 2025) and EB050EP (Spring 2026) | European Parliament, Verian | detail 3632, 3752; data `s3632_104_2_eb049ep_eng`, `s3752_105_3_eb050ep_eng` | 2026‑02‑04 / 2026‑07‑01 | XLSX Vol. A/AA/AP/B/C; Greek national PDFs (`…_Country_results_el_el.pdf`) | open | political / EU attitudes | none found (do not open the Greek national PDFs) |
| 4 | **Special EB waves 103.x/104.x (2025)**: SP561 Corruption 2025, SP563 Charter, SP564 Enlargement, SP565 Climate change, SP567 Social economy, SP568 Democracy, SP569 VET, SP570 Antisemitism | EC | detail 3361, 3366, 3413, 3472, 3356, 3383, 3367, 3379 | Jun 2025 – Jul 2026 | XLSX Vol. A/C | open | political/social/environment | none found |
| 5 | **Flash EB 2025, general public**: FL561 Urban, FL562 Taxation, FL563 Regional policy, FL564 Digital education, FL567 Admin services (citizens), FL569 EU challenges, FL570 Euro area (incl. payments/cash items), FL556 Youth views (+ FL554 Justice, PDF only) | EC | detail 3368, 3375, 3355, 3352, 3358, 3380, 3385, 3373, 3432 | Mar 2025 – Apr 2026 | XLSX Vol. A/C | open | economic/consumer/political | none found |
| 6 | **Standard EB 104 (Autumn 2025)**, full Volume A/C | EC (DG COMM), Verian | detail 3378; data `s3378_104_1_std104_eng` (Vol. A xlsx key A68C45C8…; Vol. C AT‑HR zip contains EL) | 2025‑12‑11 | XLSX, 209 sheets in Vol. A | open | political/economic/media | **partial**: Greek national report ingested (calibration); exclude every item in it |
| 7 | **Standard EB 105 (Spring 2026)**, full Volume A/C | EC (DG COMM), Verian | detail 3613; data `s3613_105_2_std105_eng` | 2026‑05‑08 | XLSX, 197 sheets in Vol. A | open | political/economic/media | **partial**: Greek factsheet ingested; exclude its items |
| 8 | **ECB SPACE 2024**: payment attitudes of consumers (microdata + country‑specific xlsx) | European Central Bank (Ipsos fieldwork) | `ecb.europa.eu/stats/ecb_surveys/space/html/index.en.html`; `…/shared/pdf/2024_SPACE_microdata.en.zip`; `…/shared/pdf/ecb.space2024_countryspecificdata.en.xlsx`; `…/ecb.space2024_charts.en.xlsx` | 2024‑12‑19 (fieldwork 2023‑09/11 and 2024‑04/06) | **respondent microdata** (zip) + country XLSX | open direct link; no stated terms on page (ECB copyright notice) | consumer: payments, cash, cards, digital euro | none. Phase 5 marked SPACE "not_public", but microdata zips **are** linked on the ECB page (HEAD 200) |
| 9 | **Pew Global Attitudes Spring 2025 and Spring 2026**: topline questionnaires (Greece included) | Pew Research Center (Gallup/Langer/SRC) | e.g. `pewresearch.org/global/2026/09/17/methodology-global-ai-2026/` (topline `pg_2026.09.17_global-views-of-ai_topline.pdf`); `…/2026/04/pg_2026.04.28_us-role-world_topline.pdf`; `…/2026/07/pg_2026.06.15_china-balance-power_topline.pdf`; 2025 toplines, e.g. `…/2025/07/08/methodology-allies-threats/` | 2025‑06 → 2026‑10 (rolling) | published per‑country marginals (PDF/XLSX toplines); microdata need an account (blocked) | toplines open | political/international/tech (AI) | none found |
| 10 | **OECD Trust Survey 2025 ("2026 Results")**: Greece country note + data | OECD | `oecd.org/en/publications/oecd-survey-on-drivers-of-trust-in-public-institutions-2026-results_c88c8869-en/greece_320ebbf3-en.html` | ~2026‑06‑30 | country note (HTML/PDF), likely OECD Data Explorer aggregates | open (oecd.org returned 403 to this agent, so not verified) | political/institutional trust | no lab ingest. **Agent exposure:** the search snippet showed the headline government-trust item (§8) |

**Why Eurobarometer dominates:** the Phase 5 transfer method (S1) needs the *same question* in other countries. Volume A gives exactly that: the Greek column plus 26–37 other countries on identical wording. Volume C adds Greek subgroup tables for the subgroup tests.

---

## 2. Full Eurobarometer catalogue, published 2025‑01‑01 → 2026‑10‑29

Sources:
- Commission Eurobarometer API `europa.eu/eurobarometer/api/survey/get/one?id=…`, used for metadata and deliverables;
- data.europa.eu `api/hub/search/datasets/{id}`, used for distributions and licence.

Columns:
- **"Vol A sheets"** = number of worksheets in the Volume A workbook, which is roughly the number of question tables plus about 3 metadata sheets. It was counted by opening the workbook programmatically, listing sheet names only, and deleting it.
- **"GR"** = Greece in the coverage list.

**Greek N:** not verified per survey. Usual designs are:
- Standard and Special EB: about 1,000 face-to-face (Greece is F2F/CAPI in the Kantar/Verian design);
- Flash: about 1,000 online/CATI;
- EP Flash: about 1,000 online.

Check each survey's technical specification, in the report annex, before use.

**Volume definitions** (from the data.europa.eu dataset description):

| Volume | Contents |
|---|---|
| A | Countries/EU: weighted frequencies per country |
| AP | Shift vs previous wave per country |
| AA / AAP | Country groups |
| B / BP | EU × ~20 socio‑demographics |
| C | **Per country × ~20 socio‑demographics** (zip) |
| D | Trends vs previous polls |

**Overlap warning:** AP and D contain earlier-wave Greek values.

**Licence:** every dataset below carries `http://data.europa.eu/eli/dec/2011/833/oj`. SPSS files and questionnaires are at GESIS, which needs a login and is blocked. Volume A carries the full question wording, and the "Content" sheet lists the questions in French and English.

| Ref | Title | Published | Fieldwork | GR | #countries | Vol A sheets | Machine-readable | Lab exposure | Trend / overlap risk |
|---|---|---|---|---|---|---|---|---|---|
| FL585 | Youth and democracy (15–30) | 2026‑10‑28 | 2026‑06‑19 → 07‑01 | yes | 27 | 36 | [data](https://data.europa.eu/data/datasets/s3701_fl585_eng?locale=en) | none | medium (FL545, 2024) |
| SP578 | Food innovation | 2026‑10‑26 | 2026‑05‑26 → 06‑15 | yes | 27 | 66 | [data](https://data.europa.eu/data/datasets/s3703_105_4_sp578_eng?locale=en) | none | low (new topic) + std D/SD block |
| FL578 | AI & algorithmic management in SMEs (**business sample**) | 2026‑10‑14 | 2026‑03‑20 → 04‑13 | yes | 27 | 29 | [data](https://data.europa.eu/data/datasets/s3696_fl578_eng?locale=en) | none | low; B2B, not general population |
| FL588 | The EU Ecolabel | 2026‑10‑08 | 2026‑08‑31 → 09‑07 | yes | 27 | 30 | [data](https://data.europa.eu/data/datasets/s3705_fl588_eng?locale=en) | none | medium (FL535, 2023) |
| FL576 | Cybersecurity at the workplace (employees) | 2026‑09‑30 | 2026‑03‑16 → 03‑23 | yes | 27 | 41 | [data](https://data.europa.eu/data/datasets/s3681_fl576_eng?locale=en) | none | low |
| SP577 | Europeans, Agriculture and the CAP 2026 | 2026‑09‑22 | 2026‑05‑26 → 06‑15 | yes | 27 | — | PDF data annex only (deliverable 109211) | none | high (SP556, 2024 edition) |
| SP574 | Sport and physical activity | 2026‑09‑22 | 2026‑04‑09 → 05‑04 | yes | 27 | 85 | [data](https://data.europa.eu/data/datasets/s3685_105_3_sp574_eng?locale=en) | none | medium (6th edition; previous 2022) |
| FL584 | EU challenges and priorities | 2026‑07‑13 | 2026‑06‑19 → 06‑24 | yes | 27 | 44 | [data](https://data.europa.eu/data/datasets/s3677_fl584_eng?locale=en) | none | medium (FL569/FL550 series) |
| SP569 | Attractiveness of VET | 2026‑07‑10 | 2025‑11‑01 → 11‑30 | yes | 27 | 74 | [data](https://data.europa.eu/data/datasets/s3367_104_2_sp569_eng?locale=en) | none | low–medium |
| EB050EP | EP Spring 2026 | 2026‑07‑01 | 2026‑04‑09 → 05‑04 | yes | 27 | 78 | [data](https://data.europa.eu/data/datasets/s3752_105_3_eb050ep_eng?locale=en) | none | medium (Parlemeter trend items) |
| SP572 | Digital Decade 2026 | 2026‑06‑17 | 2026‑02‑05 → 03‑01 | yes | 27 | 92 | [data](https://data.europa.eu/data/datasets/s3682_105_1_sp572_eng?locale=en) | **Greek factsheet ingested** | high (annual series SP551/SP566) |
| FL579 | Screen time & social media, young people (parents and youth samples) | 2026‑06‑16 | 2026‑03‑30 → 04‑16 | yes | 27 | 45 / 49 | [data](https://data.europa.eu/data/datasets/s3686_fl579_eng?locale=en) | **Greek factsheets (parents, youth) ingested** | low |
| FL015EP | Europeans' perception of the economy | 2026‑06‑10 | 2026‑03‑24 → 04‑01 | yes | 27 | 46 | [data](https://data.europa.eu/data/datasets/s3732_fl015ep_eng?locale=en) | none | low–medium (economic expectations close to STD QA items) |
| FL577 | Air travel safety / EU air safety list | 2026‑06‑09 | 2026‑02‑24 → 03‑02 | yes | 27 | — | PDF data annex only (deliverable 106217) | none | low |
| SP573 | Corruption in the EU 2026 | 2026‑06‑04 | 2026‑02‑05 → 03‑01 | yes | 27 | 100 | [data](https://data.europa.eu/data/datasets/s3693_105_1_sp573_eng?locale=en) | none | **high** (annual since 2005; SP561 2025) |
| FL582 | Businesses: corruption & justice 2026 (B2B) | 2026‑06‑04 | 2026‑04‑23 → 05‑08 | yes | 31 | (zip) | [data](https://data.europa.eu/data/datasets/s3694_fl582_eng?locale=en) | none | high; B2B |
| SP571 | Attitudes towards biodiversity | 2026‑06‑03 | 2026‑02‑05 → 03‑01 | yes | 27 | 83 | [data](https://data.europa.eu/data/datasets/s3673_105_1_sp571_eng?locale=en) | none | medium (2019 edition) |
| FL571 | SMEs recruiting from outside EU (B2B) | 2026‑06‑01 | 2025‑12‑01 → 12‑17 | yes | 27 | 34 | [data](https://data.europa.eu/data/datasets/s3365_fl571_eng?locale=en) | none | low; B2B |
| **STD105** | Standard EB 105, Spring 2026 | 2026‑05‑08 | 2026‑03‑12 → 04‑05 | yes | 38 | 197 | [data](https://data.europa.eu/data/datasets/s3613_105_2_std105_eng?locale=en) | **Greek factsheet ingested** | **high** for the QA standard block; modules QB (national interests/EU), QC (attachment/citizenship), QD (Ukraine), QE |
| FL567 | Admin services: citizens | 2026‑04‑20 | 2025‑07‑22 → 08‑08 | yes | 27 | 43 | [data](https://data.europa.eu/data/datasets/s3358_fl567_eng?locale=en) | none | low |
| FL568 | Admin services: businesses (B2B) | 2026‑04‑20 | 2025‑08‑18 → 09‑09 | yes | 27 | — | PDF only | none | B2B |
| FL574 | EU in Defence and Space | 2026‑02‑12 | 2026‑01‑05 → 01‑11 | yes | 27 | 22 | [data](https://data.europa.eu/data/datasets/s3652_fl574_eng?locale=en) | none | low–medium |
| EB049EP | EP Autumn 2025 | 2026‑02‑04 | 2025‑11‑06 → 11‑30 | yes | 27 | 85 | [data](https://data.europa.eu/data/datasets/s3632_104_2_eb049ep_eng?locale=en) | none | medium |
| SP570 | Perceptions of antisemitism | 2026‑01‑27 | 2025‑11‑01 → 11‑30 | yes | 27 | 66 | [data](https://data.europa.eu/data/datasets/s3379_104_2_sp570_eng?locale=en) | none | medium (2018 edition) |
| SP560 | e‑Communications & DSM | 2026‑01‑20 | 2025‑01‑09 → 02‑04 | yes | 27 | 89 | [data](https://data.europa.eu/data/datasets/s3175_103_1_sp560_eng?locale=en) | **Greek factsheet + EU annex/report ingested** | high |
| FL566 | Consumer behaviour in the energy transition | 2025‑12‑12 | 2025‑06‑30 → 07‑15 | yes | 27 | 37 | [data](https://data.europa.eu/data/datasets/s3354_fl566_eng?locale=en) | **Greek factsheet ingested** | low |
| **STD104** | Standard EB 104, Autumn 2025 | 2025‑12‑11 | 2025‑10‑09 → 11‑03 | yes | 38 | 209 | [data](https://data.europa.eu/data/datasets/s3378_104_1_std104_eng?locale=en) | **Greek national report ingested** | **high** for QA; modules QB (EU priorities), QC (citizenship), QD (Ukraine), QE (informed/media), QF (EU budget) |
| FL564 | Future needs in digital education | 2025‑12‑11 | 2025‑05‑07 → 05‑14 | yes | 27 | 49 | [data](https://data.europa.eu/data/datasets/s3352_fl564_eng?locale=en) | none | low |
| SP563 | Charter of Fundamental Rights | 2025‑12‑05 | 2025‑02‑18 → 03‑16 | yes | 27 | 65 | [data](https://data.europa.eu/data/datasets/s3366_103_2_sp563_eng?locale=en) | none | medium |
| FL570 | Euro area, Autumn 2025 | 2025‑12‑05 | 2025‑09‑15 → 09‑23 | yes | 20 | 43 | [data](https://data.europa.eu/data/datasets/s3385_fl570_eng?locale=en) | none | **high** (annual series FL553/FL538) |
| SP568 | Protecting & promoting democracy | 2025‑11‑12 | 2025‑05‑05 → 05‑26 | yes | 27 | 85 | [data](https://data.europa.eu/data/datasets/s3383_103_4_sp568_eng?locale=en) | none | medium |
| FL569 | EU challenges and priorities | 2025‑11‑07 | 2025‑09‑03 → 09‑10 | yes | 27 | 41 | [data](https://data.europa.eu/data/datasets/s3380_fl569_eng?locale=en) | none | medium |
| SP567 | Social economy | 2025‑10‑28 | 2025‑05‑05 → 05‑26 | yes | 27 | 78 | [data](https://data.europa.eu/data/datasets/s3356_103_4_sp567_eng?locale=en) | none | low |
| FL014EP | Social Media Survey 2025 | 2025‑10‑16 | 2025‑06‑11 → 06‑18 | yes | 27 | 43 | [data](https://data.europa.eu/data/datasets/s3592_fl014ep_eng?locale=en) | **Greek factsheet ingested** | medium |
| EB048EP | EP Spring 2025 | 2025‑09‑03 | 2025‑05‑05 → 05‑26 | yes | 27 | 81 | [data](https://data.europa.eu/data/datasets/s3572_103_4_eb048ep_eng?locale=en) | none | medium |
| SP564 | Attitudes towards EU enlargement | 2025‑09‑02 | 2025‑02‑18 → 03‑16 | yes | 27 | 83 | [data](https://data.europa.eu/data/datasets/s3413_103_2_sp564_eng?locale=en) | none | medium |
| FL562 | Citizens' attitudes towards taxation | 2025‑08‑05 | not stated in API | yes | 27 | 38 | [data](https://data.europa.eu/data/datasets/s3375_fl562_eng?locale=en) | none | low |
| SP561 | Corruption in the EU 2025 | 2025‑07‑08 | 2025‑01‑09 → 02‑04 | yes | 27 | 94 | [data](https://data.europa.eu/data/datasets/s3361_103_1_sp561_eng?locale=en) | none | high (series) |
| FL557 | Businesses & corruption (B2B) | 2025‑07‑08 | 2025‑01‑27 → 02‑28 | yes | 31 | 48 | [data](https://data.europa.eu/data/datasets/s3382_fl557_eng?locale=en) | none | B2B |
| FL563 | EU Regional policy awareness | 2025‑07‑04 | 2025‑04‑22 → 05‑08 | yes | 27 | 38 | [data](https://data.europa.eu/data/datasets/s3355_fl563_eng?locale=en) | none | medium (FL531, 2023) |
| FL559 | Startups, scaleups & entrepreneurship | 2025‑07‑02 | 2025‑02‑20 → 04‑04 | yes | 38 | 96 | [data](https://data.europa.eu/data/datasets/s3359_fl559_eng?locale=en) | none | low (sample type not verified) |
| FL555 | Justice independence: companies (B2B) | 2025‑07‑01 | 2025‑01‑13 → 01‑28 | yes | 31 | 31 | [data](https://data.europa.eu/data/datasets/s3412_fl555_eng?locale=en) | none | B2B |
| FL554 | Justice independence: general public | 2025‑07‑01 | 2025‑01‑13 → 02‑02 | yes | 31 | — | PDF annex only (deliverable 99262) | none | high (annual series) |
| SP565 | Climate change | 2025‑06‑30 | 2025‑02‑18 → 03‑16 | yes | 27 | 83 | [data](https://data.europa.eu/data/datasets/s3472_103_2_sp565_eng?locale=en) | none | **high** (biennial since 2008) |
| FL561 | Urban challenges & investment in cities | 2025‑06‑18 | 2025‑03‑26 → 04‑09 | yes | 27 | (download failed) | [data](https://data.europa.eu/data/datasets/s3368_fl561_eng?locale=en) | none | low |
| SP566 | Digital Decade 2025 | 2025‑06‑16 | 2025‑02‑18 → 03‑16 | yes | 27 | 95 | [data](https://data.europa.eu/data/datasets/s3362_103_2_sp566_eng?locale=en) | **Greek factsheet ingested** | high |
| SP559 | Investing in fairness | 2025‑06‑04 | 2025‑01‑09 → 02‑04 | yes | 27 | 91 | [data](https://data.europa.eu/data/datasets/s3223_103_1_sp559_eng?locale=en) | **Greek factsheet ingested** | medium |
| STD103 | Standard EB 103, Spring 2025 | 2025‑05‑28 | 2025‑03‑26 → 04‑18 | yes | 37 | 191 | [data](https://data.europa.eu/data/datasets/s3372_103_3_std103_eng?locale=en) | **HELD (EB 103.3 trimmed, dev) + Greek factsheet ingested** | not usable |
| SP562 | Attitudes towards culture | 2025‑05‑08 | 2025‑02‑18 → 03‑16 | yes | 27 | 85 | [data](https://data.europa.eu/data/datasets/s3364_103_2_sp562_eng?locale=en) | **Greek factsheet ingested** | medium (EB culture 2007/13/17 held) |
| FL556 | EU challenges: young Europeans | 2025‑03‑25 | 2025‑02‑11 → 02‑20 | yes | 27 | 30 | [data](https://data.europa.eu/data/datasets/s3373_fl556_eng?locale=en) | none | medium |
| EB047EP | EP Winter 2025 | 2025‑03‑25 | 2025‑01‑09 → 02‑04 | yes | 27 | 71 | [data](https://data.europa.eu/data/datasets/s3492_103_1_eb047ep_eng?locale=en) | none | medium |
| FL551, SP558, FL013EP, SP554, SP557, SP556 | published Jan–Apr 2025, **fieldwork in 2024** | 2025‑01 → 04 | 2024 | yes | 27–35 | 31–140 | data ids `s3178_fl551_eng`, `s3213_102_1_sp558_eng`, `s3392_fl013ep_eng`, `s3222_101_4_sp554_eng`, `s3227_102_1_sp557_eng`, `s3226_101_5_sp556_eng` | none | older; usable as secondary holdout |

**Not useful for Greece:** FL583, FL581, FL560 and FL558 (non-euro or enlargement countries only), and FL572, FL573 and FL575 (Bulgaria only).

**Download pattern:** each data.europa.eu distribution resolves to `https://webgate.ec.europa.eu/ebsm/api/public/odp/download?key=<KEY>`. HEAD returns 200 with an XLSX or ZIP content type, and there is no login. Report PDFs come from `https://europa.eu/eurobarometer/api/deliverable/download/file?deliverableId=<ID>`, which redirects to webgate. The survey page is `https://europa.eu/eurobarometer/surveys/detail/<id>`.

**Greek-only deliverables to avoid opening:** `FACTEN/FACTLL *_EL_*`, the national reports `…national report_el_el.pdf`, and `EP_…_Country_results_el_{el,en}.pdf`. The `…_cy_el` versions are Cyprus and are harmless, but are also best avoided.

---

## 3. Other open candidates (non‑Eurobarometer)

### 3.1 ECB SPACE 2024: Study on the payment attitudes of consumers in the euro area
- **URLs:**
  - index: https://www.ecb.europa.eu/stats/ecb_surveys/space/html/index.en.html
  - microdata: `/stats/ecb_surveys/space/shared/pdf/2024_SPACE_microdata.en.zip`
  - country data: `/stats/ecb_surveys/space/shared/pdf/ecb.space2024_countryspecificdata.en.xlsx`
  - tables: `/stats/ecb_surveys/space/shared/pdf/ecb.space2024_charts.en.xlsx`
  - earlier waves: 2022 and 2019 microdata, and the 2016 SUCH CSV, are also listed.
- **Release:** 19 Dec 2024.
- **Fieldwork:** Sep–Nov 2023 (round 1) and Apr–Jun 2024 (round 2).
- **Sample:** about 50,000 consumers in the 20 euro-area countries, Ipsos online/telephone. Greek N is not verified.
- **Unit:** respondent microdata plus a country XLSX.
- **Access and licence:** direct download, with no registration or terms stated on the page; the ECB copyright footer applies, and "Disclaimer & Copyright" page wording was not read. The phase 5 catalog entry `ecb_space_payments` says "not_public", **which is outdated**.
- **Domain:** consumer (payments, cash, cards, mobile payment, digital euro attitudes). This fills the "payments" gap noted in Phase 5 §5.
- **Questions:** roughly 50–100 items, unverified.
- **Overlap risk:** SPACE 2019 and 2022 share most items. Their microdata are also open but not held. EB FL570 (euro area) has some cash and payment items.
- **Next wave:** "scheduled to be published in 2026", not yet out on 2026‑10‑29. This is a **prospective** opportunity.

### 3.2 Pew Research Center Global Attitudes, Spring 2025 and Spring 2026 (Greece included)
- **Greece in both waves:**
  - Spring 2025: Greece is listed in the methodology, with phone interviews since 2021.
  - Spring 2026: Greece is listed among the 37 countries; international fieldwork ran 2026‑02‑08 → 05‑13.
- **Release:** reports and toplines appear on a rolling basis (2025‑06 → 2026‑10). Examples:
  - global views of AI (2026‑09‑17);
  - China and the balance of power (2026‑07‑15);
  - US role in the world (2026‑04‑28);
  - satisfaction with democracy (2026‑06);
  - international morality (2026‑03‑05, based on 2025 data);
  - national pride (2026‑02‑17).
- **Unit:** published per‑country marginals in topline PDFs or XLSX. Respondent data need a Pew account, which is blocked under the lab rules.
- **Greek N:** about 1,000, typical but not verified.
- **Terms:** Pew allows citation and reuse with attribution. The terms page was not reviewed.
- **Domain:** political/international, plus AI/tech in 2026.
- **Overlap:** several items are long-running trends (US/China/EU favourability). The lab holds no Pew Greek data. Phase 5 recorded Pew microdata as blocked.

### 3.3 OECD Survey on Drivers of Trust in Public Institutions, 2025 wave ("2026 Results")
- **Countries:** 38, Greece included.
- **Greek fieldwork:** 10 Sep → 17 Nov 2025, according to a search snippet.
- **Release:** about 2026‑06‑30.
- **Greece country note:** https://www.oecd.org/en/publications/oecd-survey-on-drivers-of-trust-in-public-institutions-2026-results_c88c8869-en/greece_320ebbf3-en.html
- **Not verified:** oecd.org returned HTTP 403 to this agent. N (2023 design: about 2,000 per country, online panel), the data file location and the licence (OECD content is usually CC BY 4.0) are all unconfirmed.
- **Agent exposure:** one item (§8).

### 3.4 diaNEOsis 2025–2026 surveys with open SPSS microdata (not blind)

| Survey | Fieldwork | N / vendor / mode | Files | Lab exposure |
|---|---|---|---|---|
| WVS‑8 Greece 2025 (with EKKE) | 2025‑03‑17 → 04‑02 | 1,200; MRB Hellas; CAPI + CAWI (CINT) | `wp-content/uploads/2025/07/World-Values_2025_GR.zip` (193 KB SAV), `TABLES_WVS_2025.xls`, `WVS-2025_Questionnaire.docx` | report PDF (calibration) and trust report ingested; agent exposure (§8) |
| "Τι πιστεύουν οι Έλληνες για την AI" | 2026‑01‑08 → 01‑13 | 1,111 aged 17+; Metron Analysis; CATI + CAWI | `2026/03/AI_data.zip` (SAV), `AI_tables.xlsx`, `AI_questionnaire.docx` | results PDF ingested (calibration) |
| "Οι Έλληνες και η AI: Ηθική, Δεοντολογία" | 2026‑05‑04 → 05‑09 | 1,103; Metron Analysis; CATI + CAWI | `2026/05/AI_ethics.zip` (SAV), `AI_ethics_tables_25052026.xlsx`, `AI_ethics_questionnaire.docx` | results PDF ingested (validation) |
| Civil society & philanthropy | 2024‑03 | 1,103; MRB | `2024/11/koinonia_politonfilanthropia.zip` (SAV) | report PDF ingested |

**Licence:** "All rights reserved", with no data licence, so internal research use only (see `greek_archives_institutes.md`).

**Usability:** none of these is clean for a *blind* final. At most, items absent from the ingested PDFs could serve as a *Greek-only* secondary test. WVS‑8 Greece would also be a strong cross-national S1 test if the lab ever obtained the WVS‑8 international release, which needs WVSA registration and is blocked.

### 3.5 Lower-value or not available
- **EIB Climate Survey:** the newest edition on eib.org is the 7th (fieldwork Aug 2024, 27 EU countries + US, about 1,000 per country, publication 2024‑12‑03). No 8th edition was found. Only press releases and PDFs are available, and microdata need a request (blocked in Phase 5). There is also agent exposure (§8).
- **EU Consumer Conditions Survey 2024** (fieldwork Nov 2024, published 2025‑03‑14): its volume AP xlsx (country tables) is **already in `raw/sprint/consumer_pdf`**, and its Greek factsheet and presentations were ingested. Not new. The next edition is expected around 2027 (biennial; inferred).
- **Eurofound "Living and working in the EU" e‑survey, round 8 (2025):**
  - report "Uneven picture of a changing Europe" published 2026‑01‑19;
  - country charts are in the Eurofound data catalogue;
  - the sample is a non-probability online sample;
  - microdata are at UKDS (login, blocked).

  Usable only as a weak marginal check. Not verified at country-table level.
- **Greek polling companies' PDFs:** every company the lab tracks is already archived and ingested up to Oct 2026 (§0). Only polls published **after** the archive's last date are new (prospective, §5).
- **Reuters DNR 2026:** the PDF is ingested, and microdata are on request (blocked).
- **ESS R12:** not released (Jan 2027).
- **GESIS EB 104.1 SAV** (ZA9130, pre-release v1.0.0, 2026‑07‑29): requires a login (blocked).

---

## 4. Overlap with older waves (standardised trend questions)

High overlap with held data:
- Standard EB QA block (country and EU situation, problems, trust in institutions, EU image, optimism, satisfaction with democracy and life): held in 97.5–103.3 and in older waves.
- The D/SD socio-political block repeated in every Special EB Volume A (D78 EU image, D70 life satisfaction, D71 political discussion, and so on).
- SP561/SP573 corruption series.
- SP565 climate series.
- SP566/SP572 Digital Decade series.
- FL570 euro-area series.

This is not contamination, because the Greek values for *these* waves are unseen. But it makes prediction easier, because Greek values from previous waves are known. **Two options:**
- report trend items as a separate stratum; or
- restrict the final to "module" items (STD QB–QF, Special modules) and new-topic Flash surveys (FL576, FL015EP, FL574, FL564, FL567, SP567, SP578).

**Volumes AP and D** show shifts against earlier waves. Using them would leak a Greek baseline, so they should be excluded from any pre-registration inputs.

---

## 5. Prospective holdouts: not yet published on 2026‑10‑29 (strongest design)

| Source | Expected | Evidence | What to preregister |
|---|---|---|---|
| **Standard EB 106 (Autumn 2026)** | fieldwork Oct–Nov 2026, release about Dec 2026 | inferred from cadence (STD104 fieldwork 2025‑10‑09 → 11‑03, published 2025‑12‑11); not listed by the API yet | whole QA trend block + modules, using STD104/105 wording |
| **Special/Flash EBs already fielded but unpublished** | 2026‑11 → 2027 | the reference numbers SP575, SP576, FL580, FL586 and FL587 are missing from the published list, which suggests they are in the pipeline (unverified) | topics unknown until publication; a generic protocol is needed |
| **ESS Round 12** | initial release Jan 2027 | ESS news 2026‑09‑30; Greek fieldwork by EKKE | ESS core + rotating modules on immigrants/refugees and well-being |
| **ECB SPACE 2026** | "scheduled to be published in 2026" | ECB SPACE page | payment-behaviour items (SPACE 2024 wording) |
| **Pew Spring 2026, remaining releases** | rolling into 2027 | Pew methodology pages | items in published questionnaires but not yet released |
| **Eurostat ICT usage in households 2026** | about Dec 2026 | normal Eurostat release cycle (not verified) | consumer and media-tech indicators (CC BY 4.0) |
| **Greek pollster PDFs after the archive cut-off** (fieldwork after the latest file per company) | weekly to monthly | polls_pdf archive dates | recurring items (economy, direction of country, problems) |

---

## 6. Recommended blinding protocol (Eurobarometer XLSX)

1. **Freeze the item list first.** Download Volume A and C files with a script that:
   - reads only the "Content" / "Table of Contents" sheet and the header rows;
   - **drops the EL column before anything is written to readable storage**, and writes the Greek column to a sealed file (for example encrypted, or stored with a SHA‑256 commitment) that no model or person opens until predictions are frozen;
   - keeps all other countries' columns, which the S1 method needs.
2. **Remove items already exposed:** match each item against `persona/pdf/tables_*.jsonl` question labels and against the ingested Greek factsheets and national reports. Match by docId/question only; page text should not be read.
3. **Stratify:**
   - trend items vs new items;
   - general-population vs B2B and youth-only samples (FL578, FL571, FL582, FL557, FL555 and FL568 are B2B; FL585 and FL579 have special samples).
4. **Exclude Volumes AP and D** (earlier-wave values) from all inputs.
5. **Use Volume C (Greece) only** for the subgroup-difference test, unsealed after predictions are frozen.

---

## 7. What could not be verified
- **Greek sample sizes per Eurobarometer:** technical specifications were not read, because the PDF annexes mix specifications and results. Values are typical figures only.
- **SPACE 2024:** Greek N, item count and the exact wording of the ECB reuse terms.
- **Pew:** Greek N and vendor per wave, and the Pew terms of use.
- **OECD Trust Survey 2025:** oecd.org returned 403, so the country-note details, data-file location and licence are unconfirmed.
- **Future surveys:** whether SP575, SP576, FL580, FL586 and FL587 exist, and the exact timing of STD106.
- **ESS R12:** whether Greece is in the January 2027 first release.
- **diaNEOsis questionnaires:** the item counts (WVS‑8 Greece is ≥ 113 numbered items plus E‑series; the AI questionnaires have about 20–30 items, uncounted because of Word auto-numbering).
- **EIB Climate Survey:** whether an 8th edition (2025/26) exists. None was found on eib.org.
- **Eurofound LWEU 2025:** the availability of country tables.
- **FL561:** the Volume A download failed (empty reply), so its sheet count is missing.

---

## 8. Integrity log: incidental exposure of the *agent* (values deliberately not recorded)

Web-search result summaries are generated automatically and in a few cases displayed Greek headline figures before they could be filtered. **No value is reproduced here.**
- **WVS‑8 Greece 2025 (diaNEOsis/EKKE):**
  - feeling excluded from the political system;
  - confidence in own ability to participate in politics;
  - low satisfaction with democracy (1–10 scale).

  A press snippet (powergame.gr, 2025‑07‑13) also mentioned an "importance of politics vs 2017" comparison.
- **EIB Climate Survey 2024 (7th):**
  - "need to adapt to climate change";
  - "climate adaptation a priority";
  - rank of climate change among national challenges.
- **OECD Trust Survey 2025:** trust in national government (high/moderate, low/no, neutral shares).

**Recommendation:** treat these items as exposed and exclude them from any final holdout.

The lab's ingest (§0) is a much larger exposure than these items.

**Files touched:**
- **Volume A workbooks, about 56 small XLSX files:** downloaded to a temporary scratch folder. Only sheet names and question labels were read, programmatically (counts in §2), and each file was deleted immediately. No cell values were printed.
- **Three diaNEOsis questionnaires (DOCX):** used to count items, then deleted.
- **One SP574 data-annex PDF:** auto-saved by a fetch, deleted without being read.
