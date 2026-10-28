"""Build docs/synthetic-lab/research/political_archives_inventory.csv (+ Eurobarometer appendix).

Usage: python3 -I build_inventory.py <repo_root> <gesis_eb.json>
gesis_eb.json = Eurobarometer records harvested from the CESSDA Data Catalogue API
(see cessda_harvest.py). Everything else is hand-curated below from checks done on
2026-10-28 (CESSDA API, DataCite API, cses.org, elnes.gr, chesdata.eu, parlgov.org,
popu-list.org, europeansocialsurvey.org, ESS GraphQL variable search, pewresearch.org).
"""
import csv
import json
import os
import re
import sys

ROOT, EBJSON = sys.argv[1], sys.argv[2]
OUT = os.path.join(ROOT, "docs/synthetic-lab/research/political_archives_inventory.csv")
OUT_EB = os.path.join(ROOT, "docs/synthetic-lab/research/political_archives_eurobarometer_greece.csv")
ARCH = ".synthetic-lab-data/raw/political/archives"
DROP = ".synthetic-lab-data/raw/political/owner_drop"

COLS = ["programme", "study_id", "title", "election_or_fieldwork", "n_greece", "mode_sampling",
        "political_vars", "weights", "licence_terms", "commercial_use", "access_tier",
        "reachable_from_env", "downloaded", "local_path", "owner_download_steps", "source_url", "verified"]

# ---------------------------------------------------------------- shared strings
GESIS_REACH = "no: search.gesis.org/gesis.org 403 Cloudflare; dbk.gesis.org DNS fail; metadata only via CESSDA/DataCite APIs"
GESIS_CAT = {
    "0": "GESIS access cat. 0 (data released for everybody); since 2026-02 GESIS requires login for every download",
    "A": "GESIS access cat. A (academic research and teaching only); login required",
    "B": "GESIS access cat. B (academic research and teaching, after depositor is informed); login required",
    "C": "GESIS access cat. C (academic research/teaching only after written permission of the depositor)",
}
GESIS_COMM = {"0": "unclear - ask GESIS (cat. 0 = 'for everybody', new 2026 terms restrict commercial use)",
              "A": "no (academic research/teaching only)", "C": "no", "B": "no"}


def gesis_steps(za, prog, extra=""):
    url = f"https://search.gesis.org/research_data/{za}"
    return (f"1) create free account at https://login.gesis.org (once); 2) open {url}; 3) 'Download' -> pick the "
            f"Stata .dta (or SPSS .sav) data file + codebook/questionnaire PDF{extra}; 4) declare purpose 'academic research', "
            f"accept terms; 5) save unchanged into {DROP}/{prog}/{za}/")


def sdn_steps(doi, prog="sodanet"):
    return (f"1) create free account at https://datacatalogue.sodanet.gr (Log In -> Sign Up); 2) open https://doi.org/{doi}; "
            f"3) in 'Files' download the data file (SPSS .sav preferred; 'Original Format') + questionnaire/codebook; if the file is "
            f"restricted click 'Request Access' and wait; 4) note the licence/terms shown under 'Terms'; 5) save into {DROP}/{prog}/{doi.split('/')[-1]}/")


def icpsr_steps(pid, prog="elnes"):
    return (f"1) create free account at https://www.openicpsr.org (or sign in with Google/ORCID); 2) open "
            f"https://www.openicpsr.org/openicpsr/project/{pid}/view ; 3) 'Download this project' (whole zip) and accept the "
            f"terms of use; 4) save the zip unchanged into {DROP}/{prog}/{pid}/")


ESS_STEPS = ("1) create free account at https://ess.sikt.no (Sikt/Feide/ORCID login); 2) Data Portal -> 'ESS{r} - integrated file, "
             "edition {ed}' -> Download -> format Stata or SPSS (or the 'Country file' for Greece if offered); also download the "
             "codebook/'Variables and questions' PDF; 3) save into " + DROP + "/ess/R{r}/")

rows = []


def add(**kw):
    r = {c: "" for c in COLS}
    r.update(kw)
    missing = [c for c in COLS if r[c] == ""]
    for c in missing:
        r[c] = "n/a"
    rows.append(r)


# ================================================================= ELNES / openICPSR
icpsr_lic = "openICPSR terms of use (free login, accept terms; depositor licence shown on project page - Creative Commons per elnes.gr, exact variant not verified because openICPSR returns 403 here)"
icpsr_reach = "no: openicpsr.org 403 (bot protection); metadata via DataCite OK"
elnes = [
    ("100053", "Hellenic Candidate Study 2007", "candidates; parl. election 16-09-2007; web 1st wave + phone 2nd wave", "241 candidates (160 web + 81 phone)", "web + telephone; list of ~700 candidates of the 2 major parties", "CCS core: candidate left-right self/party placement, issue positions, campaign, party ID", "verified", "yes"),
    ("100018", "Hellenic Voter Study 2009 (ELNES 2009; = CSES M3 GRC_2009)", "post-election; election 04-10-2009; fieldwork 10-18 Dec 2009", "1,022 (counted in CSES M3)", "CATI by Opinion SA; random sample from phone list, area-proportional; 18-89 Greek citizens", "CSES M3 battery + national: vote recall (2009, 2007), party ID, party/leader like-dislike, left-right self & parties, govt performance, satisfaction w. democracy", "CSES weights C1010_1-3", "yes"),
    ("100019", "Hellenic Candidate Study 2009", "candidates; parl. election 04-10-2009", "195 candidates (167 web + 28 F2F)", "web + F2F", "CCS core candidate items", "", "yes"),
    ("100020", "Hellenic Candidate Study 2012", "candidates; elections May/June 2012; web Oct-Nov 2012", "not verified", "web (epolls.gr)", "CCS core + 'economic crisis & alternatives' battery (shared with Portugal)", "", "partly"),
    ("100022", "Hellenic Voter Study 2012 (ELNES 2012; = CSES M4 GRC_2012)", "post-election; elections 06-05 & 17-06-2012; fieldwork 19-10-2012 to 05-01-2013", "1,029 (529 web + 500 F2F; CSES count 1,029)", "mixed: phone-recruited web + F2F (F2F half oversampling rural, 55+, low education)", "CSES M4 + national: vote May & June 2012, vote recall 2009, party ID, like-dislike parties/leaders, left-right, economic crisis battery (from Portuguese NES 2011)", "CSES weights D1010_1-3", "yes"),
    ("100023", "HelpMeVote: Hellenic parliamentary election 2012 (VAA)", "VAA use 18-04 to 06-05-2012", "~480,000 completions (raw)", "self-selected web VAA users (not representative)", "30 policy statements, vote intention, left-right, demographics", "none", "partly"),
    ("100024", "HelpMeVote-VoteMatch Greece: VAA for the EP elections 2014", "VAA use spring 2014 (EP election 25-05-2014)", "not verified (large, self-selected)", "self-selected web VAA users", "policy statements, vote intention EP/national, left-right", "none", "partly"),
    ("100027", "Hellenic Panel Study: European Election Study 2014 (Greek panel component of EES 2014)", "panel around EP election 25-05-2014 and next national election (Jan 2015)", "not verified", "web panel (epolls.gr), RDD-recruited", "EP vote 2014, national vote intention/recall, party ID, left-right, EU attitudes, realignment items", "not verified", "partly"),
    ("100074", "Web based surveys - Greek Elections 2015 (folders: Voter-Survey-January-2015 = ELNES 2015a = CSES M4 GRC_2015; Voter-Survey-September-2015 = ELNES 2015b = CSES M5 GRC_2015; Candidate-Survey-2015; HelpMeVote 2015)", "2015a: 12-06 to 08-09-2015 (election 25-01-2015); 2015b: 29-10-2015 to 29-02-2016 (election 20-09-2015); candidates Feb-Jul 2015; HelpMeVote 07-25 Jan 2015", "2015a 1,008 (962 web + 46 CATI); 2015b 1,078 (868 web + 210 CATI); candidates 520; HelpMeVote 543,870 cleaned", "RDD-recruited CAWI with CATI fallback; candidates web; VAA self-selected", "vote Jan/Sep 2015 + recall, July 2015 referendum vote, party ID, like-dislike, left-right, populism battery (CSES M5 pilot), economy; candidates: CCS core + HelpMeVote + populism items", "CSES demographic weight (raking gender/age/education)", "yes"),
]
for pid, title, fw, n, mode, vars_, w, ver in elnes:
    add(programme="ELNES (Hellenic National Election Studies, AUTh / I. Andreadis) via openICPSR",
        study_id=f"openICPSR {pid}; DOI 10.3886/E{pid}", title=title, election_or_fieldwork=fw, n_greece=n,
        mode_sampling=mode, political_vars=vars_, weights=w or "not verified", licence_terms=icpsr_lic,
        commercial_use="not stated - assume no without written permission", access_tier="B",
        reachable_from_env=icpsr_reach, downloaded="no", local_path="",
        owner_download_steps=icpsr_steps(pid), source_url=f"https://doi.org/10.3886/E{pid}", verified=ver)
