"""
Registry πηγών (Deliverable A) + έλεγχος προσβασιμότητας. Κάθε πηγή καταγράφεται ακόμη κι αν δεν είναι προσβάσιμη,
με τον λόγο (HTTP status, απαίτηση εγγραφής, μη δημόσιο API), ώστε η κάλυψη να αναφέρεται με ειλικρίνεια.
"""

from . import db, net

# source_id, όνομα, είδος, base_url, probe/api url, πρόσβαση, άδεια, connector, σημειώσεις
SOURCES = [
    ("eurostat", "Eurostat (API διάδοσης, JSON-stat)", "official_statistics", "https://ec.europa.eu/eurostat", "https://ec.europa.eu/eurostat/api/dissemination/catalogue/toc/txt?lang=en",
     "open_api", "CC BY 4.0 (Commission Decision 2011/833/EU)", "lake.eurostat", "Όλα τα σύνολα με γεωγραφία EL από 2012, διασπάσεις φύλου/ηλικίας/μόρφωσης/εισοδήματος."),
    ("eurobarometer", "Eurobarometer (DG COMM) μέσω data.europa.eu", "survey_tables", "https://europa.eu/eurobarometer", "https://data.europa.eu/api/hub/search/search?q=eurobarometer&limit=1",
     "open_download", "Commission Decision 2011/833/EU", "lake.eurobarometer", "Volume A (ανά χώρα) και Volume C (διασπάσεις για την Ελλάδα). Τα microdata είναι στη GESIS (εγγραφή)."),
    ("data_europa", "data.europa.eu (Ευρωπαϊκή πύλη ανοικτών δεδομένων)", "catalog", "https://data.europa.eu", "https://data.europa.eu/api/hub/search/search?q=greece&limit=1",
     "open_api", "Ανά σύνολο δεδομένων", "lake.eurobarometer", "Χρησιμοποιείται για τον κατάλογο Eurobarometer (catalog «commu»)."),
    ("worldbank", "World Bank Open Data (Global Findex, WDI)", "survey_aggregates", "https://data.worldbank.org", "https://api.worldbank.org/v2/country/GRC?format=json",
     "open_api", "CC BY 4.0", "lake.worldbank", "Global Findex: Gallup World Poll, Ελλάδα 2011–2024."),
    ("cessda", "CESSDA Data Catalogue", "catalog", "https://datacatalogue.cessda.eu", "https://datacatalogue.cessda.eu/api/DataSets/v2/search?q=Greece&limit=1&metadataLanguage=en",
     "open_api_metadata", "Μεταδεδομένα CC0· δεδομένα ανά αρχείο", "lake.catalogs", "Μεταδεδομένα ερευνών (περιλαμβάνει SoDaNet/GESIS/FSD κ.ά.)· τα microdata συνήθως με εγγραφή."),
    ("openaire", "OpenAIRE Graph", "catalog", "https://graph.openaire.eu", "https://api.openaire.eu/graph/v1/researchProducts?search=greece&type=dataset&pageSize=1",
     "open_api_metadata", "Μεταδεδομένα CC BY", "lake.catalogs", "Ανακάλυψη datasets· τα αρχεία λαμβάνονται από το αποθετήριο προέλευσης."),
    ("crossref", "Crossref (DOI datasets)", "catalog", "https://www.crossref.org", "https://api.crossref.org/works?filter=type:dataset&rows=0",
     "open_api_metadata", "Μεταδεδομένα CC0", "lake.catalogs", "Επαλήθευση DOI και εντοπισμός διπλοτύπων."),
    ("zenodo", "Zenodo", "repository", "https://zenodo.org", "https://zenodo.org/api/records?q=greece&size=1", "open_api", "Ανά εγγραφή", "lake.repos", "Αρχεία ερευνών (CSV/XLSX/SAV) όπου η άδεια επιτρέπει."),
    ("figshare", "Figshare", "repository", "https://figshare.com", "https://api.figshare.com/v2/articles?page_size=1", "open_api", "Ανά εγγραφή", "lake.repos", ""),
    ("harvard_dataverse", "Harvard Dataverse", "repository", "https://dataverse.harvard.edu", "https://dataverse.harvard.edu/api/search?q=greece&type=dataset&per_page=1",
     "open_api", "Ανά εγγραφή (συχνά CC0)", "lake.repos", "Αρχεία με περιορισμό πρόσβασης παραλείπονται."),
    ("dataverse_nl", "DataverseNL", "repository", "https://dataverse.nl", "https://dataverse.nl/api/search?q=greece&type=dataset&per_page=1", "open_api", "Ανά εγγραφή", "lake.repos", ""),
    ("mendeley", "Mendeley Data", "repository", "https://data.mendeley.com", "https://data.mendeley.com/api/research-data/search?search=greece",
     "no_public_json_api", "Ανά εγγραφή", None, "Η αναζήτηση δεν επιστρέφει JSON χωρίς OAuth· δεν συλλέγεται αυτόματα."),
    ("oecd", "OECD Data Explorer (SDMX)", "official_statistics", "https://data-explorer.oecd.org", "https://sdmx.oecd.org/public/rest/dataflow/all?detail=allstubs",
     "open_api", "OECD Terms (επαναχρησιμοποίηση με αναφορά)", None, "Διαθέσιμο· οι ελληνικοί δείκτες κοινωνικής/καταναλωτικής συμπεριφοράς καλύπτονται κυρίως από Eurostat (ίδια υποκείμενα δεδομένα)."),
    ("ecb", "ECB Data Portal (CES, HFCS aggregates)", "official_statistics", "https://data.ecb.europa.eu", "https://data-api.ecb.europa.eu/service/dataflow/ECB?detail=allstubs",
     "open_api", "ECB reuse policy", None, "Ήδη ενσωματωμένο στο Lab (Consumer Expectations Survey context)."),
    ("elstat", "ΕΛΣΤΑΤ (statistics.gr)", "official_statistics", "https://www.statistics.gr", "https://www.statistics.gr/", "open_web",
     "Ελεύθερη επαναχρησιμοποίηση με αναφορά", None, "Οι ελληνικές έρευνες ΕΛΣΤΑΤ (ΕΕΔ, EU-SILC, ICT, ΕΟΠ, Υγεία) διαβιβάζονται στη Eurostat και συλλέγονται από εκεί· microdata με αίτηση."),
    ("data_gov_gr", "data.gov.gr", "catalog", "https://data.gov.gr", "https://data.gov.gr/api/v1/query/", "token_api", "Ανά σύνολο", None,
     "Το API απαιτεί token· τα σύνολα είναι κυρίως διοικητικά (όχι έρευνες γνώμης/καταναλωτών)."),
    ("ekke", "ΕΚΚΕ / SoDaNet (Ελληνικό αρχείο κοινωνικών δεδομένων)", "archive", "https://www.ekke.gr", "https://sodanet.ekke.gr/", "registration",
     "Άδεια χρήσης αρχείου", None, "Η μεταδεδομένη κάλυψη έρχεται μέσω CESSDA· τα microdata απαιτούν εγγραφή."),
    ("dianeosis", "διαΝΕΟσις", "think_tank", "https://www.dianeosis.org", "https://www.dianeosis.org/", "open_web_reports", "Δημοσιεύσεις με αναφορά", None,
     "Ήδη ενσωματωμένο στο Lab (πολυκυματική έρευνα «Τι πιστεύουν οι Έλληνες»)."),
    ("iobe", "ΙΟΒΕ", "think_tank", "https://iobe.gr", "https://iobe.gr/", "open_web_reports", "Δημοσιεύσεις", None,
     "Οι έρευνες καταναλωτών ΙΟΒΕ είναι το ελληνικό σκέλος του EC BCS (ήδη ενσωματωμένο από DG ECFIN)."),
    ("ine_gsee", "ΙΝΕ ΓΣΕΕ", "think_tank", "https://www.inegsee.gr", "https://www.inegsee.gr/", "open_web_reports", "Δημοσιεύσεις", None, "Εκθέσεις PDF· χωρίς API."),
    ("ime_gsevee", "ΙΜΕ ΓΣΕΒΕΕ", "think_tank", "https://imegsevee.gr", "https://imegsevee.gr/", "open_web_reports", "Δημοσιεύσεις", None, "Εκθέσεις PDF (έρευνες οικονομικού κλίματος ΜμΕ)· χωρίς API."),
    ("bank_of_greece", "Τράπεζα της Ελλάδος", "official_statistics", "https://www.bankofgreece.gr", "https://www.bankofgreece.gr/", "open_web",
     "Ελεύθερη με αναφορά", None, "Στατιστικά πληρωμών· τα ευρωπαϊκά αντίστοιχα (ECB) είναι προσβάσιμα."),
    ("ess", "European Social Survey", "survey_microdata", "https://www.europeansocialsurvey.org", "https://www.europeansocialsurvey.org/", "registration",
     "CC BY 4.0 με εγγραφή χρήστη", None, "Ελλάδα: γύροι 1–5 (2002–2011) και 10–11· microdata μετά από εγγραφή (δεν αυτοματοποιείται)."),
    ("evs_wvs", "EVS / WVS", "survey_microdata", "https://www.worldvaluessurvey.org", "https://www.worldvaluessurvey.org/", "registration",
     "Μη εμπορική χρήση, εγγραφή", None, "Ελλάδα: EVS 2017/WVS7· microdata μετά από εγγραφή/αποδοχή όρων."),
    ("gesis", "GESIS Data Archive", "archive", "https://search.gesis.org", "https://search.gesis.org/", "registration", "Ανά μελέτη (συνήθως εγγραφή)", None,
     "Microdata Eurobarometer/ISSP/EVS· μεταδεδομένα μέσω CESSDA."),
    ("ees", "European Election Studies", "survey_microdata", "https://www.europeanelectionstudies.net", "https://www.europeanelectionstudies.net/", "registration",
     "Μέσω GESIS", None, "Πολιτικές στάσεις· microdata μέσω GESIS (εγγραφή). Δεν χρησιμοποιείται για εκλογική στόχευση."),
    ("share", "SHARE (50+)", "survey_microdata", "https://share-eric.eu", "https://share-eric.eu/", "registration", "Συμφωνητικό χρήσης", None,
     "Ελλάδα σε πολλά κύματα· microdata μόνο με υπογεγραμμένο συμφωνητικό."),
    ("openalex", "OpenAlex", "catalog", "https://openalex.org", "https://api.openalex.org/works?filter=type:dataset&per-page=1", "open_api_metadata", "CC0", None,
     "Δημοσιεύσεις/datasets· περιορισμός ρυθμού (429) — η ανακάλυψη datasets γίνεται μέσω OpenAIRE/Crossref."),
    ("icpsr", "ICPSR", "archive", "https://www.icpsr.umich.edu", "https://www.icpsr.umich.edu/", "registration", "Ανά μελέτη", None, "Μεταδεδομένα· λήψη με λογαριασμό."),
    ("ec_open_data", "Ευρωπαϊκή Επιτροπή — ανοικτά δεδομένα (DG ECFIN BCS κ.λπ.)", "official_statistics", "https://economy-finance.ec.europa.eu",
     "https://economy-finance.ec.europa.eu/economic-forecast-and-surveys/business-and-consumer-surveys_en", "open_download", "Commission Decision 2011/833/EU", None,
     "Έρευνα καταναλωτών (ελληνικό σκέλος ΙΟΒΕ)· ήδη ενσωματωμένη στο Lab."),
    ("lab_existing", "Ήδη ενσωματωμένα σύνολα του Synthetic Research Lab", "internal", "", "", "internal", "Ανά σύνολο", "lake.existing",
     "NORAYA priors, GLOPOP-S, Eurostat/ELSTAT πληθυσμός, diaNEOsis, EC BCS, ECB CES, HBS — καταγράφονται ως INTEGRATED."),
]


def register_and_probe(con):
    for (sid, name, kind, base, probe, access, lic, conn, notes) in SOURCES:
        status, reach = None, None
        if probe:
            try:
                net.get(probe, retries=1, timeout=30, max_bytes=2_000_000)
                status, reach = "200", 1
            except net.HttpError as e:
                status, reach = str(e.status), 0 if e.status not in (413,) else 1
            except Exception as e:  # noqa: BLE001
                status, reach = f"ERR {type(e).__name__}", 0
        db.upsert_source(con, source_id=sid, name=name, kind=kind, base_url=base, api_url=probe, access=access, license_default=lic,
                         connector=conn, reachable=reach, http_status=status, notes=notes)
        db.log(con, "sources", f"{sid}: {status}", ok=bool(reach) if reach is not None else True, source_id=sid)
        print(f"  {sid:18} {status or '-':10} {access}")
    con.commit()
    return len(SOURCES)
