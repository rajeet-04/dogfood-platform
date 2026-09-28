import { redirect } from "next/navigation";

import { ActionForm } from "../../../components/action-form";
import { getActor } from "../../../server/session";
import { createEventAction } from "../../../server/actions/event";

export const dynamic = "force-dynamic";

export default async function NewEventPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");

  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      <div className="rounded-2xl border border-slate-200 bg-white p-8">
        <h1 className="text-2xl font-bold tracking-tight">Create an event</h1>
        <p className="mt-1 mb-6 text-sm text-slate-500">
          You become the organizer of the new event automatically.
        </p>
        <ActionForm action={createEventAction} submitLabel="Create event">
          <label className="block text-sm font-medium">
            Slug
            <input
              type="text"
              name="slug"
              required
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              placeholder="summer-hack-2026"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
            />
            <span className="mt-1 block text-xs text-slate-400">
              Lowercase letters, digits and dashes. This becomes the public URL.
            </span>
          </label>
          <label className="mt-4 block text-sm font-medium">
            Name
            <input
              type="text"
              name="name"
              required
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
            />
          </label>
          <label className="mt-4 block text-sm font-medium">
            Description (optional)
            <textarea
              name="description"
              rows={3}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
            />
          </label>
          <input type="hidden" name="timezone" value="UTC" />
        </ActionForm>
      </div>
    </main>
  );
}