add(programme="ELNES", study_id="ELNES 2019 (= CSES M5 GRC_2019)", title="Hellenic National Election Study 2019 (post-election, CSES Module 5)",
    election_or_fieldwork="election 07-07-2019; fieldwork 13-12-2019 to 07-03-2020", n_greece="1,324 (counted in CSES M5 file)",
    mode_sampling="CAWI; respondents recruited by RDD of mobile numbers (individual as PSU), SMS reminders",
    political_vars="see CSES M5 row: E3013_LH_PL vote, E3015_LH_PL previous vote, E3024_* party ID, E3017/E3018 like-dislike, E3020 left-right, E3004_* populism, E3009 govt performance",
    weights="sample weight (1/number of mobile phones) + combined sample&demographic weight (raking gender/age/education/region, trimmed at 8): E1010_1/E1010_2",
    licence_terms="CSES free public dataset (see CSES rows); no separate ELNES deposit found",
    commercial_use="not addressed by CSES - cite; ask cses@vanderbilt.edu for commercial use", access_tier="A",
    reachable_from_env="yes (cses.org)", downloaded="yes (inside CSES M5)", local_path=f"{ARCH}/cses_m5/",
    owner_download_steps="nothing to do (already downloaded with CSES M5); optional courtesy registration at https://cses.org/registration/",
    source_url="https://cses.org/data-download/cses-module-5-2016-2021/", verified="yes")
add(programme="ELNES", study_id="ELNES 2023 (May & June 2023)", title="Hellenic National Election Study 2023 (double election 21-05 & 25-06-2023)",
    election_or_fieldwork="post-election 2023 (methods documented in AUTh thesis doi:10.26262/heal.auth.ir.360411)", n_greece="not found",
    mode_sampling="not found", political_vars="expected CSES M6 module", weights="n/a",
    licence_terms="no public deposit found (not on openICPSR/DataCite; not in CSES M6 2nd advance release 16-12-2025)",
    commercial_use="n/a", access_tier="C (not released)", reachable_from_env="n/a", downloaded="no", local_path="",
    owner_download_steps="watch https://cses.org/data-download/cses-module-6-2021-2026/ for 'Greece (2023)' in the next advance release; or email ELNES (andreadis@polsci.auth.gr) to ask for the data",
    source_url="https://doi.org/10.26262/heal.auth.ir.360411", verified="partly")

# ================================================================= CSES
cses_lic = "CSES: 'single, free, public dataset' (codebook part 1); files linked publicly on cses.org with no login/click-through; site asks users to register (honour system); cite module DOI"
cses_comm = "not addressed (no licence text) - attribution required; confirm with cses@vanderbilt.edu before commercial use"
cses = [
    ("CSES Module 3 (DOI 10.7804/cses.module3.2015-12-15; GESIS ZA5181)", "GRC_2009", "election 04-10-2009; fieldwork 10-18 Dec 2009", "1,022", "CATI (Opinion SA)", "C3023_LH_PL vote; C3032_LH_PL previous vote; C3020_* party ID; C3009_*/C3010_* like-dislike parties/leaders; C3011/C3012 party/leader L-R; C3013 L-R self; C3006 govt performance; C3019 satisfaction w. democracy; C3021 turnout", "C1010_1-3 / C1012_* / C1014_*", "cses_m3", "https://cses.org/data-download/cses-module-3-2006-2011-2/"),
    ("CSES Module 4 (DOI 10.7804/cses.module4.2018-05-29; GESIS ZA5182)", "GRC_2012", "election 17-06-2012 (study also asks May 2012); fieldwork Oct 2012-Jan 2013", "1,029", "mixed web + F2F", "D3006_LH_PL vote; D3008_LH_PL previous vote; D3018_* party ID; D3011_*/D3012_* like-dislike; D3014 L-R self; D3003 economy; D3017 SWD; D3009 who in power", "D1010_1-3 (sample & demographic identical for GRC 2012)", "cses_m4", "https://cses.org/data-download/module-4-2011-2016/"),
    ("CSES Module 4 (DOI 10.7804/cses.module4.2018-05-29; GESIS ZA5182)", "GRC_2015 (Jan 2015 election = ELNES 2015a)", "election 25-01-2015; fieldwork 12-06 to 08-09-2015", "1,008", "RDD-recruited CAWI + CATI fallback", "same D-variables as above", "D1010_*", "cses_m4", "https://cses.org/data-download/module-4-2011-2016/"),
    ("CSES Module 5 (DOI 10.7804/csesmodule5.2023-07-25; GESIS ZA7557)", "GRC_2015 (Sep 2015 election = ELNES 2015b)", "election 20-09-2015; fieldwork 29-10-2015 to 29-02-2016", "1,078", "mixed (MX): RDD phone recruitment, web or phone", "E3013_LH_PL vote; E3015_LH_PL previous vote; E3024_* party ID; E3017_*/E3018_* like-dislike; E3020 L-R self; E3004_1-8 populist/elite attitudes; E3005_* out-group attitudes; E3009 govt performance; E3011 economy; E3023 SWD; E3012 turnout", "demographic weight only (E1010_2; raking gender/age/education)", "cses_m5", "https://cses.org/data-download/cses-module-5-2016-2021/"),
    ("CSES Module 5 (DOI 10.7804/csesmodule5.2023-07-25; GESIS ZA7557)", "GRC_2019", "election 07-07-2019; fieldwork 13-12-2019 to 07-03-2020", "1,324", "INT: CAWI after mobile RDD", "same E-variables as above", "E1010_1 sample + E1010_2 combined weight", "cses_m5", "https://cses.org/data-download/cses-module-5-2016-2021/"),
    ("CSES Integrated Module Dataset IMD (GESIS ZA7481)", "IMD: GRC_2009, GRC_2012, GRC12015, GRC22015, GRC_2019", "harmonised 1996-2021 (Greek studies 2009-2019)", "5,461 Greek rows (1,022+1,029+1,008+1,078+1,324)", "as source modules", "IMD3002_LH_PL vote; IMD3004_LH_PL previous vote; IMD3005_1-4 party ID; IMD3006 L-R self; IMD3007_* party L-R; IMD3001 turnout; harmonised party codes across modules", "IMD1010_1-3", "cses_imd", "https://cses.org/data-download/cses-integrated-module-dataset-imd/"),
]
for mod, sid, fw, n, mode, vars_, w, d, url in cses:
    add(programme="CSES (Comparative Study of Electoral Systems)", study_id=f"{mod} :: {sid}",
        title=f"CSES Greek election study {sid}", election_or_fieldwork=fw, n_greece=n, mode_sampling=mode,
        political_vars=vars_, weights=w, licence_terms=cses_lic, commercial_use=cses_comm, access_tier="A",
        reachable_from_env="yes: cses.org pages and wp-content zips HTTP 200", downloaded="yes",
        local_path=f"{ARCH}/{d}/", owner_download_steps="nothing to do (CSV + codebook + Greek questionnaires/design reports downloaded); courtesy registration at https://cses.org/registration/ recommended",
        source_url=url, verified="yes")
add(programme="CSES", study_id="CSES Module 6 (2nd advance release, DOI 10.7804/cses.module6.2025-12-16)", title="CSES Module 6 - no Greek study yet",
    election_or_fieldwork="2021-2026", n_greece="0 (Greece not in release; ELNES 2023 expected later)", mode_sampling="n/a",
    political_vars="M6: democracy evaluations, trust, representation, vote choice", weights="n/a", licence_terms=cses_lic,
    commercial_use=cses_comm, access_tier="A", reachable_from_env="yes", downloaded="no (no Greek cases)", local_path="",
    owner_download_steps="re-check the M6 page after each advance release for 'Greece (2023)'", source_url="https://cses.org/data-download/cses-module-6-2021-2026/", verified="yes")
add(programme="CSES", study_id="CSES Modules 1 and 2", title="CSES M1 (1996-2001) and M2 (2001-2006)", election_or_fieldwork="n/a",
    n_greece="0 (Greece absent per CSES election-study table)", mode_sampling="n/a", political_vars="n/a", weights="n/a",
    licence_terms=cses_lic, commercial_use="n/a", access_tier="n/a", reachable_from_env="yes", downloaded="no", local_path="",
    owner_download_steps="none", source_url="https://cses.org/data-download/download-data-documentation/election-studies/", verified="yes")

