import Link from "next/link";

const options = [
  {
    title: "Πολιτικό Κόμμα",
    description:
      "Πολιτική intelligence πλατφόρμα για κόμματα και πολιτικούς οργανισμούς.",
    href: "/signin/signup?role=political_party",
    available: true
  },
  {
    title: "Υποψήφιος Βουλευτής",
    description:
      "Προσωπική πολιτική intelligence και στρατηγική υποστήριξη για υποψηφίους.",
    href: "/signin/signup?role=mp_candidate",
    available: true
  },
  {
    title: "Γραφείο Βουλευτή",
    description:
      "Intelligence και στρατηγική υποστήριξη για κοινοβουλευτικά γραφεία.",
    href: "#",
    available: false
  },
  {
    title: "Ευρωβουλευτής",
    description:
      "Πολιτική intelligence με ευρωπαϊκό και εθνικό πλαίσιο.",
    href: "#",
    available: false
  },
  {
    title: "Δημοτική Παράταξη",
    description:
      "Τοπική πολιτική intelligence για δήμους και δημοτικές παρατάξεις.",
    href: "#",
    available: false
  }
];

export default function ChooseRolePage() {
  return (
    <main className="min-h-screen bg-black text-white px-6 py-16">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-xs tracking-[0.25em] uppercase text-zinc-500 mb-4">
            Noraya
          </p>

          <h1 className="text-3xl md:text-4xl font-light mb-4">
            Πώς θέλετε να χρησιμοποιήσετε το Noraya;
          </h1>

          <p className="text-zinc-500 max-w-xl mx-auto">
            Επιλέξτε την κατηγορία που σας αντιπροσωπεύει.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {options.map((option) =>
            option.available ? (
              <Link
                key={option.title}
                href={option.href}
                className="block rounded-xl border border-zinc-700 bg-zinc-900/60 p-6 hover:border-white hover:bg-zinc-900 transition"
              >
                <div className="flex items-center justify-between gap-4 mb-3">
                  <h2 className="text-xl font-medium">{option.title}</h2>

                  <span className="text-xs text-emerald-400 border border-emerald-900 rounded-full px-2 py-1">
                    Διαθέσιμο
                  </span>
                </div>

                <p className="text-sm text-zinc-400 leading-relaxed">
                  {option.description}
                </p>

                <p className="text-sm text-white mt-6">
                  Συνέχεια →
                </p>
              </Link>
            ) : (
              <div
                key={option.title}
                className="rounded-xl border border-zinc-900 bg-zinc-950 p-6 opacity-45 cursor-not-allowed"
              >
                <div className="flex items-center justify-between gap-4 mb-3">
                  <h2 className="text-xl font-medium text-zinc-500">
                    {option.title}
                  </h2>

                  <span className="text-xs text-zinc-600 border border-zinc-800 rounded-full px-2 py-1">
                    Σύντομα
                  </span>
                </div>

                <p className="text-sm text-zinc-600 leading-relaxed">
                  {option.description}
                </p>
              </div>
            )
          )}
        </div>

        <div className="text-center mt-10">
          <Link
            href="/signin/password_signin"
            className="text-sm text-zinc-500 hover:text-white transition"
          >
            Έχετε ήδη λογαριασμό; Είσοδος
          </Link>
        </div>
      </div>
    </main>
  );
}
