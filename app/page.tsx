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
    
    {/* LOGO */}
    <div className="mt-28 mb-12">
      <img
  src="/axiprova.jpeg"
  alt="Axiprova"
  style={{
    height: '320px',
    width: 'auto'
  }}
/>

    </div>

    {/* HEADLINE */}
   <h1 className="text-4xl md:text-5xl font-semibold max-w-4xl mb-6">
  AI platform for measuring and predicting impact in culture and creative industries
</h1>

<p className="text-lg md:text-xl text-gray-400 max-w-3xl mb-16">
  Axiprova helps cultural organizations, creative teams, and researchers evaluate impact,
  test ideas through pilot studies, and make evidence-based decisions using AI.
</p>

    {/* PRICING */}
    <Pricing
      user={user}
      products={products ?? []}
      subscription={subscription}
    />
  </div>
);

}
