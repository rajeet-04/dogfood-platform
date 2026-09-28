"use client";

import { useCallback, useEffect, useState } from "react";

type Invitation = {
  id: string;
  email: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
};

export function JudgeInvitations({ eventId }: { eventId: string }) {
  const [email, setEmail] = useState("");
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [shareUrl, setShareUrl] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const base = `/api/v1/events/${eventId}/judge-invitations`;

  const refresh = useCallback(async () => {
    const response = await fetch(base);
    if (!response.ok) throw new Error("Could not load judge invitations.");
    const data = (await response.json()) as { invitations: Invitation[] };
    setInvitations(data.invitations);
  }, [base]);

  useEffect(() => {
    void refresh().catch((error: unknown) => setNotice(error instanceof Error ? error.message : "Could not load invitations."));
  }, [refresh]);

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await response.json()) as { token?: string; error?: { message?: string } };
      if (!response.ok || !data.token) throw new Error(data.error?.message ?? "Could not create invitation.");
      const url = `${window.location.origin}/events/${eventId}/judge-invitations/${data.token}`;
      setShareUrl(url);
      let copied = false;
      try {
        await navigator.clipboard.writeText(url);
        copied = true;
      } catch {
        // Keep the one-time URL visible below so it can still be selected and copied.
      }
      setEmail("");
      setNotice(`${copied ? "Invitation link copied." : "Invitation created. Copy the link below."} Share it only with the invited judge; it expires in 7 days and works once.`);
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not create invitation.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(`${base}/${id}`, { method: "DELETE" });
      const data = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message ?? "Could not revoke invitation.");
      setNotice("Invitation revoked.");
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not revoke invitation.");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setNotice("Invitation link copied. Share it only with the invited judge.");
    } catch {
      setNotice("Copy failed. Select the invitation link and copy it manually.");
    }
  }

  return (
    <section className="rounded-xl border border-line bg-surface">
      <header className="border-b border-line-subtle px-5 py-4">
        <h2 className="text-heading-sm font-semibold text-fg">Judge invitations</h2>
        <p className="mt-1 text-small text-fg-muted">Create a one time link for a specific email. Share it manually; no email is sent.</p>
      </header>
      <div className="space-y-4 p-5">
        <form onSubmit={create} className="flex flex-wrap items-end gap-3">
          <label className="min-w-56 flex-1 text-small font-medium text-fg">
            Judge email
            <input className="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2" type="email" required maxLength={320} value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <button className="rounded-md bg-accent px-4 py-2 text-small font-semibold text-accent-contrast disabled:opacity-50" disabled={busy}>Create and copy link</button>
        </form>
        {notice ? <p role="status" className="text-small text-fg-muted">{notice}</p> : null}
        {shareUrl ? <div className="flex flex-wrap gap-2"><input aria-label="One time judge invitation link" readOnly value={shareUrl} className="min-w-56 flex-1 rounded-md border border-line bg-surface-sunken px-3 py-2 text-small text-fg" /><button className="rounded-md border border-line px-3 py-2 text-small font-medium text-fg" onClick={() => void copyLink()}>Copy link</button></div> : null}
        {invitations.length === 0 ? <p className="text-small text-fg-subtle">No invitations yet.</p> : (
          <ul className="divide-y divide-line-subtle">
            {invitations.map((invitation) => {
              const state = invitation.acceptedAt ? "Accepted" : invitation.revokedAt ? "Revoked" : new Date(invitation.expiresAt) <= new Date() ? "Expired" : "Pending";
              return <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div><p className="text-small font-medium text-fg">{invitation.email}</p><p className="text-caption text-fg-subtle">{state} · expires {new Date(invitation.expiresAt).toLocaleString()}</p></div>
                {!invitation.acceptedAt && !invitation.revokedAt && new Date(invitation.expiresAt) > new Date() ? <button className="rounded-md border border-line px-3 py-1.5 text-small text-fg disabled:opacity-50" disabled={busy} onClick={() => void revoke(invitation.id)}>Revoke</button> : null}
              </li>;
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
