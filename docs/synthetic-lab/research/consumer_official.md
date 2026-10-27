# Official and regulatory consumer/market data for Greece: "consumer priors" for synthetic respondents

Scope: official, regulatory and EU-institution data with Greek coverage. Use cases: testing a 25 EUR/month mobile plan, subscriptions, e-commerce, food delivery, energy, and banking or payments. Research date: 27 Oct 2026. Where this file says **live call**, the value was retrieved during this session from the named API or file.

---

## Q1. EETT (Hellenic Telecommunications & Post Commission): market reports, ARPU, prices, consumer surveys, open data, licence

### Takeaway
EETT is the best Greek source of telecom priors. Three items stand out:
- The annual Market Review (latest: 2024 data, published Feb 2026) gives connections, ARPU and usage per user.
- Two commissioned consumer surveys (n≈1,000–1,200) contain price-band and channel data that bear directly on a 25 EUR plan.
- A Tefficient benchmark gives Greek mobile ARPU at 12.7 EUR/month.

The licence situation is split:
- **Market reports and PDFs:** the EETT website terms say "personal use only". Commercial copying is not allowed, so treat these as reference or calibration targets, not data you redistribute.
- **EETT open datasets on data.gov.gr:** CC BY 4.0. These cover registries and quality indices, not market or price data.

