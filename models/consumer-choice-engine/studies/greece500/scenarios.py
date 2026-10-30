"""Greece 500 — ορισμός σεναρίων (σε ευρώ 2025) ανά ερώτηση και ανά εκπαιδευμένο μοντέλο.
Κανένα ποσοστό δεν ορίζεται εδώ· μόνο εναλλακτικές και χαρακτηριστικά. Τα επίπεδα που δεν υπάρχουν στο εκπαιδευμένο
μοντέλο δεν μπορούν να εκφραστούν (π.χ. κόστος επισκευής, trade-in, εγγύηση)."""

REPAIR = {"none": (0, 0), "limited": (1, 0), "full": (0, 1)}
RECY = {"none": (0, 0), "limited": (1, 0), "full": (0, 1)}
ENV = {"low": (0, 0), "medium": (1, 0), "very_high": (0, 1)}
ENERGY = {"G": (0, 0, 0), "E": (1, 0, 0), "C": (0, 1, 0), "A": (0, 0, 1)}


def product(alt, price, life, repair="limited", recy="limited", env="medium", energy="C"):
    rl, rf = REPAIR[repair]
    yl, yf = RECY[recy]
    em, eh = ENV[env]
    e1, e2, e3 = ENERGY[energy]
    return {"alt_id": alt, "price_eur": float(price), "life_years": life, "repair_limited": rl, "repair_full": rf, "recy_limited": yl, "recy_full": yf,
            "env_impact_medium": em, "env_impact_very_high": eh, "energy_E": e1, "energy_C": e2, "energy_A": e3}


def phone_offer(alt, price, cond=None, seller="oem"):
    """cond: None (νέο) | used | refurbished | open_box· seller: unauthorized | authorized | oem."""
    return {"alt_id": alt, "price_eur": float(price), "cond_refurbished": int(cond == "refurbished"), "cond_open_box": int(cond == "open_box"),
            "seller_authorized": int(seller == "authorized"), "seller_oem": int(seller == "oem")}


def delivery(alt, fee, minutes, privacy_risk=0):
    return {"alt_id": alt, "fee_eur": float(fee), "wait_hours": minutes / 60, "privacy_risk": privacy_risk}


# ----------------------------------------------------------------- πλυντήρια (μοντέλο: Ελβετία, πλυντήρια)
WM_REF = dict(price=549, life=10, repair="limited", recy="limited", env="medium", energy="C")
WM_GRID = list(range(449, 900, 50))
SP_REF = dict(price=299, life=4, repair="limited", recy="limited", env="medium", energy="C")
SP_GRID = list(range(249, 450, 25))


def _curve(ref, grid, **upgrade):
    return {f"{p}": [product("A", **{**ref, **upgrade, "price": p}), product("B", **ref)] for p in grid}


def wm_questions():
    Q = []
    Q.append(("WM1", "Πλήρως επισκευάσιμο πλυντήριο (τιμή Α) έναντι βασικού μοντέλου 549 € με περιορισμένη επισκευασιμότητα", "price_curve", _curve(WM_REF, WM_GRID, repair="full")))
    Q.append(("WM2", "Πλυντήριο 15 ετών λειτουργικής διάρκειας (τιμή Α) έναντι βασικού 10 ετών στα 549 €", "price_curve", _curve(WM_REF, WM_GRID, life=15)))
    Q.append(("WM3", "Ενεργειακή κλάση A (τιμή Α) έναντι κλάσης C στα 549 €", "price_curve", _curve(WM_REF, WM_GRID, energy="A")))
    Q.append(("WM4", "«Κυκλικό» πλυντήριο: πλήρως επισκευάσιμο, 15 έτη, κλάση A, ανακυκλώσιμο (τιμή Α) έναντι βασικού 549 €", "price_curve",
              _curve(WM_REF, WM_GRID, repair="full", life=15, energy="A", recy="full")))
    Q.append(("WM5", "Μη επισκευάσιμο πλυντήριο με έκπτωση (τιμή Α) έναντι βασικού 549 €", "price_curve", _curve(WM_REF, list(range(349, 550, 50)), repair="none")))
    budget = dict(price=399, life=5, repair="none", recy="none", env="medium", energy="E")
    premium = dict(price=799, life=15, repair="full", recy="full", env="low", energy="A")
    Q.append(("WM6", "Σύγκριση προσφορών: Οικονομικό 399 € / Βασικό 549 € / Premium 799 €", "offer_pairs", {
        "Βασικό(A) vs Οικονομικό(B)": [product("A", **WM_REF), product("B", **budget)],
        "Premium(A) vs Βασικό(B)": [product("A", **premium), product("B", **WM_REF)],
        "Premium(A) vs Οικονομικό(B)": [product("A", **premium), product("B", **budget)]}))
    Q.append(("WM7", "Επισκευασιμότητα στην ίδια τιμή (549 €)", "levels", {
        "περιορισμένη(A) vs καθόλου(B)": [product("A", **WM_REF), product("B", **{**WM_REF, "repair": "none"})],
        "πλήρης(A) vs περιορισμένη(B)": [product("A", **{**WM_REF, "repair": "full"}), product("B", **WM_REF)],
        "πλήρης(A) vs καθόλου(B)": [product("A", **{**WM_REF, "repair": "full"}), product("B", **{**WM_REF, "repair": "none"})]}))
    Q.append(("WM8", "Ενεργειακή κλάση στην ίδια τιμή (549 €)", "levels", {
        f"{e}(A) vs G(B)": [product("A", **{**WM_REF, "energy": e}), product("B", **{**WM_REF, "energy": "G"})] for e in ("E", "C", "A")}))
    return Q


