import { redirect } from "next/navigation";

import { ActionForm } from "../../components/action-form";
import { getActor } from "../../server/session";
import { registerAction } from "../../server/actions/auth";

export default async function RegisterPage() {
  const actor = await getActor();
  if (actor) redirect("/events");

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <h1 className="mb-6 text-2xl font-bold">Create an account</h1>
      <ActionForm action={registerAction} submitLabel="Register">
        <label className="block text-sm font-medium">
          Email
          <input
            type="email"
            name="email"
            required
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="mt-4 block text-sm font-medium">
          Display name
          <input
            type="text"
            name="displayName"
            required
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="mt-4 block text-sm font-medium">
          Password
          <input
            type="password"
            name="password"
            minLength={8}
            required
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
      </ActionForm>
    </main>
  );
}