import Link from "next/link";

import { getActor } from "../server/session";
import { logoutAction } from "../server/actions/auth";

export async function Header() {
  const actor = await getActor();
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-bold tracking-tight">
          DOGFOOD
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/events" className="text-slate-600 hover:text-slate-900">
            Events
          </Link>
          {actor ? (
            <form action={logoutAction}>
              <button
                type="submit"
                className="text-slate-600 hover:text-slate-900"
              >
                Sign out
              </button>
            </form>
          ) : (
            <>
              <Link href="/login" className="text-slate-600 hover:text-slate-900">
                Log in
              </Link>
              <Link
                href="/register"
                className="rounded-md bg-slate-900 px-3 py-1.5 font-medium text-white"
              >
                Register
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}