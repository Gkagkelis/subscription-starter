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
      <div className="mt-28 mb-10">
        <img
          src="/axiprova.jpeg"
          alt="Axiprova"
          style={{ height: '320px', width: 'auto' }}
        />
      </div>

      <h1 className="text-4xl md:text-5xl font-semibold max-w-4xl mb-5">
        AI workspace for artists, cultural producers, and creative teams
      </h1>

      <p className="text-lg md:text-xl text-gray-400 max-w-3xl mb-14">
        Describe your project once — get versions for website, social, email, press, applications.
      </p>

      <Pricing
        user={user}
        products={products ?? []}
        subscription={subscription}
      />
    </div>
  );
}