# ================================================================= EES
ees_common_vars = "EP vote, last national vote, national vote intention, propensity-to-vote (PTV) per party, party closeness, left-right self & party placement, EU attitudes, trust, government approval, economy"
ees = [
    ("ZA1320 + ZA1321 (EB 21 / EB 22)", "European Elections Study 1984 (fielded within Eurobarometer 21 Apr 1984 and 22 Oct 1984)", "EP election 17-06-1984", "~1,000 per EB wave (not verified)", "F2F, multistage random (EB)", "EB 21/22 party preference, EP vote intention/recall, left-right", "EB weights", "0", "partly"),
    ("ZA2320 (DOI 10.4232/1.2320)", "European Election Study 1989 (EES 1989)", "EP election 15-06-1989; EB 31/31A panel", "~1,000 (not verified)", "F2F (EB-based)", ees_common_vars, "EB weights", "A", "partly"),
    ("ZA2865 (DOI 10.4232/1.2865) + ZA2866/ZA2867 pre-election, ZA2868/ZA2869 post-election", "European Election Study 1994 (EES 1994) and its 4 component surveys", "EP election 12-06-1994", "~1,000 per survey (not verified)", "F2F (EB-based)", ees_common_vars, "EB weights", "A", "partly"),
    ("DANS doi:10.17026/DANS-Z9J-VY6M (DANS study P1560)", "European Election Study 1999", "EP election 13-06-1999; fieldwork 14-06 to 08-07-1999", "~500 (not verified)", "CATI (country-specific)", ees_common_vars, "country weights", "DANS", "partly"),
    ("ZA4566 (DOI 10.4232/1.10086, 2nd ed.)", "European Election Study 2004", "EP election 13-06-2004", "~500 (not verified)", "telephone in Greece (DataCite description)", ees_common_vars, "weighting factor in file", "A", "partly"),
    ("ZA5055 (DOI 10.4232/1.12732)", "European Parliament Election Study 2009, Voter Study", "fieldwork 08-06 to 30-06-2009", "~1,000 (not verified)", "telephone (partly CATI) / F2F", ees_common_vars, "sample weight per country; political weight; political weight EP voters", "A", "partly"),
    ("ZA5160 (DOI 10.4232/1.14377, v4.1.0) + ZA5161 supplementary", "European Parliament Election Study 2014, Voter Study (First Post-Election Survey)", "fieldwork 30-05 to 24-06-2014", "~1,100 (not verified)", "CAPI (TNS, EB infrastructure)", ees_common_vars, "sample weight per country; political weight; political weight EP voters", "A", "partly"),
    ("ZA7581 (DOI 10.4232/1.13842) + ZA7890 stacked data matrix", "European Parliament Election Study 2019, Voter Study", "post-election June-July 2019", "~1,000 (EES: ~1,000 per member state)", "CAWI from access panels, stratified by gender/age/region/locality", ees_common_vars, "post-stratification + political weights in file", "A", "partly"),
    ("ZA8868 (DOI 10.4232/1.14409)", "European Parliament Election Study 2024, Voter Study", "post-election June-July 2024", "~1,000 (not verified)", "CAWI access panels (as 2019, not verified)", ees_common_vars, "weights in file (not verified)", "A", "partly"),
    ("ZA5048 (reduced, A) / ZA5053 (full, C)", "European Parliament Election Study 2009, Candidate Study", "2009 EP candidates", "not verified", "web/postal candidates", "candidate L-R, EU, issue positions", "n/a", "A", "partly"),
    ("ZA5102 (DOI 10.4232/1.14120) + ZA5163/ZA7892/ZA9209 documents", "EES Euromanifesto Study 1979-2019 (+2024 documents)", "party manifestos for EP elections 1981-2024 (Greece)", "party-level", "content coding", "party positions coded from Euromanifestos", "n/a", "A", "partly"),
]
for za, title, fw, n, mode, vars_, w, cat, ver in ees:
    if cat == "DANS":
        lic, comm, tier = "DANS Licence; files 'restricted' (login + request at DANS SSH Data Station)", "no (DANS licence: research)", "B/C"
        reach = "yes for metadata (ssh.datastations.nl API 200); data files restricted"
        steps = ("1) create DANS account at https://ssh.datastations.nl (SURFconext/ORCID); 2) open https://doi.org/10.17026/DANS-Z9J-VY6M ; "
                 "3) request access to P1560a.por/.tab + 'P1560 codebook.PDF'; 4) save into " + DROP + "/ees/1999/. Alternative: EES 1999 file from europeanelectionstudies.net (403 here)")
    else:
        lic, comm, tier = GESIS_CAT[cat], GESIS_COMM[cat], ("B" if cat in "0A" else "C")
        reach = GESIS_REACH
        steps = gesis_steps(za.split()[0], "ees")
    add(programme="European Election Studies (EES) / EP election studies", study_id=za, title=title, election_or_fieldwork=fw,
        n_greece=n, mode_sampling=mode, political_vars=vars_, weights=w, licence_terms=lic, commercial_use=comm,
        access_tier=tier, reachable_from_env=reach, downloaded="no", local_path="", owner_download_steps=steps,
        source_url=("https://doi.org/10.17026/DANS-Z9J-VY6M" if cat == "DANS" else f"https://search.gesis.org/research_data/{za.split()[0]}"),
        verified=ver)

# ================================================================= ESS
ess_lic = "ESS ERIC: data CC BY-NC-SA 4.0, documentation CC BY-SA 4.0; 'without restrictions, for not-for-profit purposes'; login required; ESS asks not to re-host files"
ess = [
    ("1", "6.7", "ESS1 2002", "19-01 to 01-06-2003 (Greek fieldwork, EKKE)", "2,566 (secondary source, not verified)", "prtvtgr", "prtclgr"),
    ("2", "3.6", "ESS2 2004", "10-01 to 20-03-2005", "2,406 (secondary, not verified)", "prtvtagr", "prtclagr"),
    ("4", "4.6", "ESS4 2008", "15-07 to 20-11-2009", "2,072 (secondary, not verified)", "prtvtbgr", "prtclbgr"),
    ("5", "3.6", "ESS5 2010", "06-05 to 05-07-2011", "2,715 (secondary, not verified)", "prtvtcgr", "prtclcgr"),
    ("10", "3.3", "ESS10 2020/21", "19-11-2021 to 2022", "2,799 (secondary, not verified)", "prtvtdgr", "prtcldgr"),
    ("11", "4.2", "ESS11 2023/24", "2023/24 (Greece in edition 3.0+; final ed. 4.0 Nov 2025, now 4.2)", "not verified (~2,700)", "prtvtegr", "prtclegr"),
]
for r, ed, title, fw, n, pv, pc in ess:
    add(programme="European Social Survey (ESS)", study_id=f"ESS{r} integrated file ed. {ed}" + {"1": " (SoDaNet copy 10.17903/FK2/ZZYHL6)", "2": " (SoDaNet copy 10.17903/FK2/VHJD9I)", "4": " (SoDaNet copy 10.17903/FK2/54SCB8)", "5": " (SoDaNet copy 10.17903/FK2/YJ9ZUC)"}.get(r, ""),
        title=f"{title} - Greece", election_or_fieldwork=fw, n_greece=n,
        mode_sampling="F2F (PAPI/CAPI), strict random probability sample 15+",
        political_vars=f"{pv} (party voted last national election, Greece), {pc} (party feel closer to, Greece), vote (voted last election), clsprty, prtdgcl, lrscale, stfgov, stfdem, stfeco, trstplt, trstprt, trstprl, polintr, euftf, imm* items",
        weights="dweight, pspwght (post-strat.), pweight; anweight (R9+)", licence_terms=ess_lic,
        commercial_use="no (NC)", access_tier="B", reachable_from_env="portal reachable (ess.sikt.no 200) but download needs login; variable metadata via public GraphQL api.nsd.no (used to verify Greek party variable names)",
        downloaded="no", local_path="", owner_download_steps=ESS_STEPS.format(r=r, ed=ed),
        source_url="https://ess.sikt.no/en/", verified="partly (variable names+editions yes; n no)")
add(programme="European Social Survey (ESS)", study_id="ESS12 (2025/26)", title="ESS12 - Greece (EKKE)", election_or_fieldwork="2025/26, mixed-mode experiment (F2F vs web/paper)",
    n_greece="not released", mode_sampling="random allocation F2F vs self-completion", political_vars="as ESS core (prtvt?gr, prtcl?gr, lrscale, stfgov, trust)",
    weights="post-stratification weights in first release", licence_terms=ess_lic, commercial_use="no (NC)", access_tier="B (from Jan 2027)",
    reachable_from_env="n/a", downloaded="no", local_path="", owner_download_steps="after the initial release (announced for January 2027) follow the ESS steps above for 'ESS12'",
    source_url="https://www.europeansocialsurvey.org/news/article/initial-round-12-data-release-scheduled-early-2027", verified="yes")
