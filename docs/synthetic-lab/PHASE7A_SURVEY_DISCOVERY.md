# Phase 7A — Real Greek Survey Challenge: Survey Discovery

Retrieved: 2026-10-29 (discovery agent). Companion registry: `PHASE7A_SOURCE_REGISTRY.csv` (27 rows).

**Blindness statement.** This document and the registry contain **no outcome information**: no percentages, rankings, leads, vote shares or "majority said" statements. They hold only titles, organisations, URLs, dates, sample sizes, methods and structural notes. Some article URLs had result figures or outcome wording in their slugs. Those URLs are withheld and described in words.

**Disclosure about incidental exposure.** While searching, the discovery agent saw a few headline figures without asking for them. They came from search-engine result summaries and press article titles, and from one text search of the FL585 report body. They concern the GPO October poll, the MRB and Prorata September polls, the Opinion Poll ΕΣΥ survey, the Interview/Politic 29-Oct release, Special Eurobarometer 578 and FL585. **None were recorded here.** The main researcher must not read this agent's raw tool transcripts before predictions are frozen.

## 1. Contamination baseline (what the lab already has)

| Lab asset | What was checked | Cut-off found |
|---|---|---|
| `.synthetic-lab-data/persona/pdf/documents.json` (497 docs, metadata only) | org / date / title / URL for every candidate | Most recent: Pulse RC/ΣΚΑΪ 22.10.26; Opinion Poll/Action24 13-10; Interview/POLITICAL Oct (fw 6–10 Oct); IOBE BCS 02/10/2026; Focus Bari AI 2026 pt 1 (Oct) |
| `raw/sprint/polls_pdf/manifest.jsonl` + `failures.jsonl` | Sept–Oct 2026 entries | Same set as above; no October Metron, GPO, Marc, Alco or Prorata files |
| Wikipedia "Opinion polling for the next Greek parliamentary election" (revid 1381720550, retrieved 2026-10-28T17:25Z) | pollster and fieldwork-date cells only | Rows up to Pulse/Skai 17–20 Oct; includes **GPO/iefimerida 16–19 Oct**, **Metron/Mega 14–20 Oct**, Marc/Ant1 12–14 Oct, Alco/Flash 8–13 Oct, Opinion Poll/Action24 7–10 Oct, and all September polls. No Interview/Politic October row, no regional Attica poll |
| `lake/lake.sqlite` `studies` (titles/urls/status only; `distributions` not queried) | Eurobarometer and Greek studies 2025+ | **SP578, FL588 and SP574 are INTEGRATED with Greek results (2026-10-28)**. FL578 is VERIFIED. FL585 is absent (only the earlier FL545 and FL502 Youth & Democracy waves) |

Consequence: for any poll on the Wikipedia page, **vote intention and vote estimate are contaminated** and must be excluded from scoring. The other question blocks in those reports have not been ingested anywhere in the lab.

## 2. Search strategy and queries

