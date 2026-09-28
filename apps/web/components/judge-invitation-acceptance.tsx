"use client";

import { useState } from "react";
import Link from "next/link";

export function JudgeInvitationAcceptance({ eventId, token }: { eventId: string; token: string }) {
  const [message, setMessage] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);

  async function accept() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/v1/events/${eventId}/judge-invitations/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message ?? "This invitation is invalid or no longer active.");
      setAccepted(true);
      setMessage("You are now a judge for this event.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not accept the invitation.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl px-5 py-16">
      <section className="rounded-xl border border-line bg-surface p-6 shadow-sm">
        <p className="text-caption font-semibold uppercase tracking-wide text-fg-subtle">Judge invitation</p>
        <h1 className="mt-2 text-heading-lg font-semibold text-fg">Join this event as a judge</h1>
        <p className="mt-3 text-small text-fg-muted">Accept while signed into an account with the email address entered by the organizer. Account email ownership is not verified. This link expires in 7 days and can be used once.</p>
        {message ? <p role="status" className="mt-4 text-small text-fg-muted">{message}</p> : null}
        <div className="mt-6 flex flex-wrap gap-3">
          {accepted ? <Link className="rounded-md bg-accent px-4 py-2 text-small font-semibold text-accent-contrast" href={`/events/${eventId}/judge`}>Open judge workspace</Link> : <button className="rounded-md bg-accent px-4 py-2 text-small font-semibold text-accent-contrast disabled:opacity-50" disabled={busy} onClick={() => void accept()}>{busy ? "Accepting…" : "Accept invitation"}</button>}
          <Link className="rounded-md border border-line px-4 py-2 text-small font-medium text-fg" href={`/events/${eventId}`}>Event page</Link>
        </div>
      </section>
    </main>
  );
}
