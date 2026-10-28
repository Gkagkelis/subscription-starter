"""Unit tests του lake pipeline (χωρίς δίκτυο):  python -m unittest lake.test_lake  (από scripts/synthetic-lab)."""

import os
import tempfile
import unittest

os.environ.setdefault("SYNTHETIC_LAB_LAKE_DIR", tempfile.mkdtemp(prefix="lake-unit-"))

from lake import db, eurobarometer as eb, export, topics, worldbank  # noqa: E402


class EurobarometerTables(unittest.TestCase):
    def test_paired_count_percent_rows(self):
        # Volume A/C (2015+): γραμμή πλήθους (FR) + γραμμή ποσοστού (EN)
        rows = [[None, "Total", 1007], [None, "Très positive", 53], [None, "Very positive", 0.05], [None, "Assez positive", 318],
                [None, "Fairly positive", 0.32], [None, "Neutre", 318], [None, "Neutral", 0.31], [None, "Négative", 310],
                [None, "Negative", 0.31], [None, "Ne sait pas", 8], [None, "Don't know", 0.01], [None, "Total 'Positive'", 371]]
        opts, base, multi = eb._options(rows, 0, 2, lab_end=2)
        self.assertEqual(base, 1007)
        self.assertEqual([o for o, _ in opts], ["Very positive", "Fairly positive", "Neutral", "Negative", "Don't know"])
        self.assertEqual(opts[1][1], 32.0)
        self.assertFalse(multi)

    def test_stacked_n_total_valid_layout(self):
        # Παλαιότερα Flash: «N / Total % / Valid %» ανά επιλογή
        rows = [["", "Weighted Total", 1000], ["None", "N", 227], ["", "Total %", 22.7], ["", "Valid %", 22.8],
                ["1", "N", 500], ["", "Total %", 50.0], ["", "Valid %", 50.1], ["2+", "N", 273], ["", "Total %", 27.3], ["", "Valid %", 27.1]]
        opts, base, _ = eb._options(rows, 0, 2, lab_end=2)
        self.assertEqual(opts, [("None", 22.7), ("1", 50.0), ("2+", 27.3)])

    def test_unlabelled_percent_row_after_count(self):
        # Flash 2024: ετικέτα στη γραμμή πλήθους, ποσοστό (0–100) στην επόμενη χωρίς ετικέτα
        rows = [["Base: Total", 502], ["Base: Weighted Total", 502], ["None", 52], [None, 10.4], ["Less than 20%", 64], [None, 12.8],
                ["20%-49%", 149], [None, 29.7], ["50%+", 237], [None, 47.1]]
        opts, base, _ = eb._options(rows, 0, 1, lab_end=1)
        self.assertEqual(base, 502)
        self.assertEqual(opts, [("None", 10.4), ("Less than 20%", 12.8), ("20%-49%", 29.7), ("50%+", 47.1)])

    def test_source_duplicate_dk_row_removed(self):
        rows = [[None, "Never", 0.66], [None, "Seldom", 0.06], [None, "Often", 0.28], [None, "Don't know", 0.66]]
        opts, _, multi = eb._options(rows, 0, 2, lab_end=2)
        self.assertNotIn("Don't know", [o for o, _ in opts])
        self.assertFalse(multi)

    def test_wave_year_estimates(self):
        self.assertEqual(eb._wave_year("s1054_77_2_ebs389", "Special Eurobarometer 389"), 2012)
        self.assertEqual(eb._wave_year("x", "Standard Eurobarometer 103 - Spring 2025"), 2025)
        self.assertIn(eb._wave_year("s2009_408_eng", "Flash Eurobarometer 408: European Youth"), (2014, 2015))

    def test_volume_selectors(self):
        self.assertTrue(eb.VOL_A.search("Sport_SP574_volume A.xlsx"))
        self.assertTrue(eb.VOL_A.search("OP_VolumeAEB772AGRIagri.zip"))
        self.assertFalse(eb.VOL_A.search("OP_VolumeAAEB772AGRIagri.zip"))
        self.assertFalse(eb.VOL_A.search("volume AP.xlsx"))
        self.assertTrue(eb.VOL_C.search("Standard_STD103_Spring_2025_Volume C_AL-IT.zip"))
        self.assertTrue(eb._is_greek_member("Sport_SP574_volume C_EL_v2.xlsx"))
        self.assertFalse(eb._is_greek_member("Sport_SP574_volume C_ES_v2.xlsx"))


