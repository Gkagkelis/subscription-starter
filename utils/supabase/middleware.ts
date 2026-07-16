import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

export const createClient = (request: NextRequest) => {
  let response = NextResponse.next({
    request: {
      headers: request.headers
    }
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options
          });

          response = NextResponse.next({
            request: {
              headers: request.headers
            }
          });

          response.cookies.set({
            name,
            value,
            ...options
          });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options
          });

          response = NextResponse.next({
            request: {
              headers: request.headers
            }
          });

          response.cookies.set({
            name,
            value: '',
            ...options
          });
        }
      }
    }
  );

  return { supabase, response };
};

export const updateSession = async (request: NextRequest) => {
  try {
    const { supabase, response } = createClient(request);

    const {
      data: { user }
    } = await supabase.auth.getUser();

    const path = request.nextUrl.pathname;

    if (user && path === '/') {
      return NextResponse.redirect(new URL('/strategy-room', request.url));
    }

    const publicNorayaRoutes = ['/onboarding', '/psychografima'];

    // === ΔΡΟΜΟΛΟΓΗΣΗ ΒΟΥΛΕΥΤΗ: onboarding -> ψυχογραφημα -> μενου ===
    // Αν ο συνδεδεμενος χρηστης εχει κομμα αλλα ΔΕΝ εχει ψυχογραφημα, τον στελνουμε
    // στο ψυχογραφημα (μια φορα). Ελεγχος μονο στις «βαριες» σελιδες του εργαλειου.
    const gatedRoutes = ['/strategy-room', '/agenda'];
    const needsGateCheck =
      user && gatedRoutes.some((r) => path === r || path.startsWith(`${r}/`));
    if (needsGateCheck) {
      try {
        // Το ψυχογραφημα αφορα ΜΟΝΟ βουλευτες/υποψηφιους — ΟΧΙ το κομματικο επιτελειο.
        // Ελεγχουμε τον τυπο χρηστη απο organizations.org_type.
        const { data: orgRow } = await supabase
          .from('organizations')
          .select('org_type')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle();
        const orgType = String((orgRow as any)?.org_type || '').toLowerCase();
        // Noraya PS: υποψηφιοι + βουλευτες + ευρωβουλευτες περνουν απο ψυχογραφημα.
        // (Το 'βουλευτ' πιανει και «Υποψήφιος Βουλευτής» και «Γραφείο Βουλευτή».)
        const isMp =
          orgType.includes('βουλευτ') ||
          orgType.includes('υποψηφ') ||
          orgType.includes('ευρωβουλευτ');

        if (isMp) {
          const { data: prof } = await supabase
            .from('psychometric_profiles')
            .select('id')
            .eq('user_id', user.id)
            .limit(1);
          const hasPsycho = Array.isArray(prof) && prof.length > 0;
          if (!hasPsycho) {
            return NextResponse.redirect(new URL('/psychografima', request.url));
          }
        }
        // Επιτελειο κομματος -> κατευθειαν στο μενου, χωρις ψυχογραφημα.
      } catch {
        // fail-open: αν ο ελεγχος αποτυχει, ΜΗΝ μπλοκαρεις την προσβαση
      }
    }

    if (publicNorayaRoutes.some((route) => path === route || path.startsWith(`${route}/`))) {
      return response;
    }

    const protectedRoutes = [
      '/strategy-room',
      '/psychografima',
      '/dashboard',
      '/dashboard/profile',
      '/dashboard/data',
      '/dashboard/settings',
      '/dashboard/billing'
    ];

    if (
      !user &&
      protectedRoutes.some((route) => path === route || path.startsWith(`${route}/`))
    ) {
      return NextResponse.redirect(new URL('/signin', request.url));
    }

    return response;
  } catch (e) {
    return NextResponse.next({
      request: {
        headers: request.headers
      }
    });
  }
};
