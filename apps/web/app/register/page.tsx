import { redirect } from "next/navigation";

import { ActionForm } from "../../components/action-form";
import { getActor } from "../../server/session";
import { registerAction } from "../../server/actions/auth";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const actor = await getActor();
  if (actor) redirect(next && next.startsWith("/") ? next : "/events");

  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <div className="rounded-2xl border border-slate-200 bg-white p-8">
        <h1 className="text-2xl font-bold tracking-tight">Create an account</h1>
        <p className="mt-1 text-sm text-slate-500">
          One account per person. You can hold several roles per event.
        </p>
        <ActionForm action={registerAction} submitLabel="Register">
          {next ? <input type="hidden" name="next" value={next} /> : null}
          <label className="block text-sm font-medium">
            Email
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
            />
          </label>
          <label className="mt-4 block text-sm font-medium">
            Display name
            <input
              type="text"
              name="displayName"
              required
              autoComplete="name"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
            />
          </label>
          <label className="mt-4 block text-sm font-medium">
            Password
            <input
              type="password"
              name="password"
              minLength={8}
              required
              autoComplete="new-password"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
            />
          </label>
          <p className="mt-1 text-xs text-slate-400">At least 8 characters.</p>
        </ActionForm>
      </div>
      <p className="mt-4 text-center text-sm text-slate-500">
        Already registered?{" "}
        <a href="/login" className="font-medium text-slate-700 hover:underline">
          Log in
        </a>
      </p>
    </main>
  );
}
