'use client';

import Link from 'next/link';
import Image from 'next/image';
import { SignOut } from '@/utils/auth-helpers/server';
import { handleRequest } from '@/utils/auth-helpers/client';
import { usePathname, useRouter } from 'next/navigation';
import { getRedirectMethod } from '@/utils/auth-helpers/settings';
import s from './Navbar.module.css';

interface NavlinksProps {
  user?: any;
}

export default function Navlinks({ user }: NavlinksProps) {
  const router = getRedirectMethod() === 'client' ? useRouter() : null;

  return (
    <div className="relative flex flex-row justify-between py-4 align-center md:py-6">
      <div className="flex items-center flex-1">
        <Link href="/" className={s.logo} aria-label="Logo">
          <Image 
            src="/axiprova-icon.png" 
            alt="Axiprova" 
            width={40} 
            height={40}
          />
        </Link>
        <nav className="ml-6 space-x-2 lg:block">
          <Link href="/dashboard/copilot" className={s.link}>
            Let's Go!
          </Link>
          {user && (
            <Link href="/dashboard/data" className={s.link}>
              My Data
            </Link>
          )}
        </nav>
      </div>
      <div className="flex justify-end items-center space-x-4">
        {user ? (
          <>
            <Link href="/dashboard/profile" className="flex items-center gap-2 hover:opacity-80 transition">
              <Image 
                src="/profil_logo.png" 
                alt="Profile" 
                width={28} 
                height={28}
                className="rounded-full"
              />
            </Link>
            <form onSubmit={(e) => handleRequest(e, SignOut, router)}>
              <input type="hidden" name="pathName" value={usePathname()} />
              <button type="submit" className={s.link}>
                Sign out
              </button>
            </form>
          </>
        ) : (
          <Link href="/signin" className={s.link}>
            Sign In
          </Link>
        )}
      </div>
    </div>
  );
}