### Cited Findings
**Publications and where to find them**
- The Market Review series runs 2015–2024 as English PDFs, with infographic ZIPs from 2019 on. Latest: `https://www.eett.gr/wp-content/uploads/2026/02/EETT_MARKET_REVIEW_2024.pdf` (2024 data). — [EETT Market Review page](https://www.eett.gr/en/media-publications/publications/market-review/)
- Greek market data has four sub-sections: Market Review, Reports/Studies, Market questionnaires, and Semi-annual market data. The semi-annual data is in Greek only, covers 2005–2025, and lists A and B semesters. The file list loads dynamically, so I could not list the files without a browser. — [EETT Greek market data](https://www.eett.gr/en/market-data/reported-data/electronic-communications/greek-market-data/); [Semi-annual market data](https://www.eett.gr/en/market-data/reported-data/electronic-communications/greek-market-data/semi-annual-market-data/)

**Market Review 2024: mobile figures**
- Total mobile connections: 16.1M (+4.5%). Active connections: about 13.5M. Market shares by total connections: OTE 44.4%, Vodafone 34.1%, Nova 21.5%. — [EETT Market Review 2024 (PDF)](https://www.eett.gr/wp-content/uploads/2026/02/EETT_MARKET_REVIEW_2024.pdf)
- Post-paid connections: 8.0M (+13.7%). Registered pre-paid: 8.1M (−3.3%). Penetration, excluding M2M: 114% active, 139% total. Residential connections: 12.8M. Business: 3.3M. — [EETT Market Review 2024](https://www.eett.gr/wp-content/uploads/2026/02/EETT_MARKET_REVIEW_2024.pdf)
- Retail mobile revenue: 1.81bn EUR (+2.8%).
  - Average annual revenue per post-paid connection, excluding M2M: **209 EUR (about 17.5 EUR/month)**.
  - Per pre-paid user: **90 EUR (about 7.5 EUR/month)**.
  - 2023 comparison: 212 EUR and 83 EUR.
  - Source: [EETT Market Review 2024](https://www.eett.gr/wp-content/uploads/2026/02/EETT_MARKET_REVIEW_2024.pdf)
- Monthly data use in 2024: 16.8 GB per post-paid residential user, 10.6 GB per business user, 9 GB per pre-paid user. Total mobile data: 1,732M GB (+38.7%). — [EETT Market Review 2024](https://www.eett.gr/wp-content/uploads/2026/02/EETT_MARKET_REVIEW_2024.pdf)

**Market Review 2024: bundles, prices, fixed broadband and pay-TV**
- Bundles that include mobile: 2.4M, which is 54% of all bundles. Shares by bundle type:
  - mobile-service bundles 42.7% (about 1.9M)
  - double play 39.7%
  - 4-play 10.4% (about 459k)
  - 3-play 6.6%
  - Source: [EETT Market Review 2024](https://www.eett.gr/wp-content/uploads/2026/02/EETT_MARKET_REVIEW_2024.pdf)
- Price Observatory ("Pricescope"), end-2024: about 1,200 retail products/programs across NOVA, OTE and Vodafone. 94% of post-paid mobile voice products had unlimited minutes to all networks. 26% of post-paid voice+data products had unlimited data (+13% vs 2023). — [EETT Market Review 2024](https://www.eett.gr/wp-content/uploads/2026/02/EETT_MARKET_REVIEW_2024.pdf)
- Fixed broadband: 4,489,909 lines at end-2024, 43.2% population penetration. Pay-TV: 1.4M subscriptions (59% IP, 41% satellite), and 55% of them sold in bundles. — [EETT Market Review 2024](https://www.eett.gr/wp-content/uploads/2026/02/EETT_MARKET_REVIEW_2024.pdf)

**Tefficient benchmark for EETT (8 Oct 2025)**
- Greek mobile ARPU in 2024: **12.7 EUR/month** excluding M2M, against a 12-country Eurozone peer median of 15.2 EUR. Including M2M: 11.4 EUR. — [Tefficient for EETT, Oct 2025 (PDF)](https://www.eett.gr/wp-content/uploads/2026/08/Assessment-of-Greeces-mobile-usage-and-revenue-in-an-EU-context-by-Tefficient-for-EETT-8-Oct-2025.pdf)
- Greek usage: 12.5 GB per non-M2M subscription per month in 2024, below the median, while the top peer (31.9 GB) is about 3.6 times higher. No active MVNO existed at end-2024. The report's summary: Greeks pay a "standard monthly fee while consuming relatively less data and significantly more voice minutes". — [Tefficient Oct 2025](https://www.eett.gr/wp-content/uploads/2026/08/Assessment-of-Greeces-mobile-usage-and-revenue-in-an-EU-context-by-Tefficient-for-EETT-8-Oct-2025.pdf)

**EETT-commissioned consumer surveys (aggregates in PDF only)**
- The Market Studies & Research page lists:
  - "Consumer Research on the Use of Unlimited Mobile Data Plans" (Dec 2023, Greek)
  - "Research on Consumer Attitudes and Experiences with Telecom Providers' Customer Service Channels" (Mar 2025, Greek)
  - two Tefficient market studies (Feb 2024 and Oct 2025)
  - Source: [EETT Market Studies & Research](https://www.eett.gr/en/consumers/competion/market-studies-research/)
- **Unlimited-data survey, Dec 2023**
  - Method: hybrid phone + online panel, nationwide, smartphone owners aged 18–65, n=1,005, fieldwork Nov–Dec 2023.
  - Among users with unlimited-data plans:
    - Monthly cost: **up to 20 EUR 6%, 21–25 EUR 17%, over 25 EUR 70%**, don't know 7%
    - Contract 99%
    - Provider: Cosmote 38%, Vodafone 43%, Nova 19%
    - 53% bought in a bundle
    - Purchase channel: physical store 43%, call centre 31%, e-shop 13%
  - "Informed" index by age: 18–24 57%, 25–34 57%, 35–44 49%, 45–54 38%, 55–65 32%.
  - Source: [EETT unlimited-data survey (PDF)](https://www.eett.gr/wp-content/uploads/2026/08/Έρευνα-Απεριόριστα-Δεδομένα.pdf)
- **Customer-service-channels survey, Mar 2025**
  - Method: hybrid phone + online, men and women aged 18–65, n=1,203, fieldwork March 2025.
  - Contains breakdowns by age, social class and islands. For example, call centre 35% leads on the islands, ahead of app 32% and stores 26%.
  - Source: [EETT channels survey (PDF)](https://www.eett.gr/wp-content/uploads/2026/08/Έρευνα-Κανάλια.pdf)

**Open data and licence**
- EETT's open-data page says the listed datasets are provided "without imposing any conditions on their re-use by licensing or charging fees", under Decision 1178/024/15-12-2025, and points to data.gov.gr. — [EETT Open data](https://www.eett.gr/en/open-data/)
- **Live call:** the data.gov.gr CKAN API for organisation `eett-2026` returns 16 datasets. They are registries (providers, postal shops, numbering, domain registrars, trust services), the HYPERION broadband speed measurements, and telecom quality indices E01/E02, E03, S01, S02/S03, K01, X01. Resources are CSV/JSON/ZIP, and the HYPERION CSV carries `licence = CC_BY_4_0`. No market-share, ARPU or price dataset is among them. — [data.gov.gr EETT org](https://data.gov.gr/organization/eett-2026); API: `https://data.gov.gr/api/3/action/package_search?fq=organization:eett-2026`
- EETT website terms of use: "Information included in this web site is intended for personal use only. You must not permanently store or otherwise copy contents for commercial gain. All rights, including copyright… are owned by EETT." — [EETT Terms of use](https://www.eett.gr/en/terms-of-use/)

### Inferences
- **Price anchor for 25 EUR/month:**
  - Average post-paid revenue is about 17.5 EUR/month per connection (excluding VAT, presumably, and averaged over bundles and business lines).
  - In the 2023 survey, 70% of unlimited-data users paid more than 25 EUR.
  - So 25 EUR sits near or just below the typical unlimited-plan price point, and well above average post-paid ARPU. A synthetic prior could treat 25 EUR as "mid-to-premium standalone" for limited plans and "competitive" for unlimited plans.
- Provider shares (OTE ~44–50%, Vodafone ~34%, Nova ~21%), together with the absence of MVNOs at end-2024, give a prior on incumbency and switching. A new entrant's 25 EUR plan would face a three-MNO market.
- The website-terms restriction means EETT PDF figures should be used as calibration targets with citation, not bulk-copied into a commercial product. Written permission from EETT would remove the ambiguity.

### Gaps
- I could not enumerate the semi-annual market data files (dynamic page) or confirm whether they are XLSX.
- The surveys' fieldwork agency is not legible in the PDF text, because the logo is an image.
- No EETT microdata is published. The surveys exist as aggregate slides only.
- Whether ARPU figures include VAT is not confirmed in the extracted text.
- The website terms appear to conflict with the open-data statement, which applies only to the listed datasets. This is unresolved without asking EETT.

---

## Q2. EU Consumer Conditions Scoreboard / Consumer Conditions Survey / Consumer Markets Scoreboard (DG JUST)

### Takeaway
The latest edition is the **Consumer Conditions Scoreboard 2025** (published 14 Mar 2025), based on the **2024 Consumer Conditions Survey** (Ipsos, fieldwork Nov 2024). It provides:
- a Greece factsheet
- a "full survey data set" as two XLSX volumes
- an interactive dashboard

Licence: EC reuse policy, CC BY 4.0. Greek consumer trust is far below the EU on several items. The market-by-market **Consumer Markets Scoreboard / Market Monitoring Survey** (mobile, internet, energy and so on) is no longer featured on the current key-consumer-data page. The latest found is the 2019–2020 MMS overview.

### Cited Findings
- **Scoreboard and survey basics:** the 2025 Scoreboard is biennial, covering EU27 plus IS and NO. It is built on the 2024 CCS (Ipsos, Nov 2024 fieldwork, representative in each member state). Topics: confidence, knowledge, online purchasing, product safety, problems/complaints, unfair practices, cost of living, sustainable consumption. — [EC key consumer data](https://commission.europa.eu/strategy-and-policy/policies/consumers/consumer-protection-policy/key-consumer-data_en)
- **Where to get the data:**
  - Full data set, two XLSX files:
    - `…/document/download/2394e34d-fc74-4290-9678-60f2a16c02fe_en?filename=CCS 2024_volume_AP.xlsx`
    - `…/beb87916-bb14-4934-9601-08ab49cb12a0_en?filename=CCS 2024_volume_B.xlsx`
    - Landing page: [CCS 2024 full data set](https://commission.europa.eu/publications/2024-consumer-conditions-survey-full-data-set_en)
  - Greece factsheet: `…/e3ed8322-eb20-4355-b013-c21674f014e9_en?filename=Greece factsheet.pdf` — [Country factsheets](https://commission.europa.eu/publications/2024-consumer-conditions-survey-country-factsheets_en)
  - Methodology metadata PDF and a Qlik dashboard are also listed — [EC key consumer data](https://commission.europa.eu/strategy-and-policy/policies/consumers/consumer-protection-policy/key-consumer-data_en)
- **Greece factsheet, 2025 edition (2024 data).** Values are parsed from the PDF layout. Each row shows the EU-27 average first, then Greece; the "change since 2022" refers to Greece. Treat the row-to-number mapping as **likely but layout-dependent**.
  - "Retailers and service providers respect your rights": EU 70 vs **Greece 44 (−22.1pp)**
  - Trust in public authorities to protect rights: EU 61 vs **Greece 41 (−14.8pp)**
  - Trust in NGOs/consumer organisations: EU 63 vs **Greece 39**
  - "Most non-food products are safe": EU 68 vs **Greece 59**
  - Environmental claims reliable: EU 50 vs **Greece 40**
  - Have not made any online purchase in the past 12 months: EU 24 vs **Greece 25 (−7.4pp)**
  - Bought online from outside the EU: EU 27 vs **Greece 32 (+14.0pp)**
  - "Experienced consumer reviews that do not appear genuine" (online buyers): EU 66 vs **Greece 73**
  - Source for all rows: [Greece factsheet (PDF)](https://commission.europa.eu/document/download/e3ed8322-eb20-4355-b013-c21674f014e9_en?filename=Greece%20factsheet.pdf)
- **Problems and complaints (same factsheet):**
  - Of those who took action after a problem, about 83–85% complained to the retailer or provider.
  - Reasons for not acting rose sharply since 2022, by roughly +13 to +20pp. Examples: "not sure of your rights" +19.7pp; "tried before but not successful" +19.9pp.
  - Source: [Greece factsheet](https://commission.europa.eu/document/download/e3ed8322-eb20-4355-b013-c21674f014e9_en?filename=Greece%20factsheet.pdf)
- **Earlier editions and the Market Monitoring Survey:** the previous-editions page lists the CCS 2023 scoreboard, the CCS 2022 executive summary, the energy-prices/inflation survey data tables per country, and **"mms-overview-report-19-20_en.pdf"** (Market Monitoring Survey 2019–2020). — [Previous scoreboards & surveys](https://commission.europa.eu/strategy-and-policy/policies/consumers/consumer-protection-policy/evidence-based-consumer-policy/previous-consumer-conditions-scoreboards-and-surveys_en)
- **Licence:** "Unless otherwise indicated… content owned by the EU on this website is licensed under the Creative Commons Attribution 4.0 International (CC BY 4.0) licence. This means that reuse is allowed, provided appropriate credit is given and changes are indicated." This implements Commission Decision 2011/833/EU. — [EC legal notice](https://commission.europa.eu/legal-notice_en)

### Inferences
- The CCS gives trust and complaint-propensity priors for Greek consumers. Greeks are markedly less trusting of retailers and authorities than the EU average, and more exposed to extra-EU online purchases and fake reviews. These are useful for modelling scepticism toward a new mobile plan or subscription offer.
- The CCS XLSX volumes are aggregate cross-tabs, not microdata. Their country × demographic breakdowns could not be inspected in this session (see Gaps).
- For market-specific ratings (mobile, internet, energy, banking), the 2019–2020 MMS is the most recent EU source found. It is old, so pre-2020.

### Gaps
- Downloading the CCS XLSX via curl returned an HTML bot-check page instead of the file, so I could not inspect the volumes for Greek demographic cross-breaks.
- I did not check whether a post-2020 Consumer Markets Scoreboard or MMS edition exists, or whether a 2026 CCS fieldwork round is planned.

---

## Q3. Flash/Special Eurobarometers (e-communications, digital, consumers)

### Takeaway
The 2025 e-communications module (QC) was fielded in **Eurobarometer 103.1 (Jan–Feb 2025, Verian, DG CNECT)**, with the report listed as **Special Eurobarometer 560 "e-Communications and the Digital Single Market"**. Microdata is at GESIS as **ZA8906** (pre-release v1.0.0, 2026-06-09, DOI 10.4232/1.14734). The previous comparable wave is EB 94.2 (ZA7750, 2020/21), and the 2017 fieldwork produced SEB 462 (published 2018).

I could not verify Greek figures or the GESIS terms of use in this session.

### Cited Findings
- EB 103.1 (ZA8906) carries the QC "e-Communications and Digital Single Market" module, which partly replicates EB 94.2 (ZA7750). Data are supplied by Verian Public, and the linked publication is Special Eurobarometer 560. Status: archive pre-release v1.0.0 (2026-06-09), DOI 10.4232/1.14734. — [GESIS Eurobarometer Data Service](https://www.gesis.org/index.php?id=29500) (via search snippet; direct fetch returned 403)
- SEB 462 "E-Communications and the Digital Single Market" (fieldwork April 2017, published 27 July 2018) covers household uptake of electronic communications services in EU28. — [EC digital-strategy library](https://digital-strategy.ec.europa.eu/en/library/e-communications-and-telecom-single-market-special-eurobarometer-report)

### Inferences
- SEB 560 / ZA8906 is likely the richest recent source of household-level Greek telecom attitudes. Expect items on bundles, switching and mobile internet usage limits, with n≈1,000 per country, as is standard for Special EB. If its licence permits, it is the best candidate for respondent-level priors.
- Report text and annex tables published on europa.eu fall under CC BY 4.0, per the EC legal notice cited in Q2. GESIS microdata normally carries academic-use terms (see Gaps).

### Gaps
- Greek results from SEB 560 were not retrieved.
- The GESIS access category for ZA8906 was not verified because the page returned 403. From prior knowledge, Eurobarometer data at GESIS are usually "access category A: academic research and teaching"; this is **unverified** here. Commercial use would need checking with GESIS or the Commission.
- I did not check Flash EBs on cross-border trade or consumer attitudes, or the Digital Decade EB, for Greek tables.

---

## Q4. European Commission Business and Consumer Surveys (DG ECFIN BCS): Greek consumer confidence by demographic group

### Takeaway
This is the strongest source of **demographic-segmented sentiment priors** for Greece. Greek series run monthly from 1985 to Sep 2026 (IOBE is the partner institute). They are split by:
- income quartile (RE1–RE4)
- education (ED1–ED3)
- age (AG1–AG4)
- sex
- a new ISCO-08 occupation breakdown (WO1–WO10) plus full-time/part-time (WR1–WR2)

Each split covers all 11 monthly questions, which include major-purchase intentions and savings. Downloads are free XLSX ZIPs at fixed URLs that follow a version pattern (`nace2_ecfin_YYMM`). A beta data browser with an API also exists. Licence: EC CC BY 4.0 under the general legal notice; the BCS download page itself carries no specific statement.

### Cited Findings
- **Download files on the BCS time-series page** (all under `https://ec.europa.eu/economy_finance/db_indicators/surveys/documents/series/nace2_ecfin_2609/`):
  - `consumer_total_sa_nace2.zip`
  - `consumer_total_nsa_nace2.zip`
  - `consumer_subsectors_nace2.zip` (categories)
  - `consumer_inflation_nace2.zip`
  - The page also notes a new BCS data browser offering "API access for automated data retrieval" and XLSX/TSV/SDMX-CSV downloads, in a testing phase: `https://webgate.ec.europa.eu/ecfin/redisstat/databrowser/explore/all/BCS?lang=en`
  - Source: [ECFIN BCS time series](https://economy-finance.ec.europa.eu/economic-forecast-and-surveys/business-and-consumer-surveys/download-business-and-consumer-survey-data/time-series_en)
- **Live call, contents of `consumer_subsectors_nace2.zip`** (24 Sep 2026):
  - `consumer_subsectors_sa_m_nace2.xlsx` has sheets RE1–RE4, PR0–PR9, ED1–ED3, AG1–AG4, MAL, FEM.
  - `consumer_occupation_nsa_m_nace2.xlsx` has sheets WO1–WO10, WR1, WR2.
  - Greek columns use keys such as `CONS.EL.RE1.COF.BS.M`. Greek data run Jan 1985 to Sep 2026.
  - Category definitions:
    - RE1–RE4: household income quartiles
    - ED1/2/3: primary/secondary/further
    - AG1 16–29, AG2 30–49, AG3 50–64, AG4 65+
    - WO1 managers and professionals (ISCO 11–14, 21–26) … WO5 operators and elementary; WO6 total employed; WO7 unemployed; WO8 retired; WO9 other (students, homemakers); WO10 total non-employed
  - Questions: COF (confidence), Q1–Q9, Q11 (savings), Q12 (financial situation statement); quarterly Q13–Q15.
  - Source: [BCS categories ZIP](https://ec.europa.eu/economy_finance/db_indicators/surveys/documents/series/nace2_ecfin_2609/consumer_subsectors_nace2.zip)
- **Live call, Greek values for Sep 2026 (SA balances):**
  - Total confidence −41.6. Q8 "major purchases at present" −48.1. Q9 "major purchases next 12 months" −35.4. Q11 savings −61.6. Q5 perceived price trends +73. Quarterly Q14 −92.3 and Q15 −75.8. — [BCS consumer totals ZIP](https://ec.europa.eu/economy_finance/db_indicators/surveys/documents/series/nace2_ecfin_2609/consumer_total_sa_nace2.zip)
  - Confidence (COF) by group:
    - Income: RE1 (lowest quartile) −47.5, RE2 −43.2, RE3 −37.9, RE4 −39.9
    - Education: ED1 −45.3, ED2 −42.4, ED3 −39.8
    - Age: AG1 (16–29) −41.2, AG2 −39.3, AG3 −43.1, AG4 (65+) −45.5
    - Sex: male −40.8, female −42.5
  - Q9 major purchases next 12 months: RE1 −34.3 vs RE4 −33.6.
  - Source: [BCS categories ZIP](https://ec.europa.eu/economy_finance/db_indicators/surveys/documents/series/nace2_ecfin_2609/consumer_subsectors_nace2.zip)
- **Live call, Greek occupation breakdown (NSA, Sep 2026):** COF WO1 managers/professionals −37.6; WO2 technicians −44.9; WO3 clerical/sales −40.4; WO5 elementary −42.1; WO7 unemployed −42.5; WO8 retired −44.8; WO9 students/other −37.9; WR2 part-time −37.3. — [BCS categories ZIP](https://ec.europa.eu/economy_finance/db_indicators/surveys/documents/series/nace2_ecfin_2609/consumer_subsectors_nace2.zip)
- **Old occupation codes discontinued:** the legacy PR0–PR9 series are "NA" for Greece. The INFO sheet says that "due to a revision of the breakdown by occupation… as of May 2016, time series corresponding to consumer categories PR0 to PR9 are discontinued". The WO/WR files replace them. The partner institute in Greece changed in May 2008, so expect a possible break. — [BCS categories ZIP, INFO sheet](https://ec.europa.eu/economy_finance/db_indicators/surveys/documents/series/nace2_ecfin_2609/consumer_subsectors_nace2.zip)
- **Price-perception answer shares:** the NSA subsector files for Q5/Q6 (`consumer_subsectors_nsa_nace2.zip`) give answer shares PP/P/E/M/MM/N plus balance B by group. For Greece RE1, Sep 2026: "risen a lot" 68.85%, balance 73.1. — [BCS NSA subsectors ZIP](https://ec.europa.eu/economy_finance/db_indicators/surveys/documents/series/nace2_ecfin_2609/consumer_subsectors_nsa_nace2.zip)
- **Licence:** the BCS download page has no specific statement. The EC general legal notice applies CC BY 4.0 to EU-owned content on Commission websites. — [EC legal notice](https://commission.europa.eu/legal-notice_en)

### Inferences
- BCS balances by income quartile × age × education × occupation give a ready-made **sentiment and purchase-intention prior per demographic cell** for Greek synthetic respondents. They are updated monthly and long time series are available.
- Mapping: draw a respondent's propensity for a "major purchase" or "savings" from the balance for their income quartile, age band and occupation cell. Joint cells are not published; only marginal breakdowns exist.
- Spot new ZIPs each month by changing `nace2_ecfin_YYMM`, e.g. 2610 for October 2026.

### Gaps
- Microdata is not public; IOBE holds it. Cross-tabs such as age × income are not available.
- The new BCS API's endpoint syntax and terms were not tested.
- The quantitative inflation-perception file (`consumer_inflation_nace2.zip`) was not inspected.

---

## Q5. Eurostat ICT household survey (e-commerce, subscriptions, food delivery, mobile internet)

### Takeaway
Eurostat's isoc tables give Greek online-purchase incidence by category, including:
- film/series/sports streaming subscriptions
- music streaming
- mobile/internet subscriptions bought online
- restaurant food delivery
- utilities subscriptions bought online

Breakdowns cover age, education, sex, employment status and urbanisation degree, and some tables have NUTS regions. **Income-quartile cells are empty for Greece.** There is an open REST/JSON API, and commercial reuse is allowed under CC BY 4.0.

### Cited Findings
- **Licence:** "Reuse of statistical data, metadata, and publications for commercial or non-commercial purposes is authorised, provided you acknowledge the source." No written licence is needed. Exceptions: non-Eurostat-source data, and non-EU/EFTA/candidate country data. — [Eurostat copyright notice](https://ec.europa.eu/eurostat/web/main/help/copyright-notice)
- **Live call, API base:** `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/{dataset}?geo=EL&format=JSON`
  - `isoc_ec_ib20` (2020+, updated 2026-04-17)
  - `isoc_ec_ibgs` (goods/services, 47 indicators)
  - `isoc_ci_ac_i` (58 internet-activity indicators, 2025)
  - `isoc_ec_ibuy` (2002–2019, discontinued)
  - `isoc_ci_im_i` (mobile internet, 2011–2019, discontinued)
  - `isoc_r_blt12_i` (regional, 2025)
  - `isoc_ec_eseln2` (enterprise e-sales, 2025)
  - Source: [Eurostat API](https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/isoc_ec_ib20?geo=EL&format=JSON)
- **Live call, `isoc_ec_ib20`, 2025, Greece vs EU27, % of individuals aged 16–74:**
  - Bought online in the last 12 months: **68.0** vs 73.6
  - Bought in the last 3 months: 62.9 vs 62.4
  - Never bought: 19.0 vs 15.3
  - 6+ purchases in 3 months: **27.2** vs 20.1
  - Source: [Eurostat isoc_ec_ib20](https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/isoc_ec_ib20?geo=EL&format=JSON)
- **Live call, `isoc_ec_ibgs`, Greece 2025, last 3 months, % of individuals:**
  - Paid subscription to film/series/sports streaming (I_BFLMS2): **35.83**
  - Music streaming subscription (I_BMUSS2): 10.36
  - Gaming streaming subscription: 4.58
  - News subscription: 0.92
  - Health/fitness app: 1.30
  - **Bought internet or mobile-phone subscriptions online (I_BSIMC): 26.48**
  - Utilities (electricity, water, heating) bought online (I_BSUTIL): 13.31
  - Event tickets: 38.86
  - Physical goods: 60.74
  - Source: [Eurostat isoc_ec_ibgs](https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/isoc_ec_ibgs?geo=EL&time=2025&unit=PC_IND&ind_type=IND_TOTAL&format=JSON)
- **Live call, streaming subscription (I_BFLMS2) by group, Greece 2025:**
  - Age: 16–24 50.3; 25–34 53.8; 35–44 44.0; 45–54 37.3; 55–64 27.8; 65–74 8.3
  - Education: low (ISCED 0–2) 14.1; high (ISCED 5–8) 51.2
  - Urbanisation: cities 41.3; rural 24.0
  - Music streaming (I_BMUSS2): 16–24 25.4; 65–74 1.8; low education 1.8; high education 16.5
  - Source: [Eurostat isoc_ec_ibgs](https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/isoc_ec_ibgs?geo=EL&time=2025&indic_is=I_BFLMS2&format=JSON)
- **Live call, food delivery from restaurants (I_BFDR), Greece:**
  - Trend: 10.2 (2020), 15.5 (2021), 20.5 (2022), 21.3 (2023), **34.6 (2024)**; EU27 2024: 19.8
  - Not asked in 2025, because the module rotates.
  - 2024 by group: age 16–24 46.1, 25–34 **58.9**, 35–44 43.0, 45–54 34.3, 55–64 22.9, 65–74 9.5; low education 18.1, high education 54.5; cities 43.6, rural 21.0
  - Food from stores/meal kits (I_BFDS) 2024: 15.3 vs EU 11.0
  - Source: [Eurostat isoc_ec_ibgs](https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/isoc_ec_ibgs?geo=EL&indic_is=I_BFDR&format=JSON)
- **Breakdown codes available in `isoc_ec_ibgs`:** age bands, sex × age, education (I0_2, I3_4, I5_8), employment status (SAL_SELF_FAM, UNE, STUD, RETIR_OTHER), ICT occupation, urbanisation (IND_DEG1–3), disability, citizenship, and income quartiles HHI_Q1–Q4. **The HHI_Q1–Q4 cells returned null for Greece in 2024 and 2025.** — [Eurostat isoc_ec_ibgs](https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/isoc_ec_ibgs?geo=EL&format=JSON)
- **Live call, regional:** `isoc_r_blt12_i` returns 2025 values for EL and NUTS-1 regions EL3/EL4/EL5/EL6. The EL total for "ordered online in 12 months" is 68.0, consistent with ib20. — [Eurostat isoc_r_blt12_i](https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/isoc_r_blt12_i?geo=EL&format=JSON)

### Inferences
- These are the cleanest commercially reusable priors for subscription and e-commerce propensity by age and education in Greece.
  - About 36% of Greeks aged 16–74 pay for video streaming, but only about 8% of those aged 65–74.
  - Restaurant delivery use in Greece (35%) is far above the EU average and peaks among 25–34s (59%).
- About 26% bought a mobile or internet subscription online in 3 months. This is a prior for the share of the market reachable through digital-only sales of a 25 EUR plan.
- For income-based effects in Greece, use BCS income quartiles (Q4) or HBS quintiles (Q6) instead, since Eurostat ICT income cells are suppressed for Greece.

### Gaps
- I did not pull regional values per NUTS region in a mapped form, because the JSON indexing needs proper decoding.
- Microdata from the EU ICT survey is available only for research under Eurostat's microdata access; it was not checked here.

---

## Q6. Eurostat HBS and prices (HICP); ELSTAT HBS

### Takeaway
- **Eurostat HBS:** Greek tables exist for 2020, the latest EU wave, by COICOP and income quintile. Commercially reusable.
- **ELSTAT national HBS 2024** (published Sep 2025, n=6,198 households): mean spend 1,724.54 EUR/month, on the new COICOP-HBS 2018 classification.
- **Eurostat HICP:** live through Sep 2026, on ECOICOP v2 (`prc_hicp_minr`).

### Cited Findings
- **Live call, HBS tables:**
  - `hbs_str_t211`: structure by COICOP, 236 codes, ‰, EL latest 2020
  - `hbs_str_t223`: by income quintile QU1–QU5 × 150 COICOP codes, EL 2020
  - `hbs_exp_t133`: mean expenditure by quintile in PPS per household or adult equivalent, EL 2020
  - Source: [Eurostat hbs_str_t223](https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/hbs_str_t223?geo=EL&format=JSON)
- **Live call, HICP, Sep 2026, annual rate of change (RCH_A), Greece vs EU27:**
  - All items **5.1** vs 3.8
  - Electricity, gas and other fuels (CP045) **26.6** vs 8.2
  - Information and communication (CP08) **−0.9** vs 2.5
  - Information and communication services (CP083) **−1.2** vs 2.3
  - Note: the old `prc_hicp_manr` stops at 2025-12; `prc_hicp_minr` (ECOICOP ver.2, `coicop18`) is the live table.
  - Source: [Eurostat prc_hicp_minr](https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_minr?geo=EL&geo=EU27_2020&time=2026-09&unit=RCH_A&format=JSON)
- **ELSTAT HBS 2024:**
  - Mean annual household purchases 20,694.48 EUR (1,724.54/month), +3.6% nominal vs 2023, sample 6,198 households.
  - Renters spend 17.1% on rent.
  - The poorest 20% spend 55.9% on food and housing vs 24.7% for the richest 20%.
  - Attica 24,363 EUR/year vs Sterea Ellada 14,215.
  - Redesigned to COICOP-HBS 2018 with 13 divisions, so comparisons with earlier years are not like-for-like.
  - Source: [Powergame.gr summarising ELSTAT, Sep 2025](https://www.powergame.gr/ikonomia/1115772/elstat-sta-1-724-evro-i-mesi-miniaia-dapani-to-2024-gia-ta-ellinika-noikokyria/) (secondary; the primary release is on statistics.gr)

### Inferences
- **Telecom wallet share:** the HBS quintile tables (`hbs_str_t223`, CP083 for communication services) give the share each quintile spends on telecom. Combined with the 1,724 EUR/month mean, this yields an affordability prior. A 25 EUR plan is about 1.4% of the mean household budget, a much larger share for Q1, and per line in multi-SIM households.
- **Price-sentiment context:** in Sep 2026 Greek energy inflation (~27% y/y) is much higher than telecom-services inflation, which is negative. This is relevant context for synthetic respondents' price sensitivity, and consistent with BCS Q5 price-perception balances around +73.

### Gaps
- **ELSTAT itself:** statistics.gr timed out from this environment, so I could not verify ELSTAT's terms of use, its HBS table URLs, or its 2025 ICT-household release.
- **ELSTAT microdata (HBS, SILC):** available to researchers under ELSTAT's microdata procedures (unverified here).
- **Not checked:** ELSTAT's retail trade turnover index and online-shopping releases.

---

## Q7. Bank of Greece: payments statistics, HFCS; open data terms

### Takeaway
BoG publishes **annual payment statistics** as XLSX (EN/EL) via data.gov.gr, with resource licence metadata **CC BY 4.0**. The dataset notes say "statistical and research use", which conflicts somewhat with that licence tag. The BoG site blocked direct file download from this environment with a 403. HFCS Greek aggregates and microdata were not verified.

### Cited Findings
- **Live call, data.gov.gr:** dataset `bank-of-greece-payments-statistics` ("Στατιστικές πληρωμών"), modified 2026-10-26.
  - Resources: `https://www.bankofgreece.gr/OpenDataSetFilesALL/PAYMENTSSTATISTICS/BoG_PayStatsAnnual_EN_2025-07-30.xlsx` (plus earlier vintages and Greek versions).
  - Resource licence field: `CC_BY_4_0`.
  - Notes: card and terminal counts are end-of-period; transaction volumes and values are period totals.
  - Terms of use (ΟΡΟΙ ΧΡΗΣΗΣ): "Τα δεδομένα παρέχονται για στατιστική και ερευνητική χρήση και υπόκεινται σε αναθεωρήσεις…" ("The data are provided for statistical and research use and are subject to revisions…").
  - Source: [data.gov.gr BoG payments statistics](https://data.gov.gr/dataset/bank-of-greece-payments-statistics)
- **Other BoG datasets on data.gov.gr (54 in total, live call):**
  - retail and office price/rent indices
  - apartment price indices
  - bank interest rates on new deposits and loans
  - travel receipts and payments
  - MFI balance sheets and credit
  - Source: [data.gov.gr Bank of Greece org](https://data.gov.gr/organization/trapeza-tis-ellados)
- **Press figures from BoG data:**
  - 2024 card transactions: 2.511bn (+14%), value about 112bn EUR (+9%); debit cards 93% of transactions.
  - H1 2025: 1.325bn transactions, 57bn EUR (−5%), per BoG's Oct 2025 Financial Stability Report.
  - Source: [OT.gr](https://www.ot.gr/2025/05/20/english-edition/card-transactions-on-the-rise-in-greece/); [To Vima](https://www.tovima.com/finance/greeks-tighten-their-wallets-as-card-spending-drops/) (secondary)

### Inferences
- BoG payments data give **market-level** priors: card ubiquity and the dominance of debit cards. They give no demographic breakdowns. For persona-level payment behaviour, the ECB SPACE study or the ECB CES (Q9) is needed.

### Gaps
- The BoG XLSX could not be opened (403), so I did not check whether e-commerce or remote card payments are split out.
- HFCS: Greece participates in the Eurosystem HFCS, but Greek aggregates and access terms were not verified this session. From prior knowledge, HFCS microdata is research-only via ECB application; this is **unverified**.
- The ECB SPACE (cash vs card by country) study was not checked.

---

## Q8. Price observatories: e-katanalotis / General Secretariat of Commerce & Consumer Protection; fuel prices

### Takeaway
I found **no public API for e-katanalotis**: the site returned 403 to programmatic access, and no developer documentation turned up. The Ministry of Development publishes fortnightly consumer-product price observations ("Τιμές προϊόντων") and the liquid-fuel price observatory on data.gov.gr, with **CC BY 4.0** resource metadata. Both are mostly ZIP/PDF bulletins, not an API.

### Cited Findings
- **Live call, product prices:** dataset `times-proiontwn` ("Τιμές προϊόντων"), publisher Ministry of Development (org `yttoypreio-oikonomiae-anatttyehe-kai-toypiemoy`).
  - Description: "Περιέχονται οι τιμοληψίες που κάνει η Γενική Γραμματεία Εμπορίου και Προστασίας Καταναλωτή για τις τιμές καταναλωτικών προϊόντων ανά δεκαπενθήμερο" ("Contains the price observations carried out by the General Secretariat of Commerce and Consumer Protection on consumer product prices, every two weeks").
  - Resources: a ZIP on data.gov.gr, plus a link to `http://www.mindev.gov.gr/category/times-proionton-teleutaia-arxeia/`; licence CC_BY_4_0. Created 2025-11-18, modified 2026-04-28.
  - Source: [data.gov.gr times-proiontwn](https://data.gov.gr/dataset/times-proiontwn)
- **Live call, fuel prices:** dataset `parathrhthrio-timwn-ygrwn-kaysimwn` ("Παρατηρητήριο Τιμών Υγρών Καυσίμων"). Fuel prices by prefecture and fuel type, as PDF bulletins since 27/4/2012, linked to fuelprices.gr; licence CC_BY_4_0. — [data.gov.gr fuel observatory](https://data.gov.gr/dataset/parathrhthrio-timwn-ygrwn-kaysimwn)
- **e-katanalotis scope, per press:**
  - Daily supermarket prices for a basket of over 3,000–3,500 FMCG codes, taken from chains' central e-shops and updated daily at 10:00.
  - Planned or added features include price history and weekly promotions.
  - Electricity and gas tariffs from all providers, and bank deposit/loan rates, were added to the platform.
  - Source: [Powergame](https://www.powergame.gr/ikonomia/628613/e-katanalotis-pano-apo-3-500-kodikoi-sti-nea-platforma/); [Powergame: energy tariffs and rates](https://www.powergame.gr/ikonomia/425831/sto-e-katanalotis-ta-timologia-energeias-kai-ta-epitokia-katatheseon/); [Odigos tou Politi](https://www.odigostoupoliti.eu/anavathmisi-tou-e-katanalotis-me-istoriko-timon-ana-proion-kai-ana-souper-market/)
- **Live call:** `https://e-katanalotis.gov.gr/` returned HTTP 403 from this environment. — (live check, 27 Oct 2026)

### Inferences
- For food and grocery price priors, use the fortnightly GSCCP observations on data.gov.gr (CC BY 4.0). Scraping e-katanalotis would be legally and technically uncertain: there is no published API or terms, and it blocks bots.
- The energy-tariff and bank-rate listings on e-katanalotis are relevant priors for energy and banking scenarios, but I found no machine-readable export.

### Gaps
- I did not find e-katanalotis's own terms of use or an open-data endpoint.
- I did not inspect the internal file format of the `times-proiontwn` ZIP.
- RAAEY (energy regulator) tariff data and the Hellenic Consumer Ombudsman's annual complaint statistics were not checked.

---

## Q9. ECB Consumer Expectations Survey (CES): Greece coverage and access

### Takeaway
**Greece has been in the CES since the December 2023 wave**, which expanded the survey from 6 to 11 countries. The Greek aggregates are on the ECB Data Portal API (dataflow `CES`), with about 960 Greek respondents per month. They are country totals only: age and income breakdowns are published only for the euro-area aggregate. CES microdata, which include a country variable, is downloadable but **restricted to scientific, non-commercial use**.

### Cited Findings
- The ECB press release of 6 Feb 2024 announced that Ireland, Greece, Austria, Portugal and Finland were added. That took the survey from 6 to 11 countries, covering 96% of euro-area GDP, with results recomputed from April 2022. — [ECB press release 6 Feb 2024](https://www.ecb.europa.eu/press/pr/date/2024/html/ecb.pr240206~3fecc82626.en.html)
- **Live call, series keys:** SDMX dataflow `ECB:CES(1.0)` with dimensions FREQ, REF_AREA, CES_BREAKDOWN, CES_CUSTOM, CES_VARIABLE, CES_ANSWER, CES_DENOM.
  - Of 3,912 series keys, 138 are for GR, all with breakdown `ALL`. The age (AGE_18_34/35_54/55_70) and income-quintile (INC_Q_1–5) breakdowns exist only for euro-area aggregate Z18.
  - Source: [ECB Data API](https://data-api.ecb.europa.eu/service/data/CES?detail=serieskeysonly&format=csvdata)
- **Live call, Greece Sep 2026 weighted medians:**
  - Perceived inflation over the past 12 months (C1020): 10%
  - Expected inflation over the next 12 months (C1120): 7.8%
  - Expected inflation 3 years ahead (C1220): 6.1%
  - Expected household spending growth over the next 12 months (C6120): 4.9%
  - Unweighted Greek responses: about 959–961 per month
  - Source: [ECB Data API CES/M.GR.ALL.T.C1120.NUM_VAR.WM](https://data-api.ecb.europa.eu/service/data/CES/M.GR.ALL.T.C1120.NUM_VAR.WM?lastNObservations=1&format=csvdata)
- **Microdata:**
  - Published quarterly since Nov 2022, with background, monthly and quarterly modules.
  - Downloading means accepting the terms: "You will not disclose or otherwise employ the data for commercial purposes", plus use "for scientific purposes" only.
  - Source: [ECB CES data & methodology](https://www.ecb.europa.eu/stats/ecb_surveys/consumer_exp_survey/html/data_methodological.en.html)
- **Reuse of aggregates:** the general ECB website terms allow "free use of the information" if the ECB is cited, modifications are stated, and buyers of sold documents are told the data are free. There is no explicit commercial ban for aggregates. — [ECB disclaimer & copyright](https://www.ecb.europa.eu/services/using-our-site/disclaimer/html/index.en.html)

### Inferences
- For a commercial synthetic-respondent product, use **CES Greek aggregates** (inflation, spending and income expectations; quantitative medians and shares) as country-level priors, with ECB attribution.
- CES microdata (Greek respondents, with age, income and spending variables) would be ideal for joint distributions, but its terms bar commercial use. Use it only for non-commercial research or validation, or seek ECB permission.

### Gaps
- The Greek CES variable list was not fully mapped to consumption-category items, such as planned spending on specific services.
- CES topical modules (e.g., payments or digital euro) were not checked for Greek detail.
