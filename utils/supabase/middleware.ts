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

    const publicNorayaRoutes = ['/onboarding'];

    if (publicNorayaRoutes.some((route) => path === route || path.startsWith(`${route}/`))) {
      return response;
    }

    const protectedRoutes = [
      '/strategy-room',
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
