import Link from "next/link";

import { getActor } from "../server/session";

export default async function Home() {
  const actor = await getActor();
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-3xl flex-col items-center justify-center gap-6 px-4 py-16 text-center">
      <h1 className="text-4xl font-bold tracking-tight">DOGFOOD</h1>
      <p className="max-w-xl text-slate-600">
        Self-hosted hackathon submission and judging platform. Create events,
        submit projects, judge with rubrics, and publish deterministic ranking
        snapshots.
      </p>
      <div className="flex items-center gap-3">
        {actor ? (
          <Link
            href="/events"
            className="rounded-md bg-slate-900 px-4 py-2 font-medium text-white"
          >
            Browse events
          </Link>
        ) : (
          <>
            <Link
              href="/register"
              className="rounded-md bg-slate-900 px-4 py-2 font-medium text-white"
            >
              Register
            </Link>
            <Link
              href="/login"
              className="rounded-md border border-slate-300 px-4 py-2 font-medium"
            >
              Log in
            </Link>
          </>
        )}
      </div>
    </main>
  );
}