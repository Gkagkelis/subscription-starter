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
      <div className="mt-28 mb-12">
        <img
          src="/axiprova.jpeg"
          alt="Axiprova"
          style={{ height: '320px', width: 'auto' }}
        />
      </div>

      {/* HEADLINE */}
      <h1 className="text-4xl md:text-5xl font-semibold max-w-4xl mb-6">
        Stop rewriting the same project description.
      </h1>

      <p className="text-lg md:text-xl text-gray-400 max-w-3xl mb-8">
        Make one <span className="text-gray-200 font-medium">Project DNA</span> — then instantly get ready-to-use
        versions for your website, socials, emails, press, and applications.
      </p>

      {/* BOTTOM-UP POSITIONING (small, not salesy) */}
      <p className="text-sm text-gray-500 max-w-3xl mb-16">
        Built for artists, producers, curators, and cultural teams. Start with everyday writing → unlock Pro tools
        for grants &amp; impact later.
      </p>

      {/* PRICING */}
      <Pricing user={user} products={products ?? []} subscription={subscription} />
    </div>
  );
}
