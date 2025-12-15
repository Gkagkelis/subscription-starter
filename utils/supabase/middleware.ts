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
    const { data: { user } } = await supabase.auth.getUser();
    
    const path = request.nextUrl.pathname;

    if (user) {
      // Check if user has profile
      const { data: profile } = await supabase
        .from('org_profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();

      // If logged in, on homepage, redirect to copilot (or profile if no profile)
      if (path === '/') {
        if (!profile) {
          return NextResponse.redirect(new URL('/dashboard/profile', request.url));
        }
        return NextResponse.redirect(new URL('/dashboard/copilot', request.url));
      }

      // If going to copilot but no profile, redirect to profile first
      if (path === '/dashboard/copilot' && !profile) {
        return NextResponse.redirect(new URL('/dashboard/profile', request.url));
      }
    }

    // If NOT logged in and trying to access dashboard, redirect to signin
    if (!user && path.startsWith('/dashboard')) {
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
