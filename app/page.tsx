import Pricing from '@/components/ui/Pricing/Pricing';
import { createClient } from '@/utils/supabase/server';
import {
  getProducts,
  getSubscription,
  getUser
} from '@/utils/supabase/queries';

export default async function PricingPage() {
  const supabase = createClient();
  const [user, products, subscription] = await Promise.all([
    getUser(supabase),
    getProducts(supabase),
    getSubscription(supabase)
  ]);

  return (
    <div className="flex flex-col items-center text-center px-6">
      {/* Hero */}
      <div className="mt-28 mb-6">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-zinc-700 bg-zinc-900/50 mb-8">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="text-sm text-zinc-400">AI-Powered Political Intelligence</span>
        </div>
        <h1 className="text-5xl md:text-7xl font-bold max-w-5xl mb-6 bg-gradient-to-r from-white via-zinc-200 to-zinc-500 bg-clip-text text-transparent leading-tight">
          PolitiScope
        </h1>
        <p className="text-xl md:text-2xl text-zinc-300 max-w-3xl mb-4 font-light">
          Issue Intelligence & Political Risk Monitoring
        </p>
        <p className="text-base md:text-lg text-zinc-500 max-w-2xl mb-14">
          Παρακολουθήστε τον δημόσιο λόγο, εντοπίστε τάσεις και ρίσκα, και πάρτε AI-powered
          strategic insights — εξατομικευμένα στις θέσεις του οργανισμού σας.
        </p>
      </div>

      {/* Features */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mb-20">
        <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900/30 text-left">
          <div className="text-2xl mb-3">📊</div>
          <h3 className="text-lg font-semibold text-white mb-2">Issue Monitoring</h3>
          <p className="text-sm text-zinc-400">
            Real-time tracking ελληνικών ΜΜΕ, Βουλής, και social media.
            Sentiment analysis, narrative detection, trend alerts.
          </p>
        </div>
        <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900/30 text-left">
          <div className="text-2xl mb-3">🔮</div>
          <h3 className="text-lg font-semibold text-white mb-2">AI Political Analyst</h3>
          <p className="text-sm text-zinc-400">
            Ρωτήστε οτιδήποτε. Το AI απαντά με βάση τα δεδομένα ΚΑΙ τις
            θέσεις του οργανισμού σας. Scenario analysis & stance checks.
          </p>
        </div>
        <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900/30 text-left">
          <div className="text-2xl mb-3">🔒</div>
          <h3 className="text-lg font-semibold text-white mb-2">Tenant Isolation</h3>
          <p className="text-sm text-zinc-400">
            Κάθε οργανισμός βλέπει μόνο τα δικά του δεδομένα.
            Πλήρης απομόνωση, audit trail, GDPR compliance.
          </p>
        </div>
      </div>

      {/* Who is it for */}
      <div className="max-w-3xl mb-20">
        <h2 className="text-2xl font-semibold text-white mb-6">Για ποιον είναι</h2>
        <div className="flex flex-wrap justify-center gap-3">
          {[
            'Πολιτικά Κόμματα',
            'Βουλευτές',
            'Think Tanks',
            'NGOs',
            'Δημοτικές Παρατάξεις',
            'Συνδικάτα',
            'Public Affairs',
            'Επαγγελματικοί Φορείς'
          ].map((item) => (
            <span
              key={item}
              className="px-4 py-2 rounded-full border border-zinc-700 text-sm text-zinc-300 bg-zinc-900/50"
            >
              {item}
            </span>
          ))}
        </div>
      </div>

      {/* Pricing */}
      <Pricing
        user={user}
        products={products ?? []}
        subscription={subscription}
      />
    </div>
  );
}
        subscription={subscription}
      />
    </div>
  );
}
