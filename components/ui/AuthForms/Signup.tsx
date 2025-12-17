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

export default function SignUp({ allowEmail, redirectMethod }: SignUpProps) {
  const router = redirectMethod === 'client' ? useRouter() : null;
  const searchParams = useSearchParams();

  // ✅ Αν δεν υπάρχει next, βάλε default που θες
  const next = searchParams.get('next') || '/dashboard/projects/new';
  const nextEncoded = encodeURIComponent(next);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    setIsSubmitting(true);
    await handleRequest(e, signUp, router);
    setIsSubmitting(false);
  };

  return (
    <div className="my-8">
      <form noValidate className="mb-4" onSubmit={handleSubmit}>
        {/* ✅ αυτό είναι το κρίσιμο: περνάει redirect στο server action */}
        <input type="hidden" name="redirectTo" value={next} />

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

          <Button variant="slim" type="submit" className="mt-1" loading={isSubmitting}>
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
