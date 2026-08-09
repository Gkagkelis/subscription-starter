'use client';

import Button from '@/components/ui/Button';
import React, { useState } from 'react';
import Link from 'next/link';
import { signUp } from '@/utils/auth-helpers/server';
import { handleRequest } from '@/utils/auth-helpers/client';
import { useRouter, useSearchParams } from 'next/navigation';

interface SignUpProps {
  allowEmail: boolean;
  redirectMethod: string;
}

export default function SignUp({
  allowEmail,
  redirectMethod
}: SignUpProps) {
  const router = redirectMethod === 'client' ? useRouter() : null;
  const searchParams = useSearchParams();

  // Αν δεν υπάρχει next, πήγαινε στο onboarding
  const next = searchParams.get('next') || '/onboarding';
  const nextEncoded = encodeURIComponent(next);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    setIsSubmitting(true);

    // Πάρε email και role ΠΡΙΝ το handleRequest
    // γιατί μετά μπορεί να γίνει redirect
    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const role = searchParams.get('role') || '';

    await handleRequest(e, signUp, router);

    // Στείλε welcome email μετά την εγγραφή
    if (email) {
      fetch('/api/welcome-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email,
          name: '',
          role
        })
      }).catch(() => {});
    }

    setIsSubmitting(false);
  };

  return (
    <div>
      <form onSubmit={handleSubmit}>
        {/* Περνάει redirect στο server action */}
        <input type="hidden" name="redirect" value={next} />

        <div className="grid gap-2">
          <div className="grid gap-1">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              placeholder="name@example.com"
              type="email"
              name="email"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect="off"
              className="w-full p-3 rounded-md bg-zinc-800"
            />

            <label htmlFor="password">Password</label>
            <input
              id="password"
              placeholder="Password"
              type="password"
              name="password"
              autoComplete="current-password"
              className="w-full p-3 rounded-md bg-zinc-800"
            />
          </div>

          <Button
            variant="slim"
            type="submit"
            className="mt-1"
            loading={isSubmitting}
          >
            Sign up
          </Button>
        </div>
      </form>

      <p>Already have an account?</p>

      <p>
        <Link
          href={`/signin/password_signin?next=${nextEncoded}`}
          className="font-light text-sm"
        >
          Sign in with email and password
        </Link>
      </p>

      {allowEmail && (
        <p>
          <Link
            href={`/signin/email_signin?next=${nextEncoded}`}
            className="font-light text-sm"
          >
            Sign in via magic link
          </Link>
        </p>
      )}
    </div>
  );
}
