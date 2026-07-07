// ============================================================
// NORAYA — Εκλογικες Περιφερειες Ελλαδας (σταθερη λιστα)
// code: σταθερος κωδικος · name: επισημο ονομα · search: ορος για τοπικες ειδησεις
// Οι μεγαλες πολεις σπανε (Αθηνα -> Α/Β1/Β2/Β3, Πειραιας -> Α/Β, Θεσ/νικη -> Α/Β).
// ============================================================

export interface District {
  code: string;
  name: string;
  search: string; // ορος αναζητησης για τοπικη ατζεντα (Google News κ.λπ.)
}

export const ELECTORAL_DISTRICTS: District[] = [
  // --- Αττικη ---
  { code: "a_athinon", name: "Α΄ Αθηνών", search: "Αθήνα κέντρο" },
  { code: "b1_athinon", name: "Β1΄ Βόρειου Τομέα Αθηνών", search: "Βόρεια προάστια Αθήνας" },
  { code: "b2_athinon", name: "Β2΄ Δυτικού Τομέα Αθηνών", search: "Δυτική Αθήνα" },
  { code: "b3_athinon", name: "Β3΄ Νότιου Τομέα Αθηνών", search: "Νότια προάστια Αθήνας" },
  { code: "a_peiraios", name: "Α΄ Πειραιώς", search: "Πειραιάς" },
  { code: "b_peiraios", name: "Β΄ Πειραιώς", search: "Πειραιάς νησιά Σαλαμίνα" },
  { code: "attikis", name: "Περιφέρεια Αττικής (Υπόλοιπο)", search: "Αττική ανατολική δυτική" },

  // --- Θεσσαλονικη ---
  { code: "a_thessalonikis", name: "Α΄ Θεσσαλονίκης", search: "Θεσσαλονίκη κέντρο" },
  { code: "b_thessalonikis", name: "Β΄ Θεσσαλονίκης", search: "Θεσσαλονίκη" },

  // --- Υπολοιπες περιφερειες (νομοι) ---
  { code: "aitoloakarnanias", name: "Αιτωλοακαρνανίας", search: "Αγρίνιο Μεσολόγγι" },
  { code: "argolidas", name: "Αργολίδας", search: "Άργος Ναύπλιο" },
  { code: "arkadias", name: "Αρκαδίας", search: "Τρίπολη Αρκαδία" },
  { code: "artas", name: "Άρτας", search: "Άρτα" },
  { code: "achaias", name: "Αχαΐας", search: "Πάτρα" },
  { code: "voiotias", name: "Βοιωτίας", search: "Λιβαδειά Θήβα" },
  { code: "grevenon", name: "Γρεβενών", search: "Γρεβενά" },
  { code: "dramas", name: "Δράμας", search: "Δράμα" },
  { code: "dodekanisou", name: "Δωδεκανήσου", search: "Ρόδος Δωδεκάνησα" },
  { code: "evrou", name: "Έβρου", search: "Αλεξανδρούπολη Έβρος" },
  { code: "evvoias", name: "Εύβοιας", search: "Χαλκίδα Εύβοια" },
  { code: "evrytanias", name: "Ευρυτανίας", search: "Καρπενήσι" },
  { code: "zakynthou", name: "Ζακύνθου", search: "Ζάκυνθος" },
  { code: "ileias", name: "Ηλείας", search: "Πύργος Ηλεία" },
  { code: "imathias", name: "Ημαθίας", search: "Βέροια Νάουσα" },
  { code: "irakleiou", name: "Ηρακλείου", search: "Ηράκλειο Κρήτη" },
  { code: "thesprotias", name: "Θεσπρωτίας", search: "Ηγουμενίτσα" },
  { code: "ioanninon", name: "Ιωαννίνων", search: "Ιωάννινα" },
  { code: "kavalas", name: "Καβάλας", search: "Καβάλα" },
  { code: "karditsas", name: "Καρδίτσας", search: "Καρδίτσα" },
  { code: "kastorias", name: "Καστοριάς", search: "Καστοριά" },
  { code: "kerkyras", name: "Κέρκυρας", search: "Κέρκυρα" },
  { code: "kefallinias", name: "Κεφαλληνίας", search: "Κεφαλονιά" },
  { code: "kilkis", name: "Κιλκίς", search: "Κιλκίς" },
  { code: "kozanis", name: "Κοζάνης", search: "Κοζάνη" },
  { code: "korinthias", name: "Κορινθίας", search: "Κόρινθος" },
  { code: "kykladon", name: "Κυκλάδων", search: "Σύρος Κυκλάδες" },
  { code: "lakonias", name: "Λακωνίας", search: "Σπάρτη Λακωνία" },
  { code: "larisas", name: "Λάρισας", search: "Λάρισα" },
  { code: "lasithiou", name: "Λασιθίου", search: "Άγιος Νικόλαος Λασίθι" },
  { code: "lesvou", name: "Λέσβου", search: "Μυτιλήνη Λέσβος" },
  { code: "lefkadas", name: "Λευκάδας", search: "Λευκάδα" },
  { code: "magnisias", name: "Μαγνησίας", search: "Βόλος Μαγνησία" },
  { code: "messinias", name: "Μεσσηνίας", search: "Καλαμάτα Μεσσηνία" },
  { code: "xanthis", name: "Ξάνθης", search: "Ξάνθη" },
  { code: "pellas", name: "Πέλλας", search: "Έδεσσα Γιαννιτσά" },
  { code: "pierias", name: "Πιερίας", search: "Κατερίνη Πιερία" },
  { code: "prevezas", name: "Πρέβεζας", search: "Πρέβεζα" },
  { code: "rethymnis", name: "Ρεθύμνης", search: "Ρέθυμνο" },
  { code: "rodopis", name: "Ροδόπης", search: "Κομοτηνή Ροδόπη" },
  { code: "samou", name: "Σάμου", search: "Σάμος" },
  { code: "serron", name: "Σερρών", search: "Σέρρες" },
  { code: "trikalon", name: "Τρικάλων", search: "Τρίκαλα" },
  { code: "fthiotidas", name: "Φθιώτιδας", search: "Λαμία Φθιώτιδα" },
  { code: "florinas", name: "Φλώρινας", search: "Φλώρινα" },
  { code: "fokidas", name: "Φωκίδας", search: "Άμφισσα Φωκίδα" },
  { code: "chalkidikis", name: "Χαλκιδικής", search: "Χαλκιδική" },
  { code: "chanion", name: "Χανίων", search: "Χανιά" },
  { code: "chiou", name: "Χίου", search: "Χίος" },

  // --- Επικρατεια (χωρις τοπικη ατζεντα) ---
  { code: "epikrateias", name: "Επικρατείας", search: "" },
];

export function districtByName(name: string): District | null {
  const n = (name || "").trim();
  return ELECTORAL_DISTRICTS.find((d) => d.name === n) || null;
}

export function districtByCode(code: string): District | null {
  return ELECTORAL_DISTRICTS.find((d) => d.code === code) || null;
}