def sp_questions():
    Q = []
    Q.append(("SP1", "Πλήρως επισκευάσιμο smartphone (τιμή Α) έναντι βασικού 299 € με περιορισμένη επισκευασιμότητα", "price_curve", _curve(SP_REF, SP_GRID, repair="full")))
    Q.append(("SP2", "Smartphone 8 ετών λειτουργικής διάρκειας (τιμή Α) έναντι βασικού 4 ετών στα 299 €", "price_curve", _curve(SP_REF, SP_GRID, life=8)))
    Q.append(("SP3", "Smartphone ενεργειακής κλάσης A (τιμή Α) έναντι κλάσης C στα 299 €", "price_curve", _curve(SP_REF, SP_GRID, energy="A")))
    Q.append(("SP4", "Μη επισκευάσιμο smartphone με έκπτωση (τιμή Α) έναντι βασικού 299 €", "price_curve", _curve(SP_REF, list(range(199, 300, 25)), repair="none")))
    budget = dict(price=199, life=2, repair="none", recy="none", env="medium", energy="E")
    premium = dict(price=429, life=8, repair="full", recy="full", env="low", energy="A")
    Q.append(("SP5", "Σύγκριση προσφορών smartphone: Οικονομικό 199 € / Βασικό 299 € / Premium 429 €", "offer_pairs", {
        "Βασικό(A) vs Οικονομικό(B)": [product("A", **SP_REF), product("B", **budget)],
        "Premium(A) vs Βασικό(B)": [product("A", **premium), product("B", **SP_REF)],
        "Premium(A) vs Οικονομικό(B)": [product("A", **premium), product("B", **budget)]}))
    return Q


# ----------------------------------------------------------------- νέο vs refurbished (μοντέλο: ΗΠΑ 2019, πλαίσιο brand «apple»)
NEW_PRICE = 299
REF_B = dict(cond="used", seller="unauthorized")


def rf_questions():
    def sc(price_a, cond_a, seller_a):
        return [phone_offer("refurb_A", price_a, cond_a, seller_a), phone_offer("refurb_B", NEW_PRICE * 0.5, **REF_B), phone_offer("new", NEW_PRICE, None, "oem")]
    Q = []
    Q.append(("RF1", "Ανακατασκευασμένο από τον κατασκευαστή με έκπτωση d έναντι νέου 299 € (και μεταχειρισμένου 150 € από τρίτο)", "discount_curve",
              {f"{d}%": sc(round(NEW_PRICE * (1 - d / 100), 2), "refurbished", "oem") for d in (10, 20, 30, 40, 50, 60)}))
    Q.append(("RF2", "Ποιος πωλεί το ανακατασκευασμένο (έκπτωση 30%)", "levels",
              {s: sc(round(NEW_PRICE * 0.7, 2), "refurbished", k) for s, k in [("μη εξουσιοδοτημένος τρίτος", "unauthorized"), ("εξουσιοδοτημένος τρίτος", "authorized"), ("κατασκευαστής", "oem")]}))
    Q.append(("RF3", "Κατάσταση του προϊόντος (έκπτωση 30%, εξουσιοδοτημένος πωλητής)", "levels",
              {s: sc(round(NEW_PRICE * 0.7, 2), k, "authorized") for s, k in [("μεταχειρισμένο", "used"), ("refurbished", "refurbished"), ("open box", "open_box")]}))
    return Q


