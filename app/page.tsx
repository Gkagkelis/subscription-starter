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
      <div className="mt-20 mb-6">
        <img src="/noraya.png" alt="Noraya" style={{ height: '320px', width: 'auto' }} className="mx-auto mb-4" />
        <p className="text-lg tracking-widest text-zinc-500 uppercase mb-10">Political Intelligence Platform</p>
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-zinc-700 bg-zinc-900/50 mb-8">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="text-sm text-zinc-400">Private Beta</span>
        </div>
        <h2 className="text-2xl md:text-4xl font-light text-white max-w-4xl mb-6 leading-tight">{'AI \u03C0\u03B1\u03C1\u03B1\u03BA\u03BF\u03BB\u03BF\u03CD\u03B8\u03B7\u03C3\u03B7, \u03B1\u03BD\u03AC\u03BB\u03C5\u03C3\u03B7 \u03BA\u03B1\u03B9 \u03C0\u03C1\u03CC\u03B2\u03BB\u03B5\u03C8\u03B7 \u03B4\u03B7\u03BC\u03CC\u03C3\u03B9\u03BF\u03C5 \u03BB\u03CC\u03B3\u03BF\u03C5'}</h2>
        <p className="text-base md:text-lg text-zinc-500 max-w-2xl mb-14">{'\u03A0\u03C1\u03BF\u03C3\u03B1\u03C1\u03BC\u03BF\u03C3\u03BC\u03AD\u03BD\u03B7 \u03C3\u03C4\u03B9\u03C2 \u03B8\u03AD\u03C3\u03B5\u03B9\u03C2 \u03C4\u03BF\u03C5 \u03BF\u03C1\u03B3\u03B1\u03BD\u03B9\u03C3\u03BC\u03BF\u03CD \u03C3\u03B1\u03C2.'}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mb-20">
        <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900/30 text-left">
          <h3 className="text-lg font-semibold text-white mb-2">{'\u03A0\u03B1\u03C1\u03B1\u03BA\u03BF\u03BB\u03BF\u03CD\u03B8\u03B7\u03C3\u03B7 \u0398\u03B5\u03BC\u03AC\u03C4\u03C9\u03BD'}</h3>
          <p className="text-sm text-zinc-400">{'Real-time tracking \u03B5\u03BB\u03BB\u03B7\u03BD\u03B9\u03BA\u03CE\u03BD \u039C\u039C\u0395, \u0392\u03BF\u03C5\u03BB\u03AE\u03C2 \u03BA\u03B1\u03B9 social media. Sentiment analysis \u03BA\u03B1\u03B9 \u03B5\u03B9\u03B4\u03BF\u03C0\u03BF\u03B9\u03AE\u03C3\u03B5\u03B9\u03C2 \u03C4\u03AC\u03C3\u03B5\u03C9\u03BD.'}</p>
        </div>
        <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900/30 text-left">
          <h3 className="text-lg font-semibold text-white mb-2">{'AI \u03A0\u03BF\u03BB\u03B9\u03C4\u03B9\u03BA\u03CC\u03C2 \u0391\u03BD\u03B1\u03BB\u03C5\u03C4\u03AE\u03C2'}</h3>
          <p className="text-sm text-zinc-400">{'\u03A1\u03C9\u03C4\u03AE\u03C3\u03C4\u03B5 \u03BF\u03C4\u03B9\u03B4\u03AE\u03C0\u03BF\u03C4\u03B5. \u03A4\u03BF AI \u03B1\u03C0\u03B1\u03BD\u03C4\u03AC \u03BC\u03B5 \u03B2\u03AC\u03C3\u03B7 \u03C4\u03B1 \u03B4\u03B5\u03B4\u03BF\u03BC\u03AD\u03BD\u03B1 \u03BA\u03B1\u03B9 \u03C4\u03B9\u03C2 \u03B8\u03AD\u03C3\u03B5\u03B9\u03C2 \u03C4\u03BF\u03C5 \u03BF\u03C1\u03B3\u03B1\u03BD\u03B9\u03C3\u03BC\u03BF\u03CD \u03C3\u03B1\u03C2.'}</p>
        </div>
        <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900/30 text-left">
          <h3 className="text-lg font-semibold text-white mb-2">{'\u0391\u03C0\u03BF\u03BC\u03CC\u03BD\u03C9\u03C3\u03B7 \u0394\u03B5\u03B4\u03BF\u03BC\u03AD\u03BD\u03C9\u03BD'}</h3>
          <p className="text-sm text-zinc-400">{'\u039A\u03AC\u03B8\u03B5 \u03BF\u03C1\u03B3\u03B1\u03BD\u03B9\u03C3\u03BC\u03CC\u03C2 \u03B2\u03BB\u03AD\u03C0\u03B5\u03B9 \u03BC\u03CC\u03BD\u03BF \u03C4\u03B1 \u03B4\u03B9\u03BA\u03AC \u03C4\u03BF\u03C5. \u03A0\u03BB\u03AE\u03C1\u03B7\u03C2 \u03B1\u03C0\u03BF\u03BC\u03CC\u03BD\u03C9\u03C3\u03B7, audit trail, GDPR.'}</p>
        </div>
      </div>
      <Pricing user={user} products={products ?? []} subscription={subscription} />
    </div>
  );
}