add(programme="European Social Survey (ESS)", study_id="ESS R3, R6, R7, R8, R9", title="ESS rounds without Greece", election_or_fieldwork="2006, 2012, 2014, 2016, 2018",
    n_greece="0", mode_sampling="n/a", political_vars="n/a", weights="n/a", licence_terms=ess_lic, commercial_use="n/a", access_tier="n/a",
    reachable_from_env="n/a", downloaded="no", local_path="", owner_download_steps="none", source_url="https://ess.sikt.no/en/", verified="partly")

# ================================================================= EVS / WVS
evs = [
    ("ZA3801 (DOI 10.4232/1.11536)", "EVS 1999 - Greece", "03-06/1999", "1,142 (secondary, not verified)", "F2F, random", "A"),
    ("ZA4776 (DOI 10.4232/1.10148)", "EVS 2008 - Greece", "12-09 to 26-10-2008", "1,500 (secondary, not verified)", "F2F PAPI", "C"),
    ("ZA7546 (DOI 10.4232/1.13512)", "EVS 2017 - Greece (country data file, outside integrated ZA7500)", "15-12-2018 to 31-01-2019", "3,892 (GESIS table, CAWI; not verified)", "CAWI, NON-probability respondent-driven sampling (deviates from EVS guidelines); no weights provided", "A"),
]
for za, title, fw, n, mode, cat in evs:
    add(programme="European Values Study (EVS)", study_id=za, title=title, election_or_fieldwork=fw, n_greece=n, mode_sampling=mode,
        political_vars="left-right self-placement, country-specific party vote intention ('which party would you vote for'), interest in politics, confidence in parliament/government/parties, political action, democracy & authoritarian preferences (exact names in codebook)",
        weights="country weights (none for 2017 Greece)", licence_terms=GESIS_CAT[cat], commercial_use=GESIS_COMM[cat],
        access_tier="B" if cat == "A" else "C", reachable_from_env=GESIS_REACH, downloaded="no", local_path="",
        owner_download_steps=gesis_steps(za.split()[0], "evs", " (cat. C: fill the GESIS request form; depositor approval needed)" if cat == "C" else ""),
        source_url=f"https://doi.org/{za.split('DOI ')[1].rstrip(')')}", verified="partly")
for za, title, cat in [("ZA3811", "EVS 1999 Integrated Dataset", "A"), ("ZA4800 (A) / ZA4799 restricted (C)", "EVS 2008 Integrated Dataset", "A"),
                       ("ZA4804 (A) / ZA5174 restricted (C)", "EVS Longitudinal Data File 1981-2008", "A"), ("ZA7503 (A) / ZA7504 sensitive (C)", "EVS Trend File 1981-2017", "A"),
                       ("ZA7505", "Joint EVS/WVS 2017-2022 Dataset", "A")]:
    add(programme="European Values Study (EVS)", study_id=za, title=title + " (contains Greek cases)", election_or_fieldwork="multi-wave",
        n_greece="Greek cases = sum of Greek country files", mode_sampling="as country files", political_vars="harmonised left-right, party vote, confidence items",
        weights="harmonised weights", licence_terms=GESIS_CAT[cat], commercial_use=GESIS_COMM[cat], access_tier="B",
        reachable_from_env=GESIS_REACH, downloaded="no", local_path="", owner_download_steps=gesis_steps(za.split()[0], "evs"),
        source_url=f"https://search.gesis.org/research_data/{za.split()[0]}", verified="partly")
add(programme="European Values Study (EVS)", study_id="EVS 1981, EVS 1990", title="EVS waves 1 and 2", election_or_fieldwork="1981, 1990",
    n_greece="0 (Greece first in EVS 1999)", mode_sampling="n/a", political_vars="n/a", weights="n/a", licence_terms="n/a", commercial_use="n/a",
    access_tier="n/a", reachable_from_env="n/a", downloaded="no", local_path="", owner_download_steps="none", source_url="https://europeanvaluesstudy.eu", verified="partly")
add(programme="World Values Survey (WVS)", study_id="WVS wave 7 Greece (WVSA) ; SoDaNet 10.17903/FK2/JZIDWV (EN) & T1BT5O (GR)",
    title="World Values Survey wave 7 - Greece (Koniordos, Demertzis)", election_or_fieldwork="08-09 to 16-10-2017", n_greece="1,200 (secondary; WVSA documentation)",
    mode_sampling="F2F, multistage probability sample 18+", political_vars="Q223 party would vote for (country-specific codes), Q222 vote in national elections, Q240 left-right, Q71-Q76 confidence (government, parties, parliament), Q235-Q238 political systems, Q250-Q253 democracy",
    weights="W_WEIGHT (+ S018 in time series)", licence_terms="WVSA conditions of use: non-commercial/non-profit, no redistribution, cite; registration form per download",
    commercial_use="no", access_tier="B", reachable_from_env="worldvaluessurvey.org 200 (download needs form: name, institution, purpose); SoDaNet 403",
    downloaded="no", local_path="",
    owner_download_steps=f"1) https://www.worldvaluessurvey.org/WVSDocumentationWV7.jsp -> 'Greece' country file (or full WVS-7 Stata file) -> fill the licence form (name, email, institution, purpose: research); 2) download Stata/SPSS + Greek questionnaire; 3) save into {DROP}/wvs/wave7/",
    source_url="https://www.worldvaluessurvey.org/WVSDocumentationWV7.jsp", verified="partly")
add(programme="World Values Survey (WVS)", study_id="WVS waves 1-6", title="WVS waves 1-6", election_or_fieldwork="1981-2014", n_greece="0 (Greece first in WVS-7; earlier Greek values data come via EVS)",
    mode_sampling="n/a", political_vars="n/a", weights="n/a", licence_terms="n/a", commercial_use="n/a", access_tier="n/a", reachable_from_env="n/a",
    downloaded="no", local_path="", owner_download_steps="none", source_url="https://doi.org/10.17903/FK2/JZIDWV", verified="yes")

# ================================================================= ISSP
for za, title, fw, n in [("ZA8784 (DOI 10.4232/1.14300)", "ISSP 2021 Health and Health Care II - Greece (national file, not in integrated ZA8000)", "07-06 to 15-08-2022", "1,694 (secondary; not verified)"),
                         ("ZA10000 (integrated, lists Greece)", "ISSP 2022 Family and Changing Gender Roles V", "2022/23", "not verified"),
                         ("ZA10010 (integrated, lists Greece)", "ISSP 2023 National Identity & Citizenship", "2023/24", "not verified")]:
    add(programme="ISSP (Greek member: AUTh / ELNES team)", study_id=za, title=title, election_or_fieldwork=fw, n_greece=n,
        mode_sampling="Greek ISSP fielded online/mixed by AUTh (not verified per year)",
        political_vars="ISSP background: VOTE_LE (voted last election), GR_PRTY (party voted, Greece), PARTY_LR (left-right of party voted), TOPBOT; 2023 module: national identity, immigration, citizenship",
        weights="WEIGHT (country-specific)", licence_terms=GESIS_CAT["A"], commercial_use=GESIS_COMM["A"], access_tier="B",
        reachable_from_env=GESIS_REACH, downloaded="no", local_path="", owner_download_steps=gesis_steps(za.split()[0], "issp"),
        source_url=f"https://search.gesis.org/research_data/{za.split()[0]}", verified="partly")
add(programme="ISSP", study_id="ISSP 1985-2020 modules", title="ISSP modules before 2021", election_or_fieldwork="1985-2020", n_greece="0 found (no Greek country file located in CESSDA/DataCite)",
    mode_sampling="n/a", political_vars="n/a", weights="n/a", licence_terms="n/a", commercial_use="n/a", access_tier="n/a", reachable_from_env="n/a",
    downloaded="no", local_path="", owner_download_steps="none", source_url="https://datacatalogue.cessda.eu", verified="partly")

# ================================================================= Eurobarometer
eb = json.load(open(EBJSON))
std = sorted([e for e in eb if e["type"] == "Standard/Special EB" and e["gr"]], key=lambda e: (e["year"], e["za"]))
fl = [e for e in eb if e["type"] == "Flash" and e["gr"]]
add(programme="Eurobarometer (GESIS microdata)", study_id="ZA3521 (Mannheim Eurobarometer Trend File 1970-2002, ed. 2.00)",
    title="The Mannheim Eurobarometer Trend File 1970-2002", election_or_fieldwork="1970-2002 (Greece from EB 14, Oct-Nov 1980)",
    n_greece="~1,000 per wave x ~45 waves (not verified)", mode_sampling="F2F multistage random (EB)",
    political_vars="harmonised party preference / vote intention ('if there were a general election tomorrow'), party attachment, left-right self-placement, satisfaction with democracy, EU membership support, Inglehart postmaterialism",
    weights="national & EU weights", licence_terms=GESIS_CAT["0"], commercial_use=GESIS_COMM["0"], access_tier="B",
    reachable_from_env=GESIS_REACH, downloaded="no", local_path="", owner_download_steps=gesis_steps("ZA3521", "eurobarometer"),
    source_url="https://search.gesis.org/research_data/ZA3521", verified="partly")
