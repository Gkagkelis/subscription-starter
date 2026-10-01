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

// PILOT: χρειάζεται ο χρήστης κωδικό πρόσκλησης; (fail-open: σε οποιοδήποτε σφάλμα, όχι)
async function needsInvite(user: { id: string; email?: string | null; created_at?: string }) {
  try {
    // Ίδια σημασιολογία με το pilotConfig.inviteRequired(): κενό = ναι.
    const flag = (process.env.NORAYA_INVITE_REQUIRED || '').trim().toLowerCase();
    if (flag && !['1', 'true', 'on', 'yes'].includes(flag)) return false;

    const admins = (process.env.NORAYA_ADMIN_EMAILS || '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    if (user.email && admins.includes(user.email.toLowerCase())) return false;

    const cutoff = new Date(process.env.NORAYA_INVITE_CUTOFF || '2026-09-29T20:00:00Z').getTime();
    const created = user.created_at ? new Date(user.created_at).getTime() : NaN;
    if (Number.isFinite(created) && Number.isFinite(cutoff) && created < cutoff) return false;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return false;
    const r = await fetch(
      `${url}/rest/v1/noraya_access?select=user_id&user_id=eq.${encodeURIComponent(user.id)}&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: 'no-store' }
    );
    if (!r.ok) return false; // π.χ. ο πίνακας δεν έχει δημιουργηθεί ακόμα
    const rows = await r.json();
    return !(Array.isArray(rows) && rows.length > 0);
  } catch {
    return false;
  }
}

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

    // === PILOT: πρόσβαση μόνο με κωδικό πρόσκλησης ===
    // Νέος λογαριασμός χωρίς εξαργυρωμένο κωδικό -> σελίδα /invite.
    // Οι λογαριασμοί που υπήρχαν πριν (NORAYA_INVITE_CUTOFF) και οι admin περνούν κανονικά.
    const inviteGatedRoutes = [
      '/strategy-room',
      '/agenda',
      '/onboarding',
      '/psychografima',
      '/scenarios',
      '/attacks',
      '/people',
      '/situations',
      '/archive',
      '/dashboard'
    ];
    if (
      user &&
      inviteGatedRoutes.some((r) => path === r || path.startsWith(`${r}/`)) &&
      (await needsInvite(user))
    ) {
      return NextResponse.redirect(new URL('/invite', request.url));
    }

    // === Έκδοση πελάτη: Ατζέντα, Καταστάσεις, Πρόσωπα, Αρχεία, Δεδομένα μόνο για admin ===
    // (στο μενού φαίνονται γκρι· αν ανοιχτούν απευθείας, επιστροφή στο «Σήμερα»).
    const adminOnlyPages = ['/agenda', '/situations', '/people', '/archive', '/dashboard/data'];
    if (user && adminOnlyPages.some((r) => path === r || path.startsWith(`${r}/`))) {
      const limitsFlag = (process.env.NORAYA_LIMITS_ENABLED || '').trim().toLowerCase();
      const limitsOn = !limitsFlag || ['1', 'true', 'on', 'yes'].includes(limitsFlag);
      const admins = (process.env.NORAYA_ADMIN_EMAILS || '')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
      const isAdmin = Boolean(user.email && admins.includes(user.email.toLowerCase()));
      if (limitsOn && !isAdmin) {
        return NextResponse.redirect(new URL('/strategy-room', request.url));
      }
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
      '/agenda',
      '/scenarios',
      '/attacks',
      '/people',
      '/situations',
      '/archive',
      '/admin',
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