1. **Lab inventory first.** I read the metadata listed above and built the cut-off table.
2. **Pollster sites, read directly with curl (link and metadata extraction only, numbers masked):**
   - interview.com.gr/ereynes-2026
   - opinionpoll.gr/research, plus individual research pages and the `api/public/research/<slug>/pdf` pattern
   - metronanalysis.gr Metron Forum page and its download link
   - iefimerida.gr article, to get the embedded PDF path
   - marc.gr research archive
   - alco.gr, realpolls.gr/surveys, mrb.gr/project/*, pulserc.gr
   - prorata.gr posts and social-surveys page
   - palmosanalysis.com, kaparesearch.com, eliamep.gr, eteron.org (WordPress REST post lists: titles and dates only)
3. **Social and consumer institutions:**
   - dianeosis.org RSS feed
   - Eurobarometer API `api/survey/get/one?id=3685…3730` (metadata and deliverable names only)
   - iobe.gr BCS page
   - ielka.gr WordPress REST post list
   - esee.gr, focusbari.gr (REST requires login, so not pursued)
   - Opinion Poll CX Benchmark page
4. **Web searches** (WebSearch, Greek and English). These were used sparingly because result summaries tend to quote figures:
   - "δημοσκόπηση Οκτώβριος 2026 pdf ολόκληρη η έρευνα"
   - "νέα δημοσκόπηση 27 Οκτωβρίου 2026"
   - "Opinion Poll liberal.gr ΕΣΥ έρευνα Οκτώβριος 2026"
   - "opinionpoll.gr έρευνα κοινής γνώμης Οκτώβριος 2026"
   - "δημοσκόπηση Prorata Οκτώβριος 2026"
   - "δημοσκόπηση MRB Open Οκτώβριος 2026"
   - "δημοσκόπηση GPO iefimerida Οκτώβριος 2026 pdf" (and a domain-restricted variant)
   - "Eurobarometer survey published October 2026 country factsheet Greece"
   - "ΙΕΛΚΑ έρευνα καταναλωτών Οκτώβριος 2026"
   - "ΙΝΕΜΥ ΕΣΕΕ έρευνα καταναλωτικής συμπεριφοράς 2026"
   - "έρευνα καταναλωτές δείγμα Οκτωβρίου 2026"
   - "Focus Bari νέα έρευνα Σεπτέμβριος Οκτώβριος 2026"
   - "ΠΑΝΕΛΛΑΔΙΚΗ ΠΟΛΙΤΙΚΗ ΕΡΕΥΝΑ ΟΚΤΩΒΡΙΟΣ 2026 pdf" (domain-restricted)
   - The dedomeno.gr poll list (fetched with a prompt restricted to pollster, client and date)
5. **PDF inspection.** PDFs were downloaded to `/tmp/claude-0/-home-user/d38e4d49-6dc9-5365-90d6-b293d1e9661d/scratchpad/p7/discovery/pdfs/` and inspected with two helper scripts (`.../p7/tools/pdfstruct.py` and `pagetitles.py`). The scripts print page counts, question lines with all digits masked, and counts of DK and subgroup labels. No result pages were printed.

## 3. Eligible surveys (4)

### P7A-POL-01 — Metron Analysis, Metron Forum October 2026 (eligible for non-vote-intention blocks)
- **Report:** https://metronanalysis.gr/download/28723/ (39 pp., PowerPoint export)
- **Page:** https://metronanalysis.gr/metron-forum-%CE%BF%CE%BA%CF%84%CF%8E%CE%B2%CF%81%CE%B9%CE%BF%CF%82-2026/
- **Fieldwork:** 14–20 Oct 2026. **Sample:** n=1,300 aged 17+ (885 CATI, of which 429 landline and 456 mobile, plus 415 online panel). RDD sampling for the phone part, quota online panel. Weighted by sex, age and 2023 vote. Nationwide, subscription survey, report prepared for MEGA. Published around 22 Oct 2026.
- **Question blocks** (verbatim wording on each page; DK/NA shown on 26 of 39 pages):
  - country direction (right/wrong)
  - personal situation compared with a year ago
  - five most important problems (open-ended, two mentions)
  - government performance by sector
  - overall government evaluation
  - PM job approval
  - evaluation of the official opposition (PASOK) and of its leader
  - economic confidence index (trend)
  - US President approval
  - opinion of the EU
  - most suitable PM
  - leader popularity (trend, positive-only)
  - expected election outcome (government formed or repeat election)
  - single-party vs coalition: expectation and preference
  - stability vs change
  - likelihood of voting a Samaras-led party
  - "inside/outside the walls" item
  - **Contaminated, exclude:** vote intention, vote estimate, and the vote-by-X cross-tabs
- **Terms:** republication prohibited without consent and the source must be cited. Internal evaluation use only.

### P7A-POL-02 — GPO for iefimerida, October 2026 (eligible for non-vote-intention blocks)
- **Report:** https://www.iefimerida.gr/sites/default/files/2026-10/dimoskopisi-gpo-iefimerida-oktobrios-2026.pdf (24 pp.)
- **Fieldwork:** 16–19 Oct 2026. **Sample:** n=1,000 aged 17+, stratified with regional quotas. Mode: 65% CATI and 35% online panel. Weighted by sex, age and party preference. Maximum sampling error stated in the report. Published 21 Oct 2026.
- **Question blocks** (numbered verbatim questions; "Δεν ξέρω / Δεν απαντώ" shown):
  - most important problem
  - own financial situation
  - perceived cause of high prices
  - difficulty covering 6 expense types
  - which party has a realistic plan, ×4 domains
  - preferred election outcome / government continuation
  - single-party vs coalition preference
  - who should be PM in a coalition
  - most suitable PM
  - likelihood of voting a Samaras-led party
  - **Contaminated, exclude:** vote intention and vote estimate
- Several items show the previous wave for comparison. No demographic cross-tabs.

### P7A-CON-01 — GPO October 2026 household cost-of-living module (consumer target)
Same report as P7A-POL-02, pp. 5–13: own financial situation, imported vs domestic cause of high prices, and difficulty covering six expense types:
- supermarket/food
- bank obligations
- tutoring/education
- clothing/footwear
- rent
- telephone/internet bills

Distributions are published **collapsed** (Πολύ&Αρκετά / Λίγο&Καθόλου / DK), and p.13 re-bases the results on respondents who have each expense. This module is the best consumer-type target found with fieldwork after the lab's data. No standalone Sept–Oct 2026 consumer or market survey with full distributions was found (see §5).

### P7A-SOC-01 — Flash Eurobarometer 585 "Youth and Democracy", Greece column
- **Data annex (EN):** https://europa.eu/eurobarometer/api/deliverable/download/file?deliverableId=110393 (47 pp.)
- **Report:** deliverableId=110573 (62 pp.)
- **Greek factsheet:** EN deliverableId=110220, EL deliverableId=110237
- **Survey page:** https://europa.eu/eurobarometer/surveys/detail/3701
- **Fieldwork:** 19 Jun–1 Jul 2026, run by Demoscopy for DG EAC. Online CAWI, target group aged 15–30. About 1,000 interviews per larger Member State; the Greek n was not extracted. Published 28 Oct 2026.
- **Question blocks** (all with per-country distributions, DK included, Greek column present; wording and options verbatim in the annex):
  - Q1 policy levers
  - Q2–Q3 learning about societal topics and how
  - Q4 effective ways to make youth voice heard
  - Q5–Q6 participation in organisations and reasons for not taking part
  - Q7a/b actions to change society and in which areas
  - Q8 familiarity with EU engagement channels
  - Q9 EU information sources
  - Q10–Q12 participation in EU youth activities, barriers and perceived benefits
  - Q13 EU mobility opportunities
  - Q14 EU impact on daily life
  - Q15 expectations of the EU
  - Q16 AI statements
  - Q17 where AI skills were learned
  - Q18 four agree/disagree statements
- **Overlap:** not in the lake or documents.json. Earlier waves FL545 and FL502 are in the lake, so trend items may share wording with them.
- **Caveat:** fieldwork predates the lab's latest data. This is a *publication-blind* test, not a post-fieldwork test.

## 4. Partial candidates (re-check before freezing)

- **P7A-POL-03 Interview / Politic.gr, 2nd October 2026 wave.** Press release 29 Oct. The PDF was not yet on interview.com.gr (guessed URL returned 404). This poll is not on Wikipedia, so **vote intention would also be uncontaminated**. Press-listed topics:
  - vote intention and estimate
  - opposition credibility
  - single-party vs coalition
  - one vs two elections
  - who is responsible for the cost of living
  - consumer-behaviour changes
  - household energy use
  - emotional reactions

  This is the strongest candidate if the PDF appears; monitor http://interview.com.gr/ereynes-2026.
- **P7A-POL-04 Opinion Poll / Action24, Attica Region, October 2026.** Fieldwork 12–19 Oct, n=2,001 (CATI RDD and CAWI), published 22 Oct. Not on Wikipedia and not in the lab. Results are only rendered client-side on opinionpoll.gr, and the PDF endpoint returned 404. Full distributions are unverified.
- **P7A-SOC-02 Opinion Poll ΕΣΥ (health system) survey.** Fieldwork 22–23 Oct, n=1,002 (702 CATI and 300 CAWI). Weighted by sex, age, region and 2023 vote. Published on liberal.gr on 29 Oct. Article text only; no full report.
- **P7A-CON-02 ΙΟΒΕ consumer survey, October 2026 wave.** Release expected early November. A genuinely prospective target, but results are published as balances or indices, not full distributions.

## 5. Excluded candidates (summary; details in the CSV)

- **Already in the lab corpus:**
  - Pulse/ΣΚΑΪ 22.10
  - Opinion Poll/Action24 national 13-10
  - Interview/POLITICAL October
  - ELTRUN e-commerce 2026
  - Focus Bari 2026 reports
  - διαΝΕΟσις recent studies
- **Already integrated in the lake:** Eurobarometer SP578 (Food innovation), FL588 (EU Ecolabel, the only Sept-2026-fieldwork consumer survey found) and SP574 (Sport).
- **No public full report located, and vote intention already on Wikipedia:**
  - Marc/ANT1 October
  - Alco/Flash October
  - Prorata ΣΦΥΓΜΟΣ September
  - Real Polls/Protagon September
  - MRB/OPEN September (MRB's October site items are essays)
- **Not a person-level or primary survey:**
  - FL578 (businesses)
  - Eteron/FEPS EqualiZe brief (secondary data and focus groups)
  - Opinion Poll CX Benchmark (commercial service)
- **No qualifying Sept–Oct 2026 release:** ΙΕΛΚΑ (price-index releases only), διαΝΕΟσις, Kapa Research, ELIAMEP, Palmos Analysis.

## 6. Decisions and recommendations

1. Freeze predictions for **P7A-POL-01, P7A-POL-02 and P7A-CON-01 (non-vote-intention items only)** and for **P7A-SOC-01 (Greek column)**. All four meet the criteria: defined Greek population, verifiable fieldwork, identifiable organisation, verbatim wording, published option sets including DK, and adequate methodology.
2. Before freezing, re-check **Interview/Politic October**. If its PDF is posted, add it as the primary political target, since its vote intention is clean too. Also re-check the Opinion Poll Attica and ΕΣΥ reports.
3. Score GPO hardship items on the collapsed 3-category scale as published.
4. Optional prospective consumer test: freeze an IOBE October consumer-confidence balance forecast before the early-November release.
5. Gap: no independent Greek consumer or market survey with fieldwork in Sept–Oct 2026 and full published distributions was found.