yrs = f"{std[0]['year']}-{std[-1]['year']}"
add(programme="Eurobarometer (GESIS microdata)", study_id=f"{len(std)} Standard/Special EB studies with Greece (ZA1039 EB14 1980 ... ZA9144 EB105.2 2026; full list in political_archives_eurobarometer_greece.csv)",
    title="Standard & Special Eurobarometer waves including Greece", election_or_fieldwork=yrs,
    n_greece="~1,000 per wave (EB standard); ~240k Greek interviews in total (not verified)",
    mode_sampling="F2F/CAPI multistage random probability 15+ (CAWI elements since COVID waves)",
    political_vars="D1 left-right self-placement (most waves); trust in parties/government/parliament (QA trust battery); satisfaction with democracy; 'my voice counts'; EU image; vote intention/party preference only in older waves (to ~2002, see ZA3521) and EP post-electoral EBs (e.g. EB 91.5 ZA7576 2019, EB 101.5 ZA8900 2024)",
    weights="W1 (national), W3/W4 EU weights", licence_terms=GESIS_CAT["0"] + " (all 240 records are cat. 0 per CESSDA)", commercial_use=GESIS_COMM["0"],
    access_tier="B", reachable_from_env=GESIS_REACH, downloaded="no", local_path="",
    owner_download_steps=gesis_steps("<ZA>", "eurobarometer", "; for bulk use the GESIS 'Eurobarometer Data Service' and download only the waves you need, highest priority: post-electoral and D1-containing waves 2000-2026"),
    source_url="https://www.gesis.org/en/eurobarometer-data-service", verified="yes (list from CESSDA API); partly (variable content)")
fpol = [e for e in fl if re.search(r"elect|democra|citizen|politic|vote|referend", e["title"], re.I)]
add(programme="Eurobarometer (GESIS microdata)", study_id=f"{len(fl)} Flash EB studies with Greece (of which ~{len(fpol)} on elections/democracy/citizenship, e.g. ZA4185 FL161 pre-EP 2004, ZA4186 FL162 post-EP 2004, ZA7560 FL4021, ZA7633 FL485, ZA7982 FL522 Democracy 2023, ZA8821 FL545)",
    title="Flash Eurobarometer waves including Greece", election_or_fieldwork="1991-2026", n_greece="~500-1,000 per wave",
    mode_sampling="CATI / CAWI", political_vars="EP election participation, democracy, citizenship, trust; rarely party preference",
    weights="national weights", licence_terms=GESIS_CAT["0"], commercial_use=GESIS_COMM["0"], access_tier="B",
    reachable_from_env=GESIS_REACH, downloaded="no", local_path="", owner_download_steps=gesis_steps("<ZA>", "eurobarometer_flash"),
    source_url="https://www.gesis.org/en/eurobarometer-data-service", verified="yes (list); partly (content)")
add(programme="Eurobarometer (SoDaNet Greek-language copies)", study_id="205 SoDaNet EB/Flash EB records (DOIs 10.17903/FK2/...)",
    title="Greek-language catalogue copies of Eurobarometers at SoDaNet", election_or_fieldwork="1990s-2010s", n_greece="as GESIS waves",
    mode_sampling="as EB", political_vars="as EB", weights="as EB", licence_terms="SoDaNet per-file terms (not verified)", commercial_use="not verified",
    access_tier="B", reachable_from_env="no: datacatalogue.sodanet.gr 403 Cloudflare; metadata via CESSDA", downloaded="no", local_path="",
    owner_download_steps="prefer the GESIS originals (same data, maintained versions)", source_url="https://datacatalogue.cessda.eu", verified="yes (count)")

# ================================================================= Pew
pew_years = {2012: "", 2013: "", 2014: "", 2015: "", 2016: "page text mentions Greece", 2017: "", 2018: "27-nation", 2019: "34-nation",
             2021: "16/17 advanced economies", 2022: "19-country", 2023: "23-country", 2024: "35-country; page lists Greece (phone)", 2025: "25-country; Greece per earlier inventory"}
for y, note in pew_years.items():
    add(programme="Pew Research Center Global Attitudes (Spring survey)", study_id=f"Spring {y} Survey Data" + (" (doi:10.58094/dwf6-w702)" if y == 2024 else ""),
        title=f"Pew Spring {y} Global Attitudes Survey - Greece sample", election_or_fieldwork=f"spring {y} ({note})" if note else f"spring {y}",
        n_greece="~1,000 (not verified)", mode_sampling="Greece: CATI (phone) nationally representative 18+ (2024 verified as phone)",
        political_vars="country-specific party favourability/closeness (e.g. ND, SYRIZA, PASOK), left-right ideology scale, satisfaction with democracy, views of EU/US/Russia/China, government approval items in some years",
        weights="weight (country design weight)", licence_terms="Pew terms: free account; may not reproduce, sell, distribute or sublicense the data; cite; ~6-12 month embargo",
        commercial_use="no redistribution; commercial use not granted", access_tier="B", reachable_from_env="pewresearch.org 200; download requires login",
        downloaded="no", local_path="",
        owner_download_steps=f"1) create free account at https://www.pewresearch.org (My Account); 2) open https://www.pewresearch.org/dataset/spring-{y}-survey-data/ ; 3) 'Download' (accept terms) -> SPSS .sav + questionnaire + topline; 4) save into {DROP}/pew/{y}/",
        source_url=f"https://www.pewresearch.org/dataset/spring-{y}-survey-data/", verified="yes" if y == 2024 else "partly")
add(programme="Pew Research Center Global Attitudes", study_id="Spring 2020; Global Attitudes 2002-2011", title="Pew waves without Greece", election_or_fieldwork="2002-2011, 2020",
    n_greece="0 (Greece first in Spring 2012; Spring 2020 dataset page 404 / Greece not surveyed)", mode_sampling="n/a", political_vars="n/a", weights="n/a",
    licence_terms="n/a", commercial_use="n/a", access_tier="n/a", reachable_from_env="n/a", downloaded="no", local_path="", owner_download_steps="none",
    source_url="https://www.pewresearch.org/datasets/", verified="partly")

# ================================================================= Candidates / party-level
add(programme="Comparative Candidates Survey (CCS)", study_id="CCS Module I cumulative 2005-2012 (DOI 10.48573/gy6m-ft70)", title="CCS Module I - includes Greek candidate studies 2007/2009/2012 (= ELNES candidate studies)",
    election_or_fieldwork="2005-2012", n_greece="not verified (Greek source files: 241 / 195 / 2012 n.v.)", mode_sampling="candidate web/phone surveys",
    political_vars="candidate L-R self & party placement, issue positions, representation roles, campaign", weights="n/a",
    licence_terms="SWISSUbase (FORS): registration; data use for research, teaching, education/training purposes", commercial_use="no",
    access_tier="B", reachable_from_env="yes for metadata (swissubase.ch 200); download needs SWISSUbase login + contract",
    downloaded="no", local_path="", owner_download_steps=f"1) create SWISSUbase account (SWITCH edu-ID) at https://www.swissubase.ch ; 2) open https://doi.org/10.48573/gy6m-ft70 -> 'Order dataset', declare research purpose; 3) download Stata/SPSS; 4) save into {DROP}/ccs/module1/",
    source_url="https://doi.org/10.48573/gy6m-ft70", verified="partly")
add(programme="Comparative Candidates Survey (CCS)", study_id="CCS Module II cumulative 2013-2018 (DOI 10.48573/hda9-am65)", title="CCS Module II - Greek Candidate Study 2015 (n=520) expected",
    election_or_fieldwork="2013-2018", n_greece="520 (Greek 2015 source file; inclusion not verified)", mode_sampling="web", political_vars="as Module I + populism items (Greek file)",
    weights="n/a", licence_terms="SWISSUbase: research/teaching purposes", commercial_use="no", access_tier="B", reachable_from_env="metadata yes; data login",
    downloaded="no", local_path="", owner_download_steps=f"as CCS Module I, DOI 10.48573/hda9-am65 -> {DROP}/ccs/module2/", source_url="https://doi.org/10.48573/hda9-am65", verified="partly")
