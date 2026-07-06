// ============================================================
// NORAYA — Psychometric Scoring Engine (ντετερμινιστικο, χωρις AI)
// Πηγη: εσωτερικο επιστημονικο πλαισιο NORAYA (BFI-2, Schwartz PVQ,
// MFQ, Political Compass, Petrocik, Antonakis/Jagers-Walgrave).
// Ολες οι διατυπωσεις ειναι πρωτοτυπες (εμπορικη χρηση).
// Short + Full: το scoring κανονικοποιειται με τον αριθμο απαντησεων,
// ωστε να δουλευει και στις δυο εκδοσεις.
// ============================================================

export type Likert = number; // πρωτη τιμη οπως δοθηκε απο τον χρηστη

export type Section = "A" | "B" | "G" | "D" | "E" | "ST";

export interface Item {
  id: string;
  section: Section;
  dim: string; // διασταση/υπο-κλιμακα
  text: string;
  reverse?: boolean; // αντιστροφη βαθμολογηση
  short?: boolean; // αν ανηκει στη Συντομη εκδοση
  scale: "l5" | "l6" | "compass4" | "freq5" | "rank" | "v10" | "years5";
}

// ------------------------------------------------------------
// ITEM BANK
// ------------------------------------------------------------
export const ITEMS: Item[] = [
  // ===== ΕΝΟΤΗΤΑ Α — Big Five (1-5) =====
  { id: "A_E1", section: "A", dim: "extraversion", scale: "l5", short: true, text: "Νιωθω γεματος/η ενεργεια οταν βρισκομαι αναμεσα σε κοσμο." },
  { id: "A_E2", section: "A", dim: "extraversion", scale: "l5", short: true, text: "Παιρνω ευκολα τον λογο σε μια συζητηση με αγνωστους." },
  { id: "A_E3", section: "A", dim: "extraversion", scale: "l5", reverse: true, short: true, text: "Προτιμω να ακουω παρα να μιλαω σε δημοσιες εκδηλωσεις." },
  { id: "A_E4", section: "A", dim: "extraversion", scale: "l5", text: "Μου αρεσει να ηγουμαι ομαδων και πρωτοβουλιων." },
  { id: "A_E5", section: "A", dim: "extraversion", scale: "l5", reverse: true, text: "Οι μεγαλες συγκεντρωσεις με κουραζουν." },
  { id: "A_E6", section: "A", dim: "extraversion", scale: "l5", text: "Με χαρακτηριζουν «ανθρωπο της πλατειας»." },

  { id: "A_A1", section: "A", dim: "agreeableness", scale: "l5", short: true, text: "Ψαχνω πρωτα το κοινο εδαφος, ακομα και με πολιτικους αντιπαλους." },
  { id: "A_A2", section: "A", dim: "agreeableness", scale: "l5", reverse: true, short: true, text: "Δυσκολευομαι να εμπιστευτω τις προθεσεις των αλλων." },
  { id: "A_A3", section: "A", dim: "agreeableness", scale: "l5", short: true, text: "Με ενδιαφερει πραγματικα τι περναει ο αλλος, ακομα κι αν διαφωνουμε." },
  { id: "A_A4", section: "A", dim: "agreeableness", scale: "l5", reverse: true, text: "Στην πολιτικη, οποιος δειχνει επιεικεια χανει." },
  { id: "A_A5", section: "A", dim: "agreeableness", scale: "l5", text: "Συγχωρω ευκολα οσους μου εχουν φερθει αδικα." },
  { id: "A_A6", section: "A", dim: "agreeableness", scale: "l5", reverse: true, text: "Προτιμω τη συγκρουση απο τον συμβιβασμο οταν εχω δικιο." },

  { id: "A_C1", section: "A", dim: "conscientiousness", scale: "l5", short: true, text: "Ολοκληρωνω παντα αυτο που εχω δεσμευτει να κανω." },
  { id: "A_C2", section: "A", dim: "conscientiousness", scale: "l5", short: true, text: "Οργανωνω τη δουλεια μου με σχεδιο και προτεραιοτητες." },
  { id: "A_C3", section: "A", dim: "conscientiousness", scale: "l5", reverse: true, short: true, text: "Αφηνω συχνα εκκρεμοτητες για την τελευταια στιγμη." },
  { id: "A_C4", section: "A", dim: "conscientiousness", scale: "l5", text: "Προσεχω τη λεπτομερεια ακομα και σε δευτερευοντα ζητηματα." },
  { id: "A_C5", section: "A", dim: "conscientiousness", scale: "l5", reverse: true, text: "Το προγραμμα μου συχνα ειναι χαοτικο." },
  { id: "A_C6", section: "A", dim: "conscientiousness", scale: "l5", text: "Θετω υψηλα στανταρ στον εαυτο μου και τα τηρω." },

  { id: "A_S1", section: "A", dim: "emotionalStability", scale: "l5", short: true, text: "Παραμενω ψυχραιμος/η κατω απο εντονη πιεση." },
  { id: "A_S2", section: "A", dim: "emotionalStability", scale: "l5", reverse: true, short: true, text: "Μια δημοσια επιθεση εναντιον μου με αναστατωνει για μερες." },
  { id: "A_S3", section: "A", dim: "emotionalStability", scale: "l5", short: true, text: "Ανακαμπτω γρηγορα μετα απο μια αποτυχια η ηττα." },
  { id: "A_S4", section: "A", dim: "emotionalStability", scale: "l5", reverse: true, text: "Αγχωνομαι ευκολα πριν απο κρισιμες στιγμες." },
  { id: "A_S5", section: "A", dim: "emotionalStability", scale: "l5", text: "Οι επικρισεις στα social media δεν μου χαλουν τη διαθεση." },
  { id: "A_S6", section: "A", dim: "emotionalStability", scale: "l5", reverse: true, text: "Συχνα με κυριευουν αρνητικες σκεψεις." },

  { id: "A_O1", section: "A", dim: "openness", scale: "l5", short: true, text: "Με γοητευουν οι νεες ιδεες, ακομα κι οταν αμφισβητουν οσα πιστευω." },
  { id: "A_O2", section: "A", dim: "openness", scale: "l5", reverse: true, short: true, text: "Προτιμω τις δοκιμασμενες λυσεις απο τα πειραματα." },
  { id: "A_O3", section: "A", dim: "openness", scale: "l5", short: true, text: "Μου αρεσει να συζηταω φιλοσοφικα και αφηρημενα ζητηματα." },
  { id: "A_O4", section: "A", dim: "openness", scale: "l5", text: "Η τεχνη και ο πολιτισμος παιζουν κεντρικο ρολο στη ζωη μου." },
  { id: "A_O5", section: "A", dim: "openness", scale: "l5", reverse: true, text: "Δυσκολευομαι να αλλαξω τροπο σκεψης." },
  { id: "A_O6", section: "A", dim: "openness", scale: "l5", text: "Ψαχνω συνειδητα αποψεις που διαφερουν απο τις δικες μου." },

  // ===== ΕΝΟΤΗΤΑ Β — Schwartz PVQ (1-6) =====
  { id: "B_selfdir1", section: "B", dim: "selfDirection", scale: "l6", short: true, text: "Θεωρει σημαντικο να σκεφτεται με τον δικο του τροπο και να παιρνει μονος τις αποφασεις του." },
  { id: "B_selfdir2", section: "B", dim: "selfDirection", scale: "l6", text: "Του αρεσει να ειναι ελευθερος να σχεδιαζει και να επιλεγει τις δραστηριοτητες του." },
  { id: "B_stim1", section: "B", dim: "stimulation", scale: "l6", short: true, text: "Ψαχνει συνεχως νεες εμπειριες και προκλησεις στη ζωη." },
  { id: "B_stim2", section: "B", dim: "stimulation", scale: "l6", text: "Πιστευει οτι η ζωη πρεπει να εχει ρισκο και περιπετεια." },
  { id: "B_hed1", section: "B", dim: "hedonism", scale: "l6", short: true, text: "Θεωρει σημαντικο να περναει καλα και να απολαμβανει τη ζωη." },
  { id: "B_hed2", section: "B", dim: "hedonism", scale: "l6", text: "Αδραχνει καθε ευκαιρια για διασκεδαση." },
  { id: "B_ach1", section: "B", dim: "achievement", scale: "l6", short: true, text: "Θελει να δειχνει τις ικανοτητες του και να τον θαυμαζουν γι' αυτες." },
  { id: "B_ach2", section: "B", dim: "achievement", scale: "l6", text: "Το να ειναι πολυ επιτυχημενος ειναι απο τα σημαντικοτερα πραγματα για εκεινον." },
  { id: "B_pow1", section: "B", dim: "power", scale: "l6", short: true, text: "Θελει να εχει τον ελεγχο και να λενε οι αλλοι αυτο που λεει εκεινος." },
  { id: "B_pow2", section: "B", dim: "power", scale: "l6", text: "Θεωρει σημαντικο να ειναι πλουσιος και με επιρροη." },
  { id: "B_sec1", section: "B", dim: "security", scale: "l6", short: true, text: "Θεωρει πολυ σημαντικο να ζει σε ασφαλες περιβαλλον, μακρια απο καθε κινδυνο." },
  { id: "B_sec2", section: "B", dim: "security", scale: "l6", text: "Πιστευει οτι το κρατος πρεπει να ειναι ισχυρο για να προστατευει τους πολιτες του." },
  { id: "B_conf1", section: "B", dim: "conformity", scale: "l6", short: true, text: "Πιστευει οτι πρεπει κανεις να ακολουθει τους κανονες, ακομα κι οταν δεν τον βλεπει κανεις." },
  { id: "B_conf2", section: "B", dim: "conformity", scale: "l6", text: "Θεωρει σημαντικο να συμπεριφερεται παντα με ευπρεπεια και να μην ενοχλει." },
  { id: "B_trad1", section: "B", dim: "tradition", scale: "l6", short: true, text: "Οι παραδοσεις και τα εθιμα της οικογενειας και της θρησκειας του εχουν μεγαλη σημασια για εκεινον." },
  { id: "B_trad2", section: "B", dim: "tradition", scale: "l6", text: "Πιστευει οτι η ταπεινοτητα και η σεμνοτητα ειναι αρετες." },
  { id: "B_ben1", section: "B", dim: "benevolence", scale: "l6", short: true, text: "Θεωρει πολυ σημαντικο να βοηθα τους ανθρωπους γυρω του." },
  { id: "B_ben2", section: "B", dim: "benevolence", scale: "l6", text: "Η αφοσιωση στους δικους του ανθρωπους ειναι θεμελιο της ζωης του." },
  { id: "B_uni1", section: "B", dim: "universalism", scale: "l6", short: true, text: "Πιστευει οτι ολοι οι ανθρωποι στον κοσμο αξιζουν ιση μεταχειριση και ευκαιριες." },
  { id: "B_uni2", section: "B", dim: "universalism", scale: "l6", text: "Θεωρει χρεος του την προστασια του περιβαλλοντος." },
  { id: "B_uni3", section: "B", dim: "universalism", scale: "l6", text: "Θελει να ακουει και να κατανοει ανθρωπους διαφορετικους απο εκεινον." },

  // ===== ΕΝΟΤΗΤΑ Γ — MFQ (1-6) =====
  { id: "G_care1", section: "G", dim: "care", scale: "l6", text: "Αν καποιος υπεφερε συναισθηματικα η σωματικα." },
  { id: "G_care2", section: "G", dim: "care", scale: "l6", text: "Αν καποιος φερθηκε σκληρα σε εναν αδυναμο." },
  { id: "G_fair1", section: "G", dim: "fairness", scale: "l6", text: "Αν καποιος αντιμετωπιστηκε διαφορετικα απο τους αλλους χωρις λογο." },
  { id: "G_fair2", section: "G", dim: "fairness", scale: "l6", text: "Αν καποιος καρπωθηκε κατι που δεν του αξιζε." },
  { id: "G_loy1", section: "G", dim: "loyalty", scale: "l6", text: "Αν καποιος προδωσε την ομαδα, την κοινοτητα η την πατριδα του." },
  { id: "G_loy2", section: "G", dim: "loyalty", scale: "l6", text: "Αν καποιος εδειξε ελλειψη αγαπης για τη χωρα του." },
  { id: "G_auth1", section: "G", dim: "authority", scale: "l6", text: "Αν καποιος εδειξε ασεβεια προς τους θεσμους η τους μεγαλυτερους." },
  { id: "G_auth2", section: "G", dim: "authority", scale: "l6", text: "Αν καποιος αψηφησε νομιμη εντολη η ιεραρχια." },
  { id: "G_sanc1", section: "G", dim: "sanctity", scale: "l6", text: "Αν καποιος εκανε κατι που θεωρειται βεβηλο η εξευτελιστικο." },
  { id: "G_sanc2", section: "G", dim: "sanctity", scale: "l6", text: "Αν καποιος παραβιασε κατι ιερο." },
  { id: "G_care3", section: "G", dim: "care", scale: "l6", short: true, text: "Η συμπονια προς οσους υποφερουν ειναι η υψιστη αρετη." },
  { id: "G_fair3", section: "G", dim: "fairness", scale: "l6", short: true, text: "Η δικαιοσυνη σημαινει ιδιοι κανονες για ολους, χωρις εξαιρεσεις." },
  { id: "G_loy3", section: "G", dim: "loyalty", scale: "l6", short: true, text: "Οφειλουμε πιστη πρωτα στη δικη μας κοινοτητα και μετα στους αλλους." },
  { id: "G_auth3", section: "G", dim: "authority", scale: "l6", short: true, text: "Ο σεβασμος στην ιεραρχια κραταει την κοινωνια ορθια." },
  { id: "G_sanc3", section: "G", dim: "sanctity", scale: "l6", short: true, text: "Υπαρχουν πραγματα ιερα που δεν τα αγγιζει κανεις, ο,τι κι αν λεει η πλειοψηφια." },

  // ===== ΕΝΟΤΗΤΑ Δ — Political Compass (-2/-1/+1/+2) =====
  // econ: reverse=true => «συμφωνω» μετραει αριστερα
  { id: "D_ec1", section: "D", dim: "economic", scale: "compass4", short: true, text: "Οι ιδιωτικοποιησεις κρατικων επιχειρησεων ωφελουν τελικα τους πολιτες." },
  { id: "D_ec2", section: "D", dim: "economic", scale: "compass4", reverse: true, short: true, text: "Το κρατος πρεπει να εγγυαται ενα ελαχιστο εισοδημα σε καθε πολιτη." },
  { id: "D_ec3", section: "D", dim: "economic", scale: "compass4", short: true, text: "Οσο λιγοτερο ρυθμιζει το κρατος την αγορα, τοσο καλυτερα για την οικονομια." },
  { id: "D_ec4", section: "D", dim: "economic", scale: "compass4", reverse: true, short: true, text: "Οι μεγαλες περιουσιες και τα υψηλα εισοδηματα πρεπει να φορολογουνται πολυ περισσοτερο." },
  { id: "D_ec5", section: "D", dim: "economic", scale: "compass4", text: "Ο κατωτατος μισθος πρεπει να καθοριζεται απο την αγορα, οχι απο το κρατος." },
  { id: "D_ec6", section: "D", dim: "economic", scale: "compass4", reverse: true, text: "Η υγεια και η παιδεια πρεπει να παρεχονται αποκλειστικα δημοσια και δωρεαν." },
  { id: "D_ec7", section: "D", dim: "economic", scale: "compass4", text: "Οι ελευθερες απολυσεις κανουν την αγορα εργασιας πιο υγιη." },
  { id: "D_ec8", section: "D", dim: "economic", scale: "compass4", reverse: true, text: "Τα συνδικατα ειναι απαραιτητα για την προστασια των εργαζομενων." },
  { id: "D_ec9", section: "D", dim: "economic", scale: "compass4", text: "Η επιχειρηματικοτητα, οχι το κρατος, δημιουργει την ευημερια." },
  { id: "D_ec10", section: "D", dim: "economic", scale: "compass4", reverse: true, text: "Οι τραπεζες και οι στρατηγικες υποδομες πρεπει να ελεγχονται δημοσια." },
  { id: "D_ec11", section: "D", dim: "economic", scale: "compass4", text: "Η μειωση φορων στις επιχειρησεις φερνει επενδυσεις και δουλειες." },
  { id: "D_ec12", section: "D", dim: "economic", scale: "compass4", reverse: true, text: "Η ανισοτητα πλουτου ειναι το μεγαλυτερο προβλημα της εποχης μας." },
  // social: reverse=true => «συμφωνω» μετραει φιλελευθερα/προοδευτικα
  { id: "D_soc1", section: "D", dim: "social", scale: "compass4", reverse: true, short: true, text: "Το κρατος και η Εκκλησια πρεπει να διαχωριστουν πληρως." },
  { id: "D_soc2", section: "D", dim: "social", scale: "compass4", short: true, text: "Η παραδοση και η εθνικη ταυτοτητα πρεπει να προστατευονται απο την αλλοιωση." },
  { id: "D_soc3", section: "D", dim: "social", scale: "compass4", reverse: true, short: true, text: "Τα ομοφυλα ζευγαρια πρεπει να εχουν ακριβως τα ιδια δικαιωματα με τα ετεροφυλα, συμπεριλαμβανομενης της τεκνοθεσιας." },
  { id: "D_soc4", section: "D", dim: "social", scale: "compass4", short: true, text: "Η αστυνομια χρειαζεται περισσοτερες εξουσιες για να επιβαλλει τον νομο και την ταξη." },
  { id: "D_soc5", section: "D", dim: "social", scale: "compass4", reverse: true, text: "Η μεταναστευση εμπλουτιζει πολιτισμικα και οικονομικα τη χωρα." },
  { id: "D_soc6", section: "D", dim: "social", scale: "compass4", text: "Οι ποινες για σοβαρα εγκληματα πρεπει να γινουν πολυ αυστηροτερες." },
  { id: "D_soc7", section: "D", dim: "social", scale: "compass4", text: "Οι νεοι σημερα εχουν αναγκη περισσοτερη πειθαρχια και σεβασμο στην εξουσια." },
  { id: "D_soc8", section: "D", dim: "social", scale: "compass4", reverse: true, text: "Το δικαιωμα στην αμβλωση πρεπει να προστατευεται χωρις περιορισμους." },
  { id: "D_soc9", section: "D", dim: "social", scale: "compass4", text: "Η εθνικη κυριαρχια προεχει εναντι των αποφασεων της ΕΕ." },
  { id: "D_soc10", section: "D", dim: "social", scale: "compass4", reverse: true, text: "Η κανναβη για προσωπικη χρηση πρεπει να νομιμοποιηθει." },
  { id: "D_soc11", section: "D", dim: "social", scale: "compass4", text: "Η παρακολουθηση επικοινωνιων ειναι αποδεκτη οταν διακυβευεται η εθνικη ασφαλεια." },
  { id: "D_soc12", section: "D", dim: "social", scale: "compass4", reverse: true, text: "Ο καθενας πρεπει να ζει οπως θελει, αρκει να μη βλαπτει τους αλλους." },

  // ===== ΕΝΟΤΗΤΑ ΣΤ — Επικοινωνιακο υφος (freq 1-5) =====
  { id: "ST_clt1", section: "ST", dim: "clt", scale: "freq5", text: "Χρησιμοποιω ιστοριες και προσωπικα παραδειγματα για να περασω το μηνυμα μου." },
  { id: "ST_clt2", section: "ST", dim: "clt", scale: "freq5", text: "Χρησιμοποιω μεταφορες και εικονες («η χωρα σε σταυροδρομι»)." },
  { id: "ST_clt3", section: "ST", dim: "clt", scale: "freq5", text: "Κανω ρητορικες ερωτησεις προς το ακροατηριο." },
  { id: "ST_clt4", section: "ST", dim: "clt", scale: "freq5", text: "Εκφραζω εντονη ηθικη πεποιθηση («ειναι ζητημα δικαιοσυνης, οχι αριθμων»)." },
  { id: "ST_clt5", section: "ST", dim: "clt", scale: "freq5", text: "Θετω υψηλους, φιλοδοξους στοχους και εκφραζω βεβαιοτητα οτι θα επιτευχθουν." },
  { id: "ST_cx1", section: "ST", dim: "complexity", scale: "freq5", text: "Παρουσιαζω και τις δυο πλευρες ενος ζητηματος πριν παρω θεση." },
  { id: "ST_cx2", section: "ST", dim: "complexity", scale: "freq5", reverse: true, text: "Προτιμω απλα, κοφτα μηνυματα απο αναλυτικες τοποθετησεις." },
  { id: "ST_cx3", section: "ST", dim: "complexity", scale: "freq5", text: "Αναγνωριζω δημοσια οτι καποια προβληματα δεν εχουν ευκολες λυσεις." },
  { id: "ST_pop1", section: "ST", dim: "populism", scale: "freq5", text: "Μιλαω στο ονομα του «απλου λαου» απεναντι στο «συστημα» και τις «ελιτ»." },
  { id: "ST_pop2", section: "ST", dim: "populism", scale: "freq5", reverse: true, text: "Επικαλουμαι θεσμους, στοιχεια και εμπειρογνωμονες για να τεκμηριωσω τις θεσεις μου." },
  { id: "ST_pop3", section: "ST", dim: "populism", scale: "freq5", text: "Κατονομαζω ευθεως ποιοι φταινε για τα προβληματα." },
  { id: "ST_pop4", section: "ST", dim: "populism", scale: "freq5", reverse: true, text: "Προτιμω τη γλωσσα της ενοτητας απο τη γλωσσα της συγκρουσης." },
];

