import Link from "next/link";

import { getActor } from "../server/session";

export default async function Home() {
  const actor = await getActor();
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-3xl flex-col items-center justify-center gap-6 px-4 py-16 text-center">
      <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold tracking-wide text-indigo-700 uppercase">
        Self-hosted hackathons
      </span>
      <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
        DOGFOOD
      </h1>
      <p className="max-w-xl text-slate-600">
        Self-hosted hackathon submission and judging platform. Create events,
        submit projects, judge with rubrics, and publish deterministic ranking
        snapshots.
      </p>
      <ul className="grid w-full max-w-2xl gap-3 text-left sm:grid-cols-3">
        {[
          {
            title: "Run the event",
            body: "Set registration and submission windows, invite members, and advance the state machine.",
          },
          {
            title: "Judge fairly",
            body: "Weighted rubrics, per-criterion scores, and locked evaluations nobody can edit later.",
          },
          {
            title: "Publish results",
            body: "Deterministic ranking snapshots you can regenerate and verify yourself.",
          },
        ].map((item) => (
          <li
            key={item.title}
            className="rounded-xl border border-slate-200 bg-white p-4"
          >
            <p className="text-sm font-semibold text-slate-900">{item.title}</p>
            <p className="mt-1 text-xs text-slate-500">{item.body}</p>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-3">
        {actor ? (
          <Link
            href="/events"
            className="rounded-md bg-slate-900 px-4 py-2 font-medium text-white transition hover:bg-slate-700"
          >
            Browse events
          </Link>
        ) : (
          <>
            <Link
              href="/register"
              className="rounded-md bg-slate-900 px-4 py-2 font-medium text-white transition hover:bg-slate-700"
            >
              Register
            </Link>
            <Link
              href="/login"
              className="rounded-md border border-slate-300 px-4 py-2 font-medium transition hover:bg-slate-50"
            >
              Log in
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