add(programme="Comparative Candidates Survey (CCS)", study_id="CCS Module III cumulative 2019-2024 (DOI 10.48573/s11z-ea96)", title="CCS Module III - Greek candidates 2019/2023 (inclusion not verified; country list in metadata is a generic union)",
    election_or_fieldwork="2019-2024", n_greece="not verified", mode_sampling="web", political_vars="as above", weights="n/a",
    licence_terms="SWISSUbase: research/teaching purposes", commercial_use="no", access_tier="B", reachable_from_env="metadata yes; data login",
    downloaded="no", local_path="", owner_download_steps=f"as CCS Module I, DOI 10.48573/s11z-ea96 -> {DROP}/ccs/module3/", source_url="https://doi.org/10.48573/s11z-ea96", verified="partly")
add(programme="Chapel Hill Expert Survey (CHES)", study_id="CHES trend 1999-2024 (meansV2) + CHES 2024 final v2 + 2024 stacked expert file",
    title="Party positions (L-R, GAL-TAN, EU, populism/anti-elite, issues) for Greek parties", election_or_fieldwork="expert waves 1999, 2002, 2006, 2010, 2014, 2019, 2024",
    n_greece="49 Greek party-year rows in trend file (20 parties: ND, PASOK, SYRIZA, KKE, XA, ANEL, Potami, LAOS, DIKKI, DIMAR, EL, MR25, PE, Niki, FL, Spartans...); 9 Greek parties in 2024",
    mode_sampling="expert survey (party-level)", political_vars="lrgen, lrecon, galtan, eu_position, antielite_salience, people_vs_elite, immigrate_policy, redistribution, etc.",
    weights="n/a", licence_terms="free download from chesdata.eu (GitHub releases); no explicit licence; citation required (Rovny et al. 2025 Electoral Studies 97)",
    commercial_use="not addressed - cite; ask CHES team for commercial redistribution", access_tier="A", reachable_from_env="yes (chesdata.eu + github.com 200)",
    downloaded="yes", local_path=f"{ARCH}/ches/", owner_download_steps="nothing to do", source_url="https://www.chesdata.eu/ches-europe", verified="yes")
add(programme="ParlGov", study_id="ParlGov development version (2023-11-04) csv zip + codebook",
    title="Parties, elections (incl. Greek parliamentary & EP results), cabinets; party L-R positions and party-family codes", election_or_fieldwork="Greece 1974-2023 (latest Greek election rows 2023-06-25)",
    n_greece="221 Greek election-party rows in view_election", mode_sampling="aggregate (official results + expert positions)",
    political_vars="vote_share, seats, left_right, state_market, liberty_authority, eu_anti_pro, cabinet parties, cmp/ches/ees ids for linking",
    weights="n/a", licence_terms="free download; citation requested (Doering, Quaas, Hesse & Manow 2023); no licence text on parlgov.org (stable Dataverse releases' licence not verified - Dataverse 403)",
    commercial_use="not addressed - cite", access_tier="A", reachable_from_env="yes (parlgov.org/data/... 200)", downloaded="yes",
    local_path=f"{ARCH}/parlgov/", owner_download_steps="nothing to do", source_url="https://www.parlgov.org/data-info/", verified="yes")
add(programme="PopuList", study_id="The PopuList 4.0 (OSF 10.17605/OSF.IO/2EWKQ)", title="Populist, far-left, far-right, Eurosceptic party classification",
    election_or_fieldwork="parties with >=2% vote / >=1 seat since 1989", n_greece="16 Greek parties (ANEL, DIKKI, EL, MeRa25, KKE, LAOS, GD, OE, POLAN, SYRIZA, LAE, SYN, NIKI, Course of Freedom, NA, Spartans)",
    mode_sampling="expert-informed qualitative classification (party-level)", political_vars="populist, farright, farleft, eurosceptic + start/end years",
    weights="n/a", licence_terms="free download; no licence set on OSF node; citation required (Rooduijn et al.)", commercial_use="not addressed - cite",
    access_tier="A", reachable_from_env="yes (popu-list.github.io 200; v4.0 xlsx link 404, CSV OK)", downloaded="yes (CSV)", local_path=f"{ARCH}/populist/",
    owner_download_steps="nothing to do", source_url="https://popu-list.org/", verified="yes")
add(programme="V-Party (V-Dem)", study_id="V-Party v2 country-party-date", title="V-Party: party organisation, populism, illiberalism (expert-coded) incl. Greek parties",
    election_or_fieldwork="1970-2019 elections", n_greece="not verified", mode_sampling="expert survey (party-election level)",
    political_vars="v2xpa_popul, v2xpa_illiberal, v2paanteli, v2papeople, v2pariglef (L-R economic), v2pagovsup",
    weights="n/a", licence_terms="V-Dem data CC BY-SA 4.0 (per V-Dem; not re-verified); download form asks email, gender, privacy consent",
    commercial_use="CC BY-SA allows with attribution/share-alike (verify)", access_tier="B (form with personal data)",
    reachable_from_env="yes (v-dem.net 200) but download behind personal-data form", downloaded="no", local_path="",
    owner_download_steps=f"1) https://www.v-dem.net/data/v-party-dataset/country-party-date-v2/ -> fill email/gender/privacy -> format CSV; 2) also download vparty_codebook_v2.pdf; 3) save into {DROP}/vparty/",
    source_url="https://www.v-dem.net/data/v-party-dataset/", verified="partly")
add(programme="Manifesto Project (MARPOR / CMP)", study_id="MPDS2026a (latest per API list_core_versions) + Greek manifesto corpus",
    title="Manifesto Project Dataset - Greek party manifestos 1974-2023 (MARPOR = same project)", election_or_fieldwork="Greek elections 1974-2023",
    n_greece="party-election level (not counted)", mode_sampling="content analysis of manifestos", political_vars="rile, planeco, markeco, welfare, per101-per706 categories, pervote",
    weights="n/a", licence_terms="free account + API key; terms: non-commercial scientific use, cite (exact licence text not verified)",
    commercial_use="no (non-commercial terms)", access_tier="B", reachable_from_env="yes: API list endpoints 200; get_core without key -> not_authorized",
    downloaded="no", local_path="",
    owner_download_steps=f"1) register at https://manifesto-project.wzb.eu (Login -> Register); 2) Profile -> generate API key; 3) either download 'MPDS2026a' CSV/Stata at https://manifesto-project.wzb.eu/datasets or give the key to the pipeline via env MANIFESTO_API_KEY (never commit it); 4) save into {DROP}/manifesto/",
    source_url="https://manifesto-project.wzb.eu/datasets", verified="partly")
add(programme="Party-position datasets at GESIS", study_id="ZA5839 EU-Profiler party positions 2009; ZA5917 (A)/ZA5918 (C) euandi 2014 experts; ZA7563 euandi 2019 experts; 10.7802/2550 PoPES (Personalization of Politics Expert Survey 1985-2016)",
    title="Expert/party coding incl. Greek parties", election_or_fieldwork="2009, 2014, 2019; 1985-2016", n_greece="party-level", mode_sampling="expert coding",
    political_vars="party positions on VAA statements; personalization", weights="n/a", licence_terms=GESIS_CAT["A"] + "; PoPES: free access without registration (per CESSDA)",
    commercial_use="no (cat. A)", access_tier="B", reachable_from_env=GESIS_REACH, downloaded="no", local_path="",
    owner_download_steps=gesis_steps("ZA5839 / ZA5917 / ZA7563", "party_positions"), source_url="https://search.gesis.org", verified="partly")

# ================================================================= VAAs
vaa = [
    ("GESIS ZA5813 (DOI 10.4232/1.11663)", "EU-Profiler 2009 - respondent-level data for Greece", "23-04 to 10-06-2009", "not verified (self-selected)", "A",
     "30 policy statements + salience; vote intention EP & national, last EP vote, left-right, trust, govt approval"),
    ("GESIS ZA5970", "euandi 2014 (general population users) - User profiles EP elections 2014 (incl. Greece)", "spring 2014", "not verified", "A", "policy statements, vote intention, left-right"),
    ("GESIS ZA7565", "euandi 2019 (general population users) - EP elections 2019 (incl. Greece)", "spring 2019", "not verified", "A", "policy statements, vote intention, left-right"),
    ("GESIS 10.7802/1758 (SowiDataNet|datorium)", "Choose4Greece: VAA data for the January and September 2015 parliamentary elections", "Jan & Sep 2015", "not verified", "CC", "policy statements, vote intention, past vote, left-right"),
]
for sid, title, fw, n, cat, vars_ in vaa:
    lic = "CC BY-NC-SA 4.0 (DataCite); 'free access with registration'" if cat == "CC" else GESIS_CAT[cat]
    add(programme="Greek VAAs (voting advice applications)", study_id=sid, title=title, election_or_fieldwork=fw, n_greece=n,
        mode_sampling="CAWI, self-selected VAA users (non-probability)", political_vars=vars_, weights="none",
        licence_terms=lic, commercial_use="no (NC)" if cat == "CC" else GESIS_COMM[cat], access_tier="B",
        reachable_from_env=GESIS_REACH, downloaded="no", local_path="",
        owner_download_steps=(gesis_steps(sid.split()[1], "vaa") if cat != "CC" else f"1) GESIS login; 2) open https://doi.org/10.7802/1758 ; 3) download data + codebook; 4) save into {DROP}/vaa/choose4greece/"),
        source_url=(f"https://search.gesis.org/research_data/{sid.split()[1]}" if cat != "CC" else "https://doi.org/10.7802/1758"), verified="partly")
