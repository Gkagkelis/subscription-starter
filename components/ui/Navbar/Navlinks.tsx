"use client";

import Link from "next/link";
import Image from "next/image";
import { SignOut } from "@/utils/auth-helpers/server";
import { handleRequest } from "@/utils/auth-helpers/client";
import { usePathname, useRouter } from "next/navigation";
import { getRedirectMethod } from "@/utils/auth-helpers/settings";
import s from "./Navbar.module.css";

interface NavlinksProps {
  user?: any;
}

export default function Navlinks({ user }: NavlinksProps) {
  const router = getRedirectMethod() === "client" ? useRouter() : null;

  return (
    <div className="relative flex flex-row items-center justify-between py-4 align-center md:py-6">
      <div className="flex items-center flex-1 gap-2">
        <Link href={user ? "/dashboard" : "/"} className={s.logo} aria-label="Logo">
          <Image src="/noraya.png" alt="Noraya" width={32} height={32} />
        </Link>
        <span className="text-sm text-zinc-500 tracking-widest uppercase">
          Noraya
        </span>
      </div>

      <Link
        href="/"
        className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center justify-center md:flex"
        aria-label="Noraya home"
      >
        <Image
          src="/noraya-eye.png"
          alt="Noraya"
          width={90}
          height={42}
          className="h-7 w-auto object-contain opacity-90"
          priority
        />
      </Link>

      <div className="flex justify-end items-center space-x-4">
        {user ? (
          <>
            <Link
              href="/dashboard/profile"
              className="flex items-center gap-2 hover:opacity-80 transition"
              aria-label="Profile"
            >
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
          <>
            <Link href="/signin" className={s.link}>
              Sign In
            </Link>

            <Link
              href="/onboarding"
              className="text-sm bg-white text-black px-4 py-2 rounded-md hover:bg-zinc-200 transition"
            >
              Ξεκινήστε δωρεάν
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
