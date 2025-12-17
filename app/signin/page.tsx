import { redirect } from 'next/navigation';
import { getDefaultSignInView } from '@/utils/auth-helpers/settings';
import { cookies } from 'next/headers';

export default function SignIn({
  searchParams
}: {
  searchParams?: { next?: string };
}) {
  const preferredSignInView =
    cookies().get('preferredSignInView')?.value || null;

  const defaultView = getDefaultSignInView(preferredSignInView);

  const next = searchParams?.next ? encodeURIComponent(searchParams.next) : '';

  return redirect(next ? `/signin/${defaultView}?next=${next}` : `/signin/${defaultView}`);
}
