'use client';

import type { Tables } from '@/types_db';
import { getStripe } from '@/utils/stripe/client';
import { checkoutWithStripe } from '@/utils/stripe/server';
import { getErrorRedirect } from '@/utils/helpers';
import { User } from '@supabase/supabase-js';
import { useRouter, usePathname } from 'next/navigation';
import { useMemo, useState } from 'react';

type Subscription = Tables<'subscriptions'>;
type Product = Tables<'products'>;
type Price = Tables<'prices'>;

interface ProductWithPrices extends Product {
  prices: Price[];
}
interface PriceWithProduct extends Price {
  products: Product | null;
}
interface SubscriptionWithProduct extends Subscription {
  prices: PriceWithProduct | null;
}

interface Props {
  user: User | null | undefined;
  products: ProductWithPrices[];
  subscription: SubscriptionWithProduct | null;
}

export default function Pricing({ user, products, subscription }: Props) {
  const router = useRouter();
  const currentPath = usePathname();
  const [priceIdLoading, setPriceIdLoading] = useState<string>();

  // === ROUTES (προσαρμόζονται αν έχεις άλλα auth paths) ===
  const SIGNUP_URL = '/signin/signup?next=/dashboard/projects/new';
  const DASH_ENTRY = '/dashboard/projects/new';

  // Αν έχεις Stripe product/price, το βρίσκουμε (αλλά δεν το απαιτούμε)
  const betaProduct = products?.[0];
  const betaPrice = useMemo(
    () => betaProduct?.prices?.find((p) => p.interval === 'month'),
    [betaProduct]
  );

  // Αν ΔΕΝ είναι συνδεδεμένο, δείχνουμε €8 hardcoded
  const displayMonthlyEuro = useMemo(() => {
    const unit = betaPrice?.unit_amount;
    if (typeof unit === 'number' && !Number.isNaN(unit)) {
      // unit_amount είναι σε cents
      const euro = Math.round(unit) / 100;
      return euro.toFixed(euro % 1 === 0 ? 0 : 2);
    }
    return '8';
  }, [betaPrice]);

  // Αν όντως έχεις Stripe setup, μπορείς να κάνεις checkout.
  // Αν όχι, πάει signup → wizard.
  const handleStripeCheckout = async (price: Price) => {
    setPriceIdLoading(price.id);

    // Αν δεν υπάρχει user, πάμε signup (με next)
    if (!user) {
      setPriceIdLoading(undefined);
      return router.push(SIGNUP_URL);
    }

    // Αν δεν έχεις στην πράξη stripe ενεργό, απλά πήγαινε στο entry point
    // (πρακτικό safety ώστε να μη σκάει)
    try {
      const { errorRedirect, sessionId } = await checkoutWithStripe(price, currentPath);
      if (errorRedirect) {
        setPriceIdLoading(undefined);
        return router.push(errorRedirect);
      }
      if (!sessionId) {
        setPriceIdLoading(undefined);
        return router.push(getErrorRedirect(currentPath, 'Error', 'Please try again.'));
      }
      const stripe = await getStripe();
      stripe?.redirectToCheckout({ sessionId });
    } catch {
      // fallback
      router.push(DASH_ENTRY);
    } finally {
      setPriceIdLoading(undefined);
    }
  };

  return (
    <section className="w-full">
      <div className="max-w-6xl px-4 py-8 mx-auto sm:py-16 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="text-center mb-12">
          <span className="inline-block px-4 py-1 mb-4 text-sm font-medium text-purple-400 bg-purple-900/30 rounded-full">
            Early Access Pricing
          </span>
          <h2 className="text-3xl font-bold text-white mb-4">
            Join the Axiprova Beta
          </h2>
          <p className="text-zinc-400 max-w-2xl mx-auto">
            Start with Project DNA (mass) — unlock Pro grants & impact tools later.
          </p>
        </div>

        {/* Beta Card */}
        <div className="max-w-md mx-auto mb-16">
          <div className="bg-gradient-to-b from-purple-900/40 to-zinc-900 rounded-2xl p-8 border-2 border-purple-500 shadow-lg shadow-purple-500/20 relative">

            <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
              <span className="bg-purple-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                AVAILABLE NOW
              </span>
            </div>

            <div className="text-center mb-6 mt-2">
              <h3 className="text-2xl font-bold text-white mb-2">Beta Access</h3>
              <p className="text-zinc-400 text-sm">
                Full access to the core workflow — built with real users
              </p>
            </div>

            <div className="text-center mb-8">
              <span className="text-5xl font-bold text-white">€{displayMonthlyEuro}</span>
              <span className="text-xl text-zinc-400 ml-1">/month</span>
            </div>

            <ul className="space-y-3 mb-8">
              <li className="flex items-center text-zinc-300">
                <span className="text-purple-400 mr-3">✓</span>
                Project DNA (guided flow — no blank page)
              </li>
              <li className="flex items-center text-zinc-300">
                <span className="text-purple-400 mr-3">✓</span>
                1-click formats (social / email / website / press / applications)
              </li>
              <li className="flex items-center text-zinc-300">
                <span className="text-purple-400 mr-3">✓</span>
                Save library + version history (build your archive)
              </li>
              <li className="flex items-center text-zinc-300">
                <span className="text-purple-400 mr-3">✓</span>
                Auto bilingual (EN/EL)
              </li>
              <li className="flex items-center text-zinc-300">
                <span className="text-purple-400 mr-3">✓</span>
                Early adopter pricing forever
              </li>
              <li className="flex items-center text-zinc-300">
                <span className="text-purple-400 mr-3">✓</span>
                Direct access to the team + roadmap input
              </li>
            </ul>

            {/* CTA: αν δεν έχεις Stripe connected → signup wizard.
                Αν έχεις Price και user → μπορείς να κάνεις checkout. */}
            {betaPrice && user ? (
              <button
                onClick={() => handleStripeCheckout(betaPrice)}
                disabled={priceIdLoading === betaPrice.id}
                className="block w-full py-3 text-base font-semibold text-center text-white bg-purple-600 hover:bg-purple-700 rounded-lg disabled:opacity-60"
              >
                {priceIdLoading === betaPrice.id ? 'Redirecting…' : 'Join Beta Now'}
              </button>
            ) : (
              <a
                href={SIGNUP_URL}
                className="block w-full py-3 text-base font-semibold text-center text-white bg-purple-600 hover:bg-purple-700 rounded-lg"
              >
                Join Beta Now
              </a>
            )}

            <p className="text-center text-zinc-500 text-sm mt-4">
              Cancel anytime. No questions asked.
            </p>
          </div>
        </div>

        {/* Coming Soon */}
        <div className="text-center mb-8">
          <h3 className="text-xl font-semibold text-zinc-400 mb-2">Coming Soon</h3>
          <p className="text-zinc-500 text-sm">
            Clear next steps: Creator → Pro (grants/impact) → Team workspace
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">

          {/* Free */}
          <div className="bg-zinc-900/50 rounded-xl p-6 border border-zinc-800 opacity-70">
            <h3 className="text-xl font-bold text-white mb-2">Free — Starter</h3>
            <p className="text-zinc-500 text-sm mb-4">For trying it out</p>
            <div className="mb-4">
              <span className="text-3xl font-bold text-zinc-400">Free</span>
            </div>
            <ul className="space-y-2 text-sm text-zinc-500 mb-6">
              <li>1 Project DNA</li>
              <li>Limited derivatives (e.g. 10 generations/month)</li>
              <li>Save 3 outputs</li>
              <li>Community support</li>
            </ul>
            <div className="py-2 text-center text-zinc-600 border border-zinc-700 rounded-lg">
              Coming Soon
            </div>
          </div>

          {/* Pro */}
          <div className="bg-zinc-900/50 rounded-xl p-6 border border-zinc-800 opacity-70">
            <h3 className="text-xl font-bold text-white mb-2">Pro</h3>
            <p className="text-zinc-500 text-sm mb-4">For professionals who apply & collaborate</p>
            <div className="mb-4">
              <span className="text-3xl font-bold text-zinc-400">€29</span>
              <span className="text-zinc-500">/month</span>
            </div>
            <ul className="space-y-2 text-sm text-zinc-500 mb-6">
              <li>Unlimited Project DNA + derivatives</li>
              <li>Grant-ready outputs (sections + application version)</li>
              <li>Impact framing (Theory of Change + KPI drafts)</li>
              <li>Templates library (bio / pitch / press / open-call answers)</li>
              <li>Priority support</li>
            </ul>
            <div className="py-2 text-center text-zinc-600 border border-zinc-700 rounded-lg">
              Coming Soon
            </div>
          </div>

          {/* Team */}
          <div className="bg-zinc-900/50 rounded-xl p-6 border border-zinc-800 opacity-70">
            <h3 className="text-xl font-bold text-white mb-2">Team</h3>
            <p className="text-zinc-500 text-sm mb-4">For small organizations & teams</p>
            <div className="mb-4">
              <span className="text-3xl font-bold text-zinc-400">€79</span>
              <span className="text-zinc-500">/month</span>
            </div>
            <ul className="space-y-2 text-sm text-zinc-500 mb-6">
              <li>Up to 5 members</li>
              <li>Shared library (projects + outputs)</li>
              <li>Org memory (shared tone/voice + reusable snippets)</li>
              <li>Roles (basic) + shared templates</li>
              <li>Dedicated support</li>
            </ul>
            <div className="py-2 text-center text-zinc-600 border border-zinc-700 rounded-lg">
              Coming Soon
            </div>
          </div>

        </div>

        <div className="text-center mt-12">
          <p className="text-zinc-500">
            Join the beta now and keep this price forever.
          </p>
        </div>

      </div>
    </section>
  );
}
