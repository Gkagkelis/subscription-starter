"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface Profile {
  org_name: string;
  org_type: string;
  org_size: string;
  location: string;
  target_audience: string;
  main_challenges: string;
  goals: string;
}

export default function ProfilePage() {
  const router = useRouter();
  const [isNewUser, setIsNewUser] = useState(false);
  const [profile, setProfile] = useState<Profile>({
    org_name: "",
    org_type: "",
    org_size: "",
    location: "",
    target_audience: "",
    main_challenges: "",
    goals: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const res = await fetch("/api/profile");
      if (res.ok) {
        const data = await res.json();
        if (data) {
          setProfile(data);
          setIsNewUser(false);
        } else {
          setIsNewUser(true);
        }
      }
    } catch (error) {
      console.error("Failed to load profile:", error);
    } finally {
      setLoading(false);
    }
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      if (res.ok) {
        setSaved(true);
        if (isNewUser) {
          setTimeout(() => {
            router.push("/dashboard/copilot");
          }, 1000);
        } else {
          setTimeout(() => setSaved(false), 3000);
        }
      }
    } catch (error) {
      console.error("Failed to save profile:", error);
    } finally {
      setSaving(false);
    }
  };

  const orgTypes = [
    "Μουσειο",
    "Γκαλερι",
    "Θεατρο",
    "Φεστιβαλ",
    "Πολιτιστικος Οργανισμος",
    "Δημος / Δημοτικη Υπηρεσια",
    "Ανεξαρτητος Καλλιτεχνης",
    "Παραγωγος",
    "Ερευνητικο Κεντρο",
    "Εκπαιδευτικο Ιδρυμα",
    "Αλλο",
  ];

  const orgSizes = [
    "1 ατομο (Freelancer)",
    "2-5 ατομα",
    "6-15 ατομα",
    "16-50 ατομα",
    "50+ ατομα",
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="text-zinc-500">Φορτωση...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            {isNewUser ? "Καλωσηρθες στο Axiprova!" : "Προφιλ Οργανισμου"}
          </h1>
          <p className="text-zinc-500">
            {isNewUser 
              ? "Συμπληρωσε τα στοιχεια σου για να ξεκινησεις με εξατομικευμενες συμβουλες"
              : "Ενημερωσε τα στοιχεια σου για πιο εξατομικευμενες συμβουλες απο το AI"
            }
          </p>
        </div>

        <div className="space-y-6 bg-zinc-900 rounded-2xl p-6 border border-zinc-800">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Ονομα Οργανισμου
            </label>
            <input
              type="text"
              value={profile.org_name}
              onChange={(e) => setProfile({ ...profile, org_name: e.target.value })}
              placeholder="π.χ. Μουσειο Συγχρονης Τεχνης"
              className="w-full px-4 py-3 bg-zinc-800 text-white border border-zinc-700 rounded-xl focus:outline-none focus:border-zinc-500 placeholder-zinc-600"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Τυπος Οργανισμου
            </label>
            <select
              value={profile.org_type}
              onChange={(e) => setProfile({ ...profile, org_type: e.target.value })}
              className="w-full px-4 py-3 bg-zinc-800 text-white border border-zinc-700 rounded-xl focus:outline-none focus:border-zinc-500"
            >
              <option value="">Επιλεξε...</option>
              {orgTypes.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Μεγεθος
            </label>
            <select
              value={profile.org_size}
              onChange={(e) => setProfile({ ...profile, org_size: e.target.value })}
              className="w-full px-4 py-3 bg-zinc-800 text-white border border-zinc-700 rounded-xl focus:outline-none focus:border-zinc-500"
            >
              <option value="">Επιλεξε...</option>
              {orgSizes.map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Τοποθεσια
            </label>
            <input
              type="text"
              value={profile.location}
              onChange={(e) => setProfile({ ...profile, location: e.target.value })}
              placeholder="π.χ. Αθηνα, Ελλαδα"
              className="w-full px-4 py-3 bg-zinc-800 text-white border border-zinc-700 rounded-xl focus:outline-none focus:border-zinc-500 placeholder-zinc-600"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Κοινο-Στοχος
            </label>
            <input
              type="text"
              value={profile.target_audience}
              onChange={(e) => setProfile({ ...profile, target_audience: e.target.value })}
              placeholder="π.χ. Νεοι 18-35, οικογενειες, τουριστες"
              className="w-full px-4 py-3 bg-zinc-800 text-white border border-zinc-700 rounded-xl focus:outline-none focus:border-zinc-500 placeholder-zinc-600"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Κυριες Προκλησεις
            </label>
            <textarea
              value={profile.main_challenges}
              onChange={(e) => setProfile({ ...profile, main_challenges: e.target.value })}
              placeholder="π.χ. Χρειαζομαστε περισσοτερους επισκεπτες, δυσκολια στο marketing..."
              rows={3}
              className="w-full px-4 py-3 bg-zinc-800 text-white border border-zinc-700 rounded-xl focus:outline-none focus:border-zinc-500 placeholder-zinc-600 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Στοχοι
            </label>
            <textarea
              value={profile.goals}
              onChange={(e) => setProfile({ ...profile, goals: e.target.value })}
              placeholder="π.χ. Αυξηση επισκεπτων 20%, νεες χορηγιες, επεκταση προγραμματων..."
              rows={3}
              className="w-full px-4 py-3 bg-zinc-800 text-white border border-zinc-700 rounded-xl focus:outline-none focus:border-zinc-500 placeholder-zinc-600 resize-none"
            />
          </div>

          <button
            onClick={saveProfile}
            disabled={saving}
            className="w-full py-3 bg-white text-black font-medium rounded-xl hover:bg-zinc-200 disabled:opacity-50 transition"
          >
            {saving ? "Αποθηκευση..." : isNewUser ? "Ξεκινα!" : "Αποθηκευση"}
          </button>

          {saved && (
            <div className="text-center text-green-400 text-sm">
              {isNewUser ? "Τελεια! Παμε στο Axiprova..." : "Αποθηκευτηκε επιτυχως!"}
            </div>
          )}
        </div>

        {!isNewUser && (
          <div className="mt-6 text-center">
            <a href="/dashboard/copilot" className="text-zinc-500 hover:text-white transition">
              ← Πισω στο Chat
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