class Filters(unittest.TestCase):
    def test_greece_relevance_without_false_positives(self):
        self.assertTrue(topics.greece_relevant("Survey of Greek consumers"))
        self.assertTrue(topics.greece_relevant("Έρευνα στην Αθήνα"))
        self.assertFalse(topics.greece_relevant("Gel electrophoresis protocol"))
        self.assertFalse(topics.survey_relevant("Seawater quality in Crete", "sediment samples"))

    def test_person_indicator_filter(self):
        self.assertTrue(export._person_indicator("eurostat:ilc_mdes01", "PC", "Inability to keep home adequately warm", "percent"))
        self.assertTrue(export._person_indicator("eurostat:isoc_ec_ib20", "PC_IND", "Internet purchases", "percent"))
        self.assertFalse(export._person_indicator("eurostat:earn_ses18_48", "PC", "Overtime pay as a percentage of earnings", "percent"))
        self.assertFalse(export._person_indicator("eurostat:env_ac_ccminv", "PC_GDP", "Investments in climate change mitigation", "percent"))

    def test_political_items_excluded(self):
        self.assertTrue(export.POLITICAL.search("If there were a general election tomorrow, which party would you vote for?"))
        self.assertFalse(export.POLITICAL.search("How satisfied are you with the life you lead?"))

    def test_findex_breakdown_parsing(self):
        self.assertEqual(worldbank._split("Account, female (% age 15+)")[:2], ("Account", ("gender", "female")))
        self.assertEqual(worldbank._split("Account, income, poorest 40% (% ages 15+)")[1], ("income_findex", "poorest_40"))
        self.assertEqual(worldbank._split("Account (% age 15+)")[1], ("all", "all"))
        # ονομασίες κυμάτων 2021+: men/women, in laborforce, χωρίς «income,»
        self.assertEqual(worldbank._split("Used a mobile phone or the internet to buy something online, men (% age 15+)")[1], ("gender", "male"))
        self.assertEqual(worldbank._split("Made a digital payment, in laborforce (% age 15+)")[1], ("labor_force", "in"))
        self.assertEqual(worldbank._split("Saved any money, poorest 40% (% age 15+)")[1], ("income_findex", "poorest_40"))
        # ο παρονομαστής επιστρέφεται ώστε να μη συγχωνεύονται δείκτες με διαφορετικό πληθυσμό-βάση
        self.assertEqual(worldbank._split("Made a digital payment (% of account owners, age 15+)")[2], "% of account owners, age 15+")
        self.assertEqual(worldbank._split("Account (% ages 15-24)")[:2], ("Account", ("age_findex", "15-24")))
        self.assertEqual(worldbank._split("Account (% age 25+)")[1], ("age_findex", "25+"))

    def test_dedup_key_normalises(self):
        self.assertEqual(topics.dedup_key("Eurobarometer 77.2: Food!", 2012), topics.dedup_key("eurobarometer 77.2 food", 2012))


class StatusMachine(unittest.TestCase):
    def test_status_never_downgrades_except_failed_restricted(self):
        con = db.connect(os.path.join(tempfile.mkdtemp(), "t.sqlite"))
        db.upsert_study(con, study_id="t:1", source_id="t", title="x", status="VALIDATED")
        db.upsert_study(con, study_id="t:1", status="DISCOVERED")
        self.assertEqual(con.execute("SELECT status FROM studies").fetchone()[0], "VALIDATED")
        db.upsert_study(con, study_id="t:1", status="FAILED")
        self.assertEqual(con.execute("SELECT status FROM studies").fetchone()[0], "FAILED")

    def test_queue_retry_backoff_and_give_up(self):
        con = db.connect(os.path.join(tempfile.mkdtemp(), "q.sqlite"))
        db.enqueue(con, "k1", "x", {"a": 1})
        for _ in range(4):
            db.task_done(con, "k1", "retry", "boom")
        r = con.execute("SELECT state, attempts FROM queue").fetchone()
        self.assertEqual((r[0], r[1]), ("failed", 4))


if __name__ == "__main__":
    unittest.main()