# ----------------------------------------------------------------- παράδοση (μοντέλο: ΗΠΑ 2022, παράδοση εντός ημέρας)
def dl_questions():
    Q = []
    Q.append(("DL1", "Ψώνια τελευταίας στιγμής: drone σε 20′ με χρέωση Χ έναντι επίγειας σε 45′ με 1 €", "fee_curve", "last_minute_groceries",
              {f"{f:.2f}": [delivery("ground", 1.0, 45), delivery("drone", f, 20)] for f in [x * 0.25 for x in range(0, 10)]}))
    Q.append(("DL2", "Φαγητό σε πακέτο: drone σε 15′ με χρέωση Χ έναντι επίγειας σε 45′ με 1 €", "fee_curve", "takeout_food",
              {f"{f:.2f}": [delivery("ground", 1.0, 45), delivery("drone", f, 15)] for f in [x * 0.25 for x in range(0, 10)]}))
    Q.append(("DL3", "Φάρμακα με συνταγή: drone σε 30′ με χρέωση Χ έναντι δωρεάν επίγειας σε 6 ώρες", "fee_curve", "prescription_medications",
              {f"{f:.2f}": [delivery("ground", 0.0, 360), delivery("drone", f, 30)] for f in [x * 0.5 for x in range(0, 10)]}))
    Q.append(("DL4", "Ιδιωτικότητα: drone 1 € σε 20′ με/χωρίς προστασία δεδομένων έναντι επίγειας 1 € σε 45′ (ψώνια)", "levels", "last_minute_groceries",
              {"με προστασία": [delivery("ground", 1.0, 45), delivery("drone", 1.0, 20, 0)], "χωρίς προστασία": [delivery("ground", 1.0, 45), delivery("drone", 1.0, 20, 1)]}))
    return Q


# Εύρη ανά κατηγορία του πειράματος παράδοσης (attributes.py των συγγραφέων· adapter berke2023_drone): USD και ώρες
DL_RANGES = {c: {"fee_usd": [0, 5], "wait_hours": [0.25, 0.75]} for c in ("takeout_food", "liquor_store", "last_minute_groceries")}
DL_RANGES["prescription_medications"] = {"fee_usd": [0, 10], "wait_hours": [0.5, 24]}

# Ερωτήσεις του ερωτηματολογίου ΧΩΡΙΣ εκπαιδευμένους συντελεστές: δοκιμάζονται στην πύλη, δεν παράγουν απαντήσεις
UNSUPPORTED_PROBES = [
    ("U1", "Επισκευή παλιού πλυντηρίου (150 €) ή αγορά νέου (549 €)", "washing_machine_repair_vs_replace",
     [{"alt_id": "repair", "repair_cost_eur": 150}, {"alt_id": "new", "price_eur": 549}], "swiss-ce-washing-machine"),
    ("U2", "Νέο πλυντήριο με trade-in 60 € έναντι χωρίς trade-in", "washing_machine",
     [product("A", **WM_REF) | {"tradein_eur": 60}, product("B", **WM_REF)], "swiss-ce-washing-machine"),
    ("U3", "Νέο πλυντήριο με επέκταση εγγύησης 3 ετών", "washing_machine",
     [product("A", **WM_REF) | {"warranty_years": 5}, product("B", **WM_REF)], "swiss-ce-washing-machine"),
    ("U4", "Αγορά με 12 άτοκες δόσεις", "washing_machine",
     [product("A", **WM_REF) | {"installments": 12}, product("B", **WM_REF)], "swiss-ce-washing-machine"),
    ("U5", "Παράδοση πλυντηρίου σε 1 έναντι 5 ημερών", "washing_machine_delivery",
     [delivery("ground", 0, 5 * 24 * 60), delivery("drone", 20, 24 * 60)], "delivery-us2022"),
    ("U6", "Refurbished smartphone με εγγύηση 24 μηνών", "smartphone_new_vs_refurbished",
     [phone_offer("refurb_A", 209, "refurbished", "authorized") | {"warranty_months": 24}, phone_offer("refurb_B", 150, "used", "unauthorized"), phone_offer("new", 299)], "refurb-smartphone-us2019"),
]