add(programme="Greek VAAs (voting advice applications)", study_id="SoDaNet 10.17903/FK2/AWSSD3", title="What2vote: VAA data for the May and June 2023 parliamentary elections (Rori, Georgiadou, Roumanias; FES Athens)",
    election_or_fieldwork="May & June 2023", n_greece="not verified (user responses)", mode_sampling="CAWI, self-selected VAA users",
    political_vars="policy statements, vote intention 2023, past vote, left-right, demographics", weights="none",
    licence_terms="SoDaNet per-file terms (not verified; DataCite has no rights)", commercial_use="not verified - assume no", access_tier="B",
    reachable_from_env="no: SoDaNet 403 Cloudflare; metadata via CESSDA/DataCite", downloaded="no", local_path="", owner_download_steps=sdn_steps("10.17903/FK2/AWSSD3", "vaa"),
    source_url="https://doi.org/10.17903/FK2/AWSSD3", verified="partly")

# ================================================================= SoDaNet national studies
sdn = [
    ("10.17903/FK2/1Z89S4 (older DOI 10.17903/EKKE-1-0001-GR)", "EKKE Political Patterns & Political Behaviour survey, May 1985 (Mavrogordatos, Nikolakopoulos)", "06-05-1985 onward (election 02-06-1985)", "not verified", "F2F PAPI, probability", "vote intention/recall, party ID & sympathy, left-right, democracy vs dictatorship, institutions"),
    ("10.17903/FK2/4VOJXX (older DOI 10.17903/EKKE-1-0002-GR)", "EKKE Political Patterns survey, May 1988 (women and politics; Nikolakopoulos, Pantelidou-Malouta)", "May-June 1988", "not verified", "F2F PAPI, probability", "vote intention, party sympathy, left-right, political participation"),
    ("10.17903/FK2/1H5BVJ", "EKKE Political Patterns survey, May-June 1989 (pre-election)", "08-05 to 04-06-1989 (election 18-06-1989)", "not verified", "F2F PAPI, stratified probability", "vote intention, party sympathy, coalition attitudes, left-right"),
    ("10.17903/FK2/IXVXJP", "EKKE Political Patterns survey, October 1989 (pre-election)", "Oct 1989 (election 05-11-1989)", "not verified", "F2F PAPI, stratified probability", "vote intention, coalition government attitudes, left-right"),
    ("10.17903/FK2/NHKHK7", "EKKE Political Patterns survey, Sep-Oct 1996 (2-wave pre/post panel)", "07-13 Sep 1996 (n=1,196) + post-election Oct 1996 (election 22-09-1996)", "1,196 (wave 1)", "F2F PAPI panel, stratified probability", "vote intention + recall, party ID, left-right, democracy, information sources"),
    ("10.17903/FK2/D4SOZE", "EKKE Political Patterns & Political Behaviour, Feb-Mar 2004 (2-wave pre/post panel, Nikolakopoulos)", "Feb-Mar 2004 (election 07-03-2004)", "1,307 per wave", "F2F PAPI panel, stratified probability", "vote intention + recall, party ID, left-right, democracy, values"),
    ("10.17903/FK2/BFYG21", "Political patterns: gender differences (derived from Political Patterns surveys, 2022)", "derived", "not verified", "derived/aggregate", "gendered political patterns (check if microdata)"),
    ("10.17903/FK2/NUPVBG", "Exit Poll - January 2015 (GPO / MRB / Metron Analysis consortium)", "25-01-2015 (election day)", "not verified (typically 6,000-10,000)", "F2F PAPI at polling stations, stratified proportional probability", "vote cast 25-01-2015, previous vote (2012), time of decision, demographics"),
    ("10.17903/FK2/TOJHXS", "GPO 'Pan-Hellenic survey of political developments - January 2015' (pre-election poll)", "16-17 Jan 2015", "not verified (~1,000)", "CATI, stratified proportional", "vote intention, party evaluations, leader preference, expected winner"),
    ("10.17903/FK2/M2QNMK", "Prorata pre-election online survey 2019 (Tsatsanis, Tsirbas, Kolokythas) - negative partisanship", "15-21 Mar 2019", "not verified", "CAWI, non-probability", "vote intention, negative partisanship (party dislikes), left-right, leader evaluations"),
    ("10.17903/FK2/JQZQDA", "EKKE National post-election survey 2024 on the 2023 double election (Georgiadou, Linardis, Seriatos; Ministry of Interior programme)", "29-04 to 24-05-2024", "not verified", "CATI + CAWI, quota", "vote May & June 2023 + recall 2019, vote switching, party ID, left-right, leaders, issues, institutions, EU, economy"),
    ("10.17903/FK2/H6HDI2 ; 1RHGNR ; RID6UT (also GESIS 10.7802/1150, 1151, 1152 CC BY 4.0)", "Political & Social Radicalism in Greece, rounds 1-3 (Konstantinidis, Zafiropoulos, Georgiadou; Univ. of Macedonia/Panteion)", "R1 14-17 Jan 2015; R2 19-27 Feb 2015; R3 02-06 Nov 2015", "not verified (~1,000 per round)", "telephone, simple random probability", "turnout, vote intention/recall Jan & Sep 2015, conventional/unconventional participation, efficacy, economy, emotions, values"),
    ("10.17903/FK2/XHKBSS ; MRDJ8K (also GESIS 10.7802/1529)", "Collective Action of Indignant Citizens in Greece, waves 1-2 (Marantzidis; Aristeia II)", "May 2015 ; June 2015", "not verified", "interview (CATI 18+), multistage probability", "turnout, vote preferences, issue attitudes, economy, survey experiments, media use"),
    ("10.17903/FK2/EMVV0Z", "Radicalism and youth in crisis Greece (Pantelidou-Malouta)", "May-Sep 2016", "not verified", "F2F, purposive (non-probability)", "youth political attitudes, radicalism, participation"),
    ("10.17903/FK2/MVVLB4", "Patterns of politicisation and gender relations: young people (2019)", "2019", "not verified", "F2F", "youth political engagement, gender attitudes"),
    ("10.17903/FK2/J8CNAH ; 24J8LV ; SIHHBX", "diaNEOsis 'What Greeks believe' 2016 / 2018 / 2020 (already ingested via diaNEOsis)", "Mar-Apr 2015; Jan-Feb 2018; Nov-Dec 2019", "2016 n.v.; 2018 2x1,250; 2020 2,502", "CATI stratified/multistage", "left-right, trust, institutions, EU, populism-related items (party vote removed in current ingest)"),
    ("10.17903/FK2/QOXBNT ; 1EWKVT ; OXK2JF ; Z9GRGX", "Values in Crisis (Covid-19) survey waves 1-2 (international VIC, Greek team)", "2020 ; 2020/21", "not verified", "CAWI (online panel)", "political trust, authoritarianism, populism, institutional confidence"),
    ("10.17903/FK2/ALQSGU", "European National Elites and the Eurozone Crisis (ENEC-2014) - Greek MPs", "Feb-Oct 2014", "MPs (quota)", "F2F/telephone elite interviews", "MPs' EU and crisis attitudes, left-right"),
    ("10.17903/FK2/PXOLZA ; WWJA6A", "Members' survey - Ecologists Greens (Botetzagias)", "Jan-May 2003", "party members (n.v.)", "interview, non-probability", "party members' attitudes"),
    ("10.17903/FK2/RKVGSE ; YLKK3Z", "ICCS 2008 International Civic and Citizenship Education Study - Greece (14-year-olds)", "2008/09", "not verified", "school-based self-administered paper", "civic knowledge, political trust, intended participation (students)"),
]
for doi, title, fw, n, mode, vars_ in sdn:
    first = doi.split()[0]
    add(programme="SoDaNet (EKKE / Greek universities) - national political surveys", study_id=doi, title=title, election_or_fieldwork=fw, n_greece=n,
        mode_sampling=mode, political_vars=vars_, weights="not verified (check file)",
        licence_terms=("CC BY 4.0 for the GESIS copies; SoDaNet terms per file not verified" if "CC BY 4.0" in doi else "SoDaNet per-file terms (DataCite has no rights statement; CESSDA 'Uncategorized'); most files need login, some 'request access'"),
        commercial_use=("yes with attribution for the CC BY 4.0 GESIS copies (verify file-level licence)" if "CC BY 4.0" in doi else "not verified - needs written permission of EKKE/SoDaNet and depositor"),
        access_tier="B", reachable_from_env="no: datacatalogue.sodanet.gr 403 (Cloudflare); metadata via CESSDA API + DataCite",
        downloaded="no", local_path="", owner_download_steps=sdn_steps(first),
        source_url=f"https://doi.org/{first}", verified="partly")
