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
      <div className="mt-28 mb-6">
        <img src="/noraya.png" alt="Noraya" style={{ height: '180px', width: 'auto' }} className="mx-auto mb-8" />
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-zinc-700 bg-zinc-900/50 mb-8">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="text-sm text-zinc-400">AI-Powered Political Intelligence</span>
        </div>
        <p className="text-xl md:text-2xl text-zinc-300 max-w-3xl mb-4 font-light">Issue Intelligence and Political Risk Monitoring</p>
        <p className="text-base md:text-lg text-zinc-500 max-w-2xl mb-14">AI-powered strategic insights for political organizations. Personalized to your positions.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mb-20">
        <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900/30 text-left">
          <h3 className="text-lg font-semibold text-white mb-2">Issue Monitoring</h3>
          <p className="text-sm text-zinc-400">Real-time tracking of Greek media, Parliament, and social media. Sentiment analysis and trend alerts.</p>
        </div>
        <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900/30 text-left">
          <h3 className="text-lg font-semibold text-white mb-2">AI Political Analyst</h3>
          <p className="text-sm text-zinc-400">Ask anything. AI answers based on public data and your organization positions. Scenario analysis included.</p>
        </div>
        <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900/30 text-left">
          <h3 className="text-lg font-semibold text-white mb-2">Tenant Isolation</h3>
          <p className="text-sm text-zinc-400">Each organization sees only its own data. Full isolation, audit trail, GDPR compliance.</p>
        </div>
      </div>
      <Pricing user={user} products={products ?? []} subscription={subscription} />
    </div>
  );
}
