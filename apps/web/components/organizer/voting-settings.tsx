"use client";

import { useEffect, useState } from "react";

import { toUtcLocalInput } from "../../lib/format";
import { Field, Input } from "../ui/input";

type Config = { opensAt: string | null; closesAt: string | null };

export function VotingSettings({ eventId }: { eventId: string }) {
  const [opensAt, setOpensAt] = useState("");
  const [closesAt, setClosesAt] = useState("");
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
          opensAt: opensAt ? new Date(`${opensAt}Z`).toISOString() : null,
          closesAt: closesAt ? new Date(`${closesAt}Z`).toISOString() : null,
        }),
      });
      const data = await response.json() as { config?: Config; error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message ?? "Could not save voting settings.");
      setNotice("Community voting settings saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save voting settings.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="voting-settings-heading" className="rounded-xl border border-line bg-surface">
      <header className="border-b border-line-subtle px-5 py-4">
        <h2 id="voting-settings-heading" className="text-heading-sm font-semibold text-fg">Community voting</h2>
        <p className="mt-1 text-small text-fg-muted">Only signed-in accounts can vote. Times use UTC. Leave both dates empty to disable community voting.</p>
      </header>
      <form onSubmit={save} className="space-y-4 p-5">
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
    </section>
  );
}
