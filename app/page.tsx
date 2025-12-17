import Pricing from '@/components/ui/Pricing/Pricing';
import { createClient } from '@/utils/supabase/server';
import { getProducts, getSubscription, getUser } from '@/utils/supabase/queries';

export default async function PricingPage() {
  const supabase = createClient();
  const [user, products, subscription] = await Promise.all([
    getUser(supabase),
    getProducts(supabase),
    getSubscription(supabase)
  ]);

  return (
    <div className="flex flex-col items-center text-center px-6">
      {/* LOGO */}
      <div className="mt-28 mb-10">
        <img
          src="/axiprova.jpeg"
          alt="Axiprova"
          style={{ height: '320px', width: 'auto' }}
        />
      </div>

      {/* HEADLINE (Anara-style) */}
      <h1 className="text-4xl md:text-5xl font-semibold max-w-4xl mb-5">
        AI workspace for artists, cultural producers, and creative teams
      </h1>

      {/* SUBHEADLINE (clear job + outcome) */}
      <p className="text-lg md:text-xl text-gray-400 max-w-3xl mb-4">
        Describe your project once, then generate ready-to-use versions for your website, social, email, press,
        and applications — and save everything as a reusable library.
      </p>

      {/* GREEK LINE (so people identify immediately) */}
      <p className="text-sm md:text-base text-gray-500 max-w-3xl mb-14">
        Ελληνικά/English αυτόματα. Φτιάχνεις "Project DNA" μία φορά και βγάζεις όλα τα format σε 1 κλικ.
      </p>

      {/* PRICING (with integrated CTA) */}
      <Pricing
        user={user}
        products={products ?? []}
        subscription={subscription}
      />

      {/* Bottom-up framing (small, honest, not marketing fluff) */}
      <p className="text-xs md:text-sm text-gray-500 max-w-3xl mt-10 mb-16">
        Start with everyday writing & repurposing. Pro tools for grants & impact unlock as you grow.
      </p>
    </div>
  );
}
