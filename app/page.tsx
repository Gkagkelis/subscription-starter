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
  <div className="flex flex-col items-center">
    {/* AXIPROVA LOGO */}
    <div className="mt-20 mb-16">
      <img
        src="/axiprova.jpeg"
        alt="Axiprova"
        style={{ height: '140px' }}
      />
    </div>

    {/* PRICING */}
    <Pricing
      user={user}
      products={products ?? []}
      subscription={subscription}
    />
  </div>
);
}