// Θεματα για Ε1 ranking (drag & drop 1-10)
export const ISSUE_TOPICS = [
  "Ακριβεια/κοστος ζωης", "Υγεια", "Ασφαλεια/εγκληματικοτητα", "Μεταναστευση",
  "Οικονομια/αναπτυξη", "Παιδεια", "Ελληνοτουρκικα/εξωτερικη πολιτικη",
  "Περιβαλλον/κλιμα", "Διαφθορα/θεσμοι", "Δημογραφικο/στεγαστικο",
];

// ------------------------------------------------------------
// SCORING HELPERS
// ------------------------------------------------------------
export type Answers = Record<string, number>;

function val(it: Item, raw: number): number {
  if (it.scale === "compass4") {
    // -2/-1/+1/+2 · reverse => αντιστροφη προσημου
    return it.reverse ? -raw : raw;
  }
  // κλιμακες Likert: reverse => (max+1 - raw)
  const max = it.scale === "l6" ? 6 : 5;
  return it.reverse ? max + 1 - raw : raw;
}

function meanOf(items: Item[], answers: Answers): number | null {
  const vals: number[] = [];
  for (const it of items) {
    const raw = answers[it.id];
    if (typeof raw === "number" && !Number.isNaN(raw)) vals.push(val(it, raw));
  }
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function itemsOf(section: Section, dim?: string): Item[] {
  return ITEMS.filter((i) => i.section === section && (dim ? i.dim === dim : true));
}

const r2 = (n: number | null) => (n == null ? null : Math.round(n * 100) / 100);

// ------------------------------------------------------------
// SECTION SCORERS
// ------------------------------------------------------------
export function scoreBigFive(a: Answers) {
  const traits = ["extraversion", "agreeableness", "conscientiousness", "emotionalStability", "openness"] as const;
  const out: Record<string, number | null> = {};
  for (const t of traits) out[t] = r2(meanOf(itemsOf("A", t), a));
  const caprara = {
    energyInnovation: r2(avg([out.extraversion, out.openness])),
    honestyTrust: r2(avg([out.agreeableness, out.conscientiousness])),
  };
  return { traits: out, caprara };
}

export function scoreSchwartz(a: Answers) {
  // MRAT = μεσος ολων των απαντησεων Β (πριν αντιστροφες — δεν υπαρχουν εδω)
  const bItems = itemsOf("B");
  const all: number[] = [];
  for (const it of bItems) {
    const raw = a[it.id];
    if (typeof raw === "number") all.push(raw);
  }
  const mrat = all.length ? all.reduce((x, y) => x + y, 0) / all.length : 0;
  const values = ["selfDirection", "stimulation", "hedonism", "achievement", "power", "security", "conformity", "tradition", "benevolence", "universalism"];
  const v: Record<string, number | null> = {};
  for (const name of values) {
    const items = itemsOf("B", name).filter((it) => typeof a[it.id] === "number");
    if (!items.length) { v[name] = null; continue; }
    const centered = items.map((it) => a[it.id] - mrat);
    v[name] = r2(centered.reduce((x, y) => x + y, 0) / centered.length);
  }
  const s = (k: string) => (v[k] ?? 0);
  const higher = {
    opennessToChange: r2(s("selfDirection") + s("stimulation") + s("hedonism") / 2),
    conservation: r2(s("security") + s("conformity") + s("tradition")),
    selfTranscendence: r2(s("benevolence") + s("universalism")),
    selfEnhancement: r2(s("achievement") + s("power") + s("hedonism") / 2),
  };
  return { values: v, higher, mrat: r2(mrat) };
}

export function scoreMFQ(a: Answers) {
  const founds = ["care", "fairness", "loyalty", "authority", "sanctity"];
  const f: Record<string, number | null> = {};
  for (const name of founds) f[name] = r2(meanOf(itemsOf("G", name), a));
  const g = (k: string) => (f[k] ?? 0);
  const individualizing = r2((g("care") + g("fairness")) / 2);
  const binding = r2((g("loyalty") + g("authority") + g("sanctity")) / 3);
  return { foundations: f, individualizing, binding };
}

export function scoreCompass(a: Answers) {
  // econ/social: mean(signed) * 5 => ε'υρος -10..10 (δουλευει σε short & full)
  const econItems = itemsOf("D", "economic").filter((it) => typeof a[it.id] === "number");
  const socItems = itemsOf("D", "social").filter((it) => typeof a[it.id] === "number");
  const em = econItems.length ? econItems.map((it) => val(it, a[it.id])).reduce((x, y) => x + y, 0) / econItems.length : null;
  const sm = socItems.length ? socItems.map((it) => val(it, a[it.id])).reduce((x, y) => x + y, 0) / socItems.length : null;
  return {
    economic: em == null ? null : r2(em * 5), // - αριστερα / + δεξια
    social: sm == null ? null : r2(sm * 5), // - φιλελευθερος / + συντηρητικος
  };
}

export function scoreStyle(a: Answers) {
  const clt = r2(meanOf(itemsOf("ST", "clt"), a));
  const complexity = r2(meanOf(itemsOf("ST", "complexity"), a));
  const populism = r2(meanOf(itemsOf("ST", "populism"), a));
  return { clt, complexity, populism };
}

function avg(xs: (number | null)[]): number | null {
  const v = xs.filter((x): x is number => typeof x === "number");
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

// ------------------------------------------------------------
// FULL PROFILE
// ------------------------------------------------------------
export interface ProfileInput {
  answers: Answers;
  mode: "short" | "full";
  issueRanking?: string[]; // Ε1 (full)
  valenceSelf?: Record<string, number>; // Ε2 (full)
}

export function buildProfile(input: ProfileInput) {
  const { answers, mode } = input;
  const bigFive = scoreBigFive(answers);
  const schwartz = scoreSchwartz(answers);
  const mfq = scoreMFQ(answers);
  const compass = scoreCompass(answers);
  const style = mode === "full" ? scoreStyle(answers) : null;

  // ποια layers ειναι διαθεσιμα
  const layers = {
    positioningMap: compass.economic != null && compass.social != null,
    personalityBrand: bigFive.caprara.energyInnovation != null && !!schwartz.higher,
    messageMarketFit: mfq.individualizing != null,
    communicationStyle: !!style && style.clt != null,
    issueOwnership: mode === "full" && !!input.issueRanking?.length,
  };

  return { mode, bigFive, schwartz, mfq, compass, style, layers, generatedAt: new Date().toISOString() };
}

// interpretation helper (χαμηλο/μετριο/υψηλο για Likert 1-5)
export function level5(n: number | null): "χαμηλο" | "μετριο" | "υψηλο" | "—" {
  if (n == null) return "—";
  if (n < 2.5) return "χαμηλο";
  if (n <= 3.5) return "μετριο";
  return "υψηλο";
}

export function itemsForMode(mode: "short" | "full"): Item[] {
  return mode === "short" ? ITEMS.filter((i) => i.short) : ITEMS;
}