add(programme="SoDaNet (EKKE) - derived indicators", study_id="~30 SoDaNet 'Δείκτες/Δεδομένα από ...' records (e.g. 10.17903/FK2/PLN1YW vote intention; N1HPQJ left-right; Z8D19U party sympathy/distance; H8ZS3O Thalis surveys; 5JMSVV vote choice process; K4WZH0 satisfaction w. democracy; OSQWL5 euroscepticism; SPL5LG xenophobia; HIVAEM anti-Americanism; RTLPBT anti-Germanism from Pew)",
    title="Aggregate time-series built from ESS, EKKE Political Patterns, Thalis (2015) and diaNEOsis surveys", election_or_fieldwork="1985-2020", n_greece="aggregate tables",
    mode_sampling="aggregate", political_vars="vote intention, left-right, party sympathy, trust, SWD - as % series", weights="n/a",
    licence_terms="SoDaNet per-file terms (not verified)", commercial_use="not verified", access_tier="B", reachable_from_env="no (SoDaNet 403)",
    downloaded="no", local_path="", owner_download_steps="low priority: useful as validation targets only; same SoDaNet steps",
    source_url="https://doi.org/10.17903/FK2/PLN1YW", verified="yes (records exist)")
add(programme="SoDaNet (EKKE) - election results (aggregate)", study_id="~20 'Εκλογικά αποτελέσματα/δεδομένα' records 1946-1993 (e.g. 10.17903/FK2/1L5NVL 1981, IKDCDR 1985, NENSAK 1989, RNNCZ7 1990, YR9FW7 1993)",
    title="Historic Greek election results by area", election_or_fieldwork="1946-1993", n_greece="aggregate", mode_sampling="official results",
    political_vars="party vote by constituency/municipality", weights="n/a", licence_terms="SoDaNet terms (not verified)", commercial_use="not verified",
    access_tier="B", reachable_from_env="no (SoDaNet 403)", downloaded="no", local_path="", owner_download_steps="handled by the official-results agent; only if historic small-area results are needed",
    source_url="https://doi.org/10.17903/FK2/1L5NVL", verified="yes (records exist)")

# ================================================================= other GESIS Greek political studies
other = [
    ("ZA2008 (DOI 10.4232/1.2008)", "The Political Culture of Southern Europe: A Four Nation Study (GR, ES, IT, PT)", "1985", "not verified", "F2F", "party ID, left-right, democracy legitimacy, participation", "A"),
    ("ZA0970 (DOI 10.4232/1.0970)", "Selected Political Questions (Image of Germany) in Eight Countries incl. Greece", "1977", "not verified", "F2F", "political attitudes, foreign policy", "A"),
    ("ZA5054", "The True European Voter (harmonised national election studies, incl. Greek studies)", "1956-2000s", "not verified", "harmonised NES", "vote, party ID, left-right (harmonised)", "C"),
    ("ZA5553", "Europinions: Public Opinion Survey (incl. Greece)", "2017", "not verified", "CAWI (not verified)", "EU attitudes, trust, left-right, vote intention (n.v.)", "A"),
    ("ZA7736 ; ZA7737 ; ZA7738", "European Parliament COVID-19 Survey rounds 1-3 (incl. Greece)", "2020", "~1,000 per round (n.v.)", "CAWI", "trust in government/EU, approval of measures, democracy", "0"),
    ("ZA9077", "Radical and Extremist Attitudes in Europe (incl. Greece)", "2021", "not verified", "CAWI (n.v.)", "radical left/right attitudes, populism, democracy, violence acceptance", "0"),
    ("ZA7776", "Everyday Life in Germany and Europe 2020 (Solikris; incl. Greece)", "2020", "not verified", "CAWI", "solidarity, trust, political orientation", "A"),
]
for za, title, fw, n, mode, vars_, cat in other:
    add(programme="Other GESIS studies with Greek respondents", study_id=za, title=title, election_or_fieldwork=fw, n_greece=n, mode_sampling=mode,
        political_vars=vars_, weights="see codebook", licence_terms=GESIS_CAT[cat], commercial_use=GESIS_COMM[cat],
        access_tier="B" if cat in "0A" else "C", reachable_from_env=GESIS_REACH, downloaded="no", local_path="",
        owner_download_steps=gesis_steps(za.split()[0], "gesis_other"), source_url=f"https://search.gesis.org/research_data/{za.split()[0]}", verified="partly")
sdn_gesis = [
    ("10.7802/2258", "Socio-political attitudes and preferences in Germany and Greece in times of COVID-19", "2020", "CAWI", "party preference, trust, policy preferences"),
    ("10.7802/2075", "Solidarity and Populism: A data collection project (incl. Greece)", "2019", "CAWI", "populist attitudes, vote, solidarity"),
    ("10.7802/2782", "ActEU public opinion survey (10 countries incl. Greece)", "2024", "CAWI", "trust, legitimacy, polarisation, vote, left-right"),
    ("10.7802/2573", "Transnational European Solidarity Survey (TESS) incl. Greece", "2016", "CAWI", "solidarity, EU, left-right, vote"),
    ("10.7802/2988 (trendfile 2018-2025) + yearly 2511/2510/2509/2508/2506/2646/2724/2986", "Solidarity in Europe (SiE, EUI/YouGov) - yearly waves + trendfile, Greece ~1,000/yr (Greek participation verified 2022-2023)", "2018-2025", "CAWI YouGov panel", "vote intention/recall, left-right, EU attitudes, solidarity, trust"),
]
for doi, title, fw, mode, vars_ in sdn_gesis:
    add(programme="GESIS SowiDataNet|datorium (Greek political deposits)", study_id=doi, title=title, election_or_fieldwork=fw, n_greece="not verified (SiE 2023: 1,016 per figshare copy)",
        mode_sampling=mode, political_vars=vars_, weights="see codebook",
        licence_terms=("CC BY 4.0 ('free access without registration' per CESSDA; GESIS now requires login)" if "2988" in doi else "free access with registration (licence not stated in DataCite)"),
        commercial_use=("yes with attribution (CC BY 4.0)" if "2988" in doi else "not stated - assume no"), access_tier="B",
        reachable_from_env=GESIS_REACH, downloaded="no", local_path="",
        owner_download_steps=f"1) GESIS login; 2) open https://doi.org/{doi.split()[0]} ; 3) download data + codebook; 4) save into {DROP}/gesis_sdn/{doi.split()[0].split('/')[-1]}/",
        source_url=f"https://doi.org/{doi.split()[0]}", verified="partly")

# ================================================================= not found / gaps
add(programme="EKKE / other Greek labs - not found", study_id="EKKE post-election survey 2019; Panteion/UoA/Crete election surveys; 'Greek Electoral Study'",
    title="Searched but no deposited respondent-level data found", election_or_fieldwork="2019-2026",
    n_greece="n/a", mode_sampling="n/a", political_vars="n/a", weights="n/a",
    licence_terms="EKKE 2019 post-election study is referenced in the 2024 study abstract but no SoDaNet/GESIS/DataCite record found; no deposits found for Panteion/UoA/Crete beyond the SoDaNet rows above",
    commercial_use="n/a", access_tier="n/a", reachable_from_env="n/a", downloaded="no", local_path="",
    owner_download_steps="email EKKE (Institute of Political Sociology, V. Georgiadou / A. Linardis) to ask whether the 2019 post-election data can be shared",
    source_url="https://datacatalogue.cessda.eu", verified="partly")

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=COLS)
    w.writeheader()
    w.writerows(rows)
with open(OUT_EB, "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["za", "title", "collection_year", "type", "gesis_access_category", "political_flag", "gesis_url"])
    for e in sorted([e for e in eb if e["gr"]], key=lambda e: (e["type"], e["year"], e["za"])):
        pf = "post-electoral/EP" if re.search(r"post|EP\b|elect|European Parliament", e["title"], re.I) else ""
        w.writerow([e["za"], e["title"], e["year"], e["type"], e["acc"], pf, f"https://search.gesis.org/research_data/{e['za']}"])
print("rows", len(rows), "->", OUT)
print("eb rows", len([e for e in eb if e['gr']]), "->", OUT_EB)
