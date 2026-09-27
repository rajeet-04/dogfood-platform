import { redirect } from "next/navigation";

import { ActionForm } from "../../../components/action-form";
import { getActor } from "../../../server/session";
import { createEventAction } from "../../../server/actions/event";

export const dynamic = "force-dynamic";

export default async function NewEventPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");

  return (
    <main className="mx-auto max-w-lg px-4 py-12">
      <h1 className="mb-6 text-2xl font-bold">Create an event</h1>
      <p className="mb-6 text-sm text-slate-500">
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
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="mt-4 block text-sm font-medium">
          Name
          <input
            type="text"
            name="name"
            required
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="mt-4 block text-sm font-medium">
          Description (optional)
          <textarea
            name="description"
            rows={3}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <input type="hidden" name="timezone" value="UTC" />
      </ActionForm>
    </main>
  );
}