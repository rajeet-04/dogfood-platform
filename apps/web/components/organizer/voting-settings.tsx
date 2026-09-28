"use client";

import { useEffect, useState } from "react";

import { toUtcLocalInput } from "../../lib/format";
import { Field, Input } from "../ui/input";

type AccessMode = "AUTHENTICATED" | "OPEN_LINK" | "EMAIL_GATED";
type Config = { accessMode: AccessMode; opensAt: string | null; closesAt: string | null };
type Invitation = { id: string; email: string; createdAt: string; expiresAt: string; revokedAt: string | null; voted: boolean };

export function VotingSettings({ eventId }: { eventId: string }) {
  const [opensAt, setOpensAt] = useState("");
  const [closesAt, setClosesAt] = useState("");
  const [accessMode, setAccessMode] = useState<AccessMode>("AUTHENTICATED");
  const [configuredAccessMode, setConfiguredAccessMode] = useState<AccessMode>("AUTHENTICATED");
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [freshInvitationLink, setFreshInvitationLink] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const endpoint = `/api/v1/events/${eventId}/voting/config`;

  useEffect(() => {
    let active = true;
    setLoaded(false);
    setOpensAt("");
    setClosesAt("");
    setError("");
    setNotice("");
    setLoadFailed(false);
    void fetch(endpoint).then(async (response) => {
      const data = await response.json() as { config?: Config; error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message ?? "Could not load voting settings.");
      if (active && data.config) {
        setOpensAt(toUtcLocalInput(data.config.opensAt));
        setClosesAt(toUtcLocalInput(data.config.closesAt));
        setAccessMode(data.config.accessMode ?? "AUTHENTICATED");
        setConfiguredAccessMode(data.config.accessMode ?? "AUTHENTICATED");
      }
      if (active) setLoaded(true);
    }).catch((cause: unknown) => {
      if (active) {
        setLoadFailed(true);
        setError(cause instanceof Error ? cause.message : "Could not load voting settings.");
      }
    });
    return () => { active = false; };
  }, [endpoint, retryCount]);

  useEffect(() => {
    if (!loaded || accessMode !== "EMAIL_GATED" || configuredAccessMode !== "EMAIL_GATED") return;
    void fetch(endpoint.replace("/config", "/invitations")).then(async (response) => {
      const data = await response.json() as { invitations?: Invitation[] };
      if (response.ok) setInvitations(data.invitations ?? []);
    });
  }, [endpoint, loaded, accessMode, configuredAccessMode]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (Boolean(opensAt) !== Boolean(closesAt)) throw new Error("Set both voting dates, or clear both to disable community voting.");
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessMode,
          opensAt: opensAt ? new Date(`${opensAt}Z`).toISOString() : null,
          closesAt: closesAt ? new Date(`${closesAt}Z`).toISOString() : null,
        }),
      });
      const data = await response.json() as { config?: Config; error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message ?? "Could not save voting settings.");
      setConfiguredAccessMode(accessMode);
      setNotice("Community voting settings saved.");
      if (accessMode !== "EMAIL_GATED") { setInvitations([]); setFreshInvitationLink(""); }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save voting settings.");
    } finally {
      setBusy(false);
    }
  }

  async function issueInvitation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setNotice(""); setFreshInvitationLink("");
    try {
      const response = await fetch(endpoint.replace("/config", "/invitations"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: inviteEmail }) });
      const data = await response.json() as { token?: string; invitation?: Invitation; error?: { message?: string } };
      if (!response.ok || !data.token || !data.invitation) throw new Error(data.error?.message ?? "Could not issue invitation.");
      const link = `${window.location.origin}/events/${eventId}/vote#invite=${data.token}`;
      setFreshInvitationLink(link);
      setInvitations((current) => [data.invitation!, ...current]);
      setInviteEmail("");
      setNotice("Invitation created. Copy and send its link manually. The link is a bearer credential and does not verify email ownership.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not issue invitation."); }
  }

  async function revokeInvitation(invitationId: string) {
    try {
      const response = await fetch(endpoint.replace("/config", "/invitations/") + invitationId, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not revoke invitation.");
      setInvitations((current) => current.map((item) => item.id === invitationId ? { ...item, revokedAt: new Date().toISOString() } : item));
      setFreshInvitationLink("");
      setNotice("Invitation revoked.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not revoke invitation."); }
  }

  return (
    <section aria-labelledby="voting-settings-heading" className="rounded-xl border border-line bg-surface">
      <header className="border-b border-line-subtle px-5 py-4">
        <h2 id="voting-settings-heading" className="text-heading-sm font-semibold text-fg">Community voting</h2>
        <p className="mt-1 text-small text-fg-muted">Choose who can vote. Times use UTC. Leave both dates empty to disable community voting.</p>
      </header>
      <form onSubmit={save} className="space-y-4 p-5">
        <Field label="Voter access">
          <select aria-label="Voter access" value={accessMode} disabled={!loaded || busy} onChange={(event) => setAccessMode(event.target.value as AccessMode)} className="w-full rounded-md border border-line bg-surface px-3 py-2 text-small text-fg">
            <option value="AUTHENTICATED">Authenticated account (recommended)</option>
            <option value="OPEN_LINK">Anyone with the event link</option>
            <option value="EMAIL_GATED">Email invitation link</option>
          </select>
        </Field>
        <p className="text-caption text-fg-muted">{accessMode === "AUTHENTICATED" ? "One vote per signed-in account." : accessMode === "OPEN_LINK" ? "One vote per browser link token. Clearing cookies or using another browser creates a new anonymous identity." : "Organizers issue single-use bearer links and send them manually. Email addresses are labels only; ownership is not verified and no email is sent automatically."}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Voting opens">
            <Input type="datetime-local" value={opensAt} disabled={!loaded || busy} onChange={(event) => setOpensAt(event.target.value)} />
          </Field>
          <Field label="Voting closes">
            <Input type="datetime-local" value={closesAt} disabled={!loaded || busy} onChange={(event) => setClosesAt(event.target.value)} />
          </Field>
        </div>
        <button type="submit" disabled={!loaded || busy} className="rounded-md bg-accent px-4 py-2 text-small font-semibold text-accent-contrast disabled:opacity-50">
          {busy ? "Saving…" : "Save voting settings"}
        </button>
        {notice ? <p role="status" className="text-small text-fg-muted">{notice}</p> : null}
        {error ? <p role="alert" className="text-small text-danger-fg">{error}</p> : null}
        {loadFailed ? <button type="button" onClick={() => setRetryCount((count) => count + 1)} className="rounded-md border border-line px-3 py-2 text-small font-medium text-fg">Retry loading settings</button> : null}
      </form>
      {loaded && accessMode === "EMAIL_GATED" && configuredAccessMode === "EMAIL_GATED" ? <div className="space-y-4 border-t border-line-subtle p-5">
        <h3 className="text-subheading font-semibold text-fg">Email invitations</h3>
        <form onSubmit={issueInvitation} className="flex flex-col gap-2 sm:flex-row">
          <Input type="email" required maxLength={320} aria-label="Invite voter email" placeholder="voter@example.com" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} />
          <button type="submit" className="rounded-md border border-line px-4 py-2 text-small font-semibold text-fg">Create invitation link</button>
        </form>
        {freshInvitationLink ? <div className="space-y-2 rounded-md border border-line bg-surface-muted p-3"><label className="block text-caption font-medium text-fg" htmlFor="fresh-voting-invite">Copy this link now; it is shown only once.</label><Input id="fresh-voting-invite" readOnly value={freshInvitationLink} onFocus={(event) => event.currentTarget.select()} /><button type="button" onClick={() => void navigator.clipboard?.writeText(freshInvitationLink)} className="rounded-md border border-line px-3 py-1.5 text-caption font-medium text-fg">Copy invitation link</button></div> : null}
        <ul className="divide-y divide-line-subtle">
          {invitations.map((invitation) => <li key={invitation.id} className="flex items-center justify-between gap-3 py-3 text-small"><span><strong>{invitation.email}</strong><span className="ml-2 text-caption text-fg-muted">{invitation.revokedAt ? "Revoked" : invitation.voted ? "Used" : `Expires ${new Date(invitation.expiresAt).toLocaleString()}`}</span></span>{!invitation.revokedAt && !invitation.voted ? <button type="button" onClick={() => void revokeInvitation(invitation.id)} className="text-caption font-medium text-danger-fg">Revoke</button> : null}</li>)}
        </ul>
      </div> : null}
    </section>
  );
}
