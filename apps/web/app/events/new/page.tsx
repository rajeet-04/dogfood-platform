import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { ActionForm } from "../../../components/action-form";
import { ButtonLink } from "../../../components/ui/button";
import { Field, Input, Textarea } from "../../../components/ui/input";
import { EventWindowFields } from "../../../components/event-window-fields";
import { Page, PageHeader } from "../../../components/ui/page-header";
import { getActor } from "../../../server/session";
import { createEventAction } from "../../../server/actions/event";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "New event" };

export default async function NewEventPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");

  return (
    <Page width="narrow">
      <PageHeader
        breadcrumbs={[
          { label: "Events", href: "/events" },
          { label: "New event" },
        ]}
        title="Create an event"
        description="You become the organizer of the new event automatically."
        className="mb-6"
      />

      <div className="rounded-xl border border-line bg-surface p-5 shadow-xs sm:p-6">
        <ActionForm
          action={createEventAction}
          submitLabel="Create event"
          className="space-y-4"
          footer={
            <ButtonLink href="/events" variant="ghost">
              Cancel
            </ButtonLink>
          }
        >
          <Field
            label="Slug"
            description="Lowercase letters, digits and dashes. This becomes the public URL."
          >
            <Input
              type="text"
              name="slug"
              required
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              placeholder="summer-hack-2026"
              autoFocus
            />
          </Field>
          <Field label="Name">
            <Input type="text" name="name" required placeholder="Summer Hack 2026" />
          </Field>
          <Field
            label="Description (optional)"
            description="Shown on the public event page and in the catalogue."
          >
            <Textarea name="description" rows={3} />
          </Field>
          <div className="space-y-3">
            <p className="text-caption text-fg-subtle">
              Times use UTC. Leave a boundary empty to keep it unrestricted.
            </p>
            <EventWindowFields
              windows={["registration", "submission", "judging"]}
            />
          </div>
          <input type="hidden" name="timezone" value="UTC" />
        </ActionForm>
      </div>
    </Page>
  );
}
