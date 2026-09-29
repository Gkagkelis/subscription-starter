'use client';

import Button from '@/components/ui/Button';
import React, { useState } from 'react';
import Link from 'next/link';
import { redirectToPath, signUp } from '@/utils/auth-helpers/server';
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
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState(searchParams.get('invite') || '');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Κρατάμε τη φόρμα τώρα (μετά από await το e.currentTarget μηδενίζεται).
    const form = e.currentTarget;
    setInviteError(null);
    setIsSubmitting(true);

    // Πάρε email και role ΠΡΙΝ την εγγραφή
    // γιατί μετά μπορεί να γίνει redirect
    const formData = new FormData(form);
    const email = formData.get('email') as string;
    const role = searchParams.get('role') || '';

    // PILOT: η εγγραφή γίνεται μόνο με έγκυρο κωδικό πρόσκλησης. Ο έλεγχος
    // κρατά τον κωδικό σε cookie ώστε να εξαργυρωθεί με την πρώτη σύνδεση.
    // Ο server αποφασίζει αν ο κωδικός απαιτείται (NORAYA_INVITE_REQUIRED).
    const code = inviteCode.trim().toUpperCase();
    try {
      const r = await fetch('/api/invite/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d?.ok) {
        setInviteError(d?.error || 'Ο κωδικός δεν είναι έγκυρος.');
        setIsSubmitting(false);
        return;
      }
    } catch {
      setInviteError('Σφάλμα σύνδεσης. Δοκιμάστε ξανά.');
      setIsSubmitting(false);
      return;
    }

    const redirectUrl = await signUp(formData);
    if (router) {
      router.push(redirectUrl);
    } else {
      await redirectToPath(redirectUrl);
    }

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

            <label htmlFor="invite">Κωδικός πρόσκλησης</label>
            <input
              id="invite"
              placeholder="π.χ. ABCD-2026"
              type="text"
              name="invite"
              autoCapitalize="characters"
              autoComplete="off"
              value={inviteCode}
              onChange={(ev) => setInviteCode(ev.target.value)}
              className="w-full p-3 rounded-md bg-zinc-800 tracking-widest"
            />
            {inviteError ? (
              <p className="text-sm text-amber-300">{inviteError}</p>
            ) : null}

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
