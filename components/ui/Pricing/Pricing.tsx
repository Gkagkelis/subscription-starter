'use client';

import Button from '@/components/ui/Button';
import type { Tables } from '@/types_db';
import { getStripe } from '@/utils/stripe/client';
import { checkoutWithStripe } from '@/utils/stripe/server';
import { getErrorRedirect } from '@/utils/helpers';
import { User } from '@supabase/supabase-js';
import { useRouter, usePathname } from 'next/navigation';
import { useState } from 'react';

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
  const [priceIdLoading, setPriceIdLoading] = useState<string>();
  const currentPath = usePathname();

  const handleStripeCheckout = async (price: Price) => {
    setPriceIdLoading(price.id);

    if (!user) {
      setPriceIdLoading(undefined);
      return router.push('/signin/signup');
    }

    const { errorRedirect, sessionId } = await checkoutWithStripe(
      price,
      currentPath
    );

    if (errorRedirect) {
      setPriceIdLoading(undefined);
      return router.push(errorRedirect);
    }

    if (!sessionId) {
      setPriceIdLoading(undefined);
      return router.push(
        getErrorRedirect(
          currentPath,
          'An unknown error occurred.',
          'Please try again later or contact a system administrator.'
        )
      );
    }

    const stripe = await getStripe();
    stripe?.redirectToCheckout({ sessionId });
    setPriceIdLoading(undefined);
  };

  const betaProduct = products[0];
  const betaPrice = betaProduct?.prices?.find(p => p.interval === 'month');

  return (
    <section className="bg-black w-full">
      <div className="max-w-6xl px-4 py-8 mx-auto sm:py-16 sm:px-6 lg:px-8">
        
        <div className="text-center mb-12">
          <span className="inline-block px-4 py-1 mb-4 text-sm font-medium text-purple-400 bg-purple-900/30 rounded-full">
            Early Access Pricing
          </span>
          <h2 className="text-3xl font-bold text-white mb-4">
            Join the Axiprova Beta
          </h2>
          <p className="text-zinc-400 max-w-2xl mx-auto">
            Lock in your early adopter price forever. When we launch publicly, prices will increase.
          </p>
        </div>

        <div className="max-w-md mx-auto mb-16">
          <div className="bg-gradient-to-b from-purple-900/40 to-zinc-900 rounded-2xl p-8 border-2 border-purple-500 shadow-lg shadow-purple-500/20 relative">
            
            <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
              <span className="bg-purple-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                AVAILABLE NOW
              </span>
            </div>

            <div className="text-center mb-6 mt-2">
              <h3 className="text-2xl font-bold text-white mb-2">Beta Access</h3>
              <p className="text-zinc-400 text-sm">Full access while we build together</p>
            </div>

            <div className="text-center mb-8">
              <span className="text-5xl font-bold text-white">€18</span>
              <span className="text-xl text-zinc-400 ml-1">/month</span>
            </div>

            <ul className="space-y-3 mb-8">
              <li className="flex items-center text-zinc-300">
                <span className="text-purple-400 mr-3">✓</span>
                Full AI Copilot access
              </li>
              <li className="flex items-center text-zinc-300">
                <span className="text-purple-400 mr-3">✓</span>
                Unlimited data imports
              </li>
              <li className="flex items-center text-zinc-300">
                <span className="text-purple-400 mr-3">✓</span>
                Early adopter pricing forever
              </li>
              <li className="flex items-center text-zinc-300">
                <span className="text-purple-400 mr-3">✓</span>
                Direct access to the team
              </li>
              <li className="flex items-center text-zinc-300">
                <span className="text-purple-400 mr-3">✓</span>
                Shape the product roadmap
              </li>
            </ul>

            {betaPrice ? (
              <Button
                variant="slim"
                type="button"
                loading={priceIdLoading === betaPrice.id}
                onClick={() => handleStripeCheckout(betaPrice)}
                className="w-full py-3 text-base font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition"
              >
                {subscription ? 'Manage Subscription' : 'Join Beta Now'}
              </Button>
            ) : (
              
                href="/signin/signup"
                className="block w-full py-3 text-base font-semibold text-center text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition"
              >
                Join Beta Now
              </a>
            )}

            <p className="text-center text-zinc-500 text-sm mt-4">
              Cancel anytime. No questions asked.
            </p>
          </div>
        </div>

        <div className="text-center mb-8">
          <h3 className="text-xl font-semibold text-zinc-400 mb-2">Coming Soon</h3>
          <p className="text-zinc-500 text-sm">Full pricing tiers launching after beta</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          
          <div className="bg-zinc-900/50 rounded-xl p-6 border border-zinc-800 opacity-60">
            <h3 className="text-xl font-bold text-white mb-2">Basic</h3>
            <p className="text-zinc-500 text-sm mb-4">For individuals exploring</p>
            <div className="mb-4">
              <span className="text-3xl font-bold text-zinc-400">Free</span>
            </div>
            <ul className="space-y-2 text-sm text-zinc-500 mb-6">
              <li>✓ Limited AI queries</li>
              <li>✓ Basic data import</li>
              <li>✓ Community support</li>
            </ul>
            <div className="py-2 text-center text-zinc-600 border border-zinc-700 rounded-lg">
              Coming Soon
            </div>
          </div>

          <div className="bg-zinc-900/50 rounded-xl p-6 border border-zinc-800 opacity-60">
            <h3 className="text-xl font-bold text-white mb-2">Pro</h3>
            <p className="text-zinc-500 text-sm mb-4">For cultural professionals</p>
            <div className="mb-4">
              <span className="text-3xl font-bold text-zinc-400">€29</span>
              <span className="text-zinc-500">/month</span>
            </div>
            <ul className="space-y-2 text-sm text-zinc-500 mb-6">
              <li>✓ Unlimited AI queries</li>
              <li>✓ Advanced analytics</li>
              <li>✓ Priority support</li>
              <li>✓ Content templates</li>
            </ul>
            <div className="py-2 text-center text-zinc-600 border border-zinc-700 rounded-lg">
              Coming Soon
            </div>
          </div>

          <div className="bg-zinc-900/50 rounded-xl p-6 border border-zinc-800 opacity-60">
            <h3 className="text-xl font-bold text-white mb-2">Team</h3>
            <p className="text-zinc-500 text-sm mb-4">For cultural organizations</p>
            <div className="mb-4">
              <span className="text-3xl font-bold text-zinc-400">€79</span>
              <span className="text-zinc-500">/month</span>
            </div>
            <ul className="space-y-2 text-sm text-zinc-500 mb-6">
              <li>✓ Up to 5 team members</li>
              <li>✓ Shared workspace</li>
              <li>✓ Custom reports</li>
              <li>✓ Dedicated support</li>
            </ul>
            <div className="py-2 text-center text-zinc-600 border border-zinc-700 rounded-lg">
              Coming Soon
            </div>
          </div>

        </div>

        <div className="text-center mt-12">
          <p className="text-zinc-500">
            Join the beta now at €18/month and keep this price forever, 
            <br/>even when we launch higher-priced plans.
          </p>
        </div>

      </div>
    </section>
  );
}
