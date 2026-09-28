"use client";

import { useState } from "react";

type Endpoint = {
  id: string;
  url: string;
  eventTypes: string[];
  enabled: boolean;
  createdAt: string;
};

type Delivery = {
  id: string;
  eventType: string;
  status: string;
  attemptCount: number;
  lastStatusCode: number | null;
  lastError: string | null;
  createdAt: string;
};

type Props = {
  eventId: string;
  initialEndpoints: Endpoint[];
  initialDeliveries: Delivery[];
};

type ApiResult = {
  endpoint?: Endpoint;
  signingSecret?: string;
  error?: { message?: string };
  endpoints?: Endpoint[];
  deliveries?: Delivery[];
};

export function WebhookSettings({ eventId, initialEndpoints, initialDeliveries }: Props) {
  const [endpoints, setEndpoints] = useState(initialEndpoints);
  const [deliveries, setDeliveries] = useState(initialDeliveries);
  const [url, setUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const base = `/api/v1/events/${eventId}/webhooks`;

  async function refresh() {
    const response = await fetch(base, { cache: "no-store" });
    const result = (await response.json()) as ApiResult;
    if (!response.ok) throw new Error(result.error?.message ?? "Could not load webhook settings");
    setEndpoints(result.endpoints ?? []);
    setDeliveries(result.deliveries ?? []);
  }

  async function run(action: () => Promise<void>, success: string) {
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      await refresh();
      setNotice(success);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Webhook request failed");
    } finally {
      setPending(false);
    }
  }

  async function createEndpoint(formData: FormData) {
    const response = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: formData.get("url"), eventTypes: ["*"] }),
    });
    const result = (await response.json()) as ApiResult;
    if (!response.ok || !result.endpoint || !result.signingSecret) {
      throw new Error(result.error?.message ?? "Could not create webhook endpoint");
    }
    setSecret(result.signingSecret);
    setUrl("");
  }

  async function updateEndpoint(id: string, body: { enabled?: boolean; rotateSecret?: boolean }) {
    const response = await fetch(`${base}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = (await response.json()) as ApiResult;
    if (!response.ok) throw new Error(result.error?.message ?? "Could not update endpoint");
    if (result.signingSecret) setSecret(result.signingSecret);
  }

  return (
    <div className="mt-6 space-y-5">
      <section className="rounded-xl border border-line bg-surface p-5 sm:p-6">
        <h2 className="text-heading font-semibold text-fg">Add an endpoint</h2>
        <p className="mt-1 max-w-2xl text-small text-fg-subtle">
          DOGFOOD signs each audited event with HMAC-SHA256. Payload metadata can include personal data, such as invitation email addresses; send only to endpoints you control. Endpoints must use public HTTPS on port 443.
        </p>
        <form
          className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
          action={(formData) => run(() => createEndpoint(formData), "Endpoint added.")}
        >
          <label className="min-w-0 flex-1 text-small font-medium text-fg">
            HTTPS endpoint URL
            <input
              name="url"
              type="url"
              required
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://hooks.example.com/dogfood"
              className="mt-1.5 block min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-body text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
          </label>
          <button
            className="min-h-11 rounded-lg bg-accent px-4 text-small font-semibold text-on-accent hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-wait disabled:opacity-60"
            type="submit"
            disabled={pending}
          >
            Add endpoint
          </button>
        </form>
        <p className="mt-2 text-caption text-fg-subtle">Subscribes to all audited event actions. The signing secret is shown once.</p>
      </section>

      {error ? <p role="alert" className="rounded-lg border border-danger/40 bg-danger/5 px-4 py-3 text-small text-danger">{error}</p> : null}
      {notice ? <p role="status" className="rounded-lg border border-success/40 bg-success/5 px-4 py-3 text-small text-success">{notice}</p> : null}
      {secret ? (
        <section className="rounded-xl border border-warning/40 bg-warning/5 p-5" aria-live="polite">
          <h2 className="text-heading font-semibold text-fg">Save this signing secret</h2>
          <p className="mt-1 text-small text-fg-subtle">It will not be shown again. Rotate it if it is lost.</p>
          <code className="mt-3 block overflow-x-auto rounded-lg bg-surface px-3 py-2 text-small text-fg">{secret}</code>
          <button
            type="button"
            className="mt-3 min-h-9 rounded-lg border border-line bg-surface px-3 text-small font-medium text-fg hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            onClick={() => void navigator.clipboard.writeText(secret)}
          >
            Copy secret
          </button>
        </section>
      ) : null}

      <section className="rounded-xl border border-line bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-heading font-semibold text-fg">Configured endpoints</h2>
          <p className="mt-1 text-small text-fg-subtle">Only organizers can view, pause, rotate, or remove endpoints.</p>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={() => void run(async () => {
              const response = await fetch(`${base}/dispatch`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ limit: 20 }),
              });
              const result = (await response.json()) as { error?: { message?: string }; attempted?: number };
              if (!response.ok) throw new Error(result.error?.message ?? "Could not dispatch webhooks");
              setNotice(`Dispatch processed ${result.attempted ?? 0} due deliveries.`);
            }, "Dispatch complete.")}
            className="min-h-10 rounded-lg border border-line bg-surface px-3 text-small font-medium text-fg hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-wait disabled:opacity-60"
          >
            Dispatch due deliveries
          </button>
        </div>
        <p className="mt-2 text-caption text-fg-subtle">Due attempts are dispatched when an organizer runs them here or calls the API. Failed attempts retry with backoff up to eight times; no background worker is enabled by default.</p>
        {endpoints.length === 0 ? (
          <p className="mt-4 rounded-lg bg-surface-sunken px-4 py-3 text-small text-fg-subtle">No endpoints configured yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line-subtle">
            {endpoints.map((endpoint) => (
              <li key={endpoint.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="break-all text-small font-medium text-fg">{endpoint.url}</p>
                  <p className="mt-1 text-caption text-fg-subtle">{endpoint.eventTypes.join(", ")} · {endpoint.enabled ? "Enabled" : "Paused"}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={pending} onClick={() => void run(() => updateEndpoint(endpoint.id, { enabled: !endpoint.enabled }), endpoint.enabled ? "Endpoint paused." : "Endpoint enabled.")} className="min-h-9 rounded-lg border border-line px-3 text-small text-fg hover:bg-surface-sunken disabled:opacity-60">{endpoint.enabled ? "Pause" : "Enable"}</button>
                  <button type="button" disabled={pending} onClick={() => void run(() => updateEndpoint(endpoint.id, { rotateSecret: true }), "Secret rotated; save the new secret now.")} className="min-h-9 rounded-lg border border-line px-3 text-small text-fg hover:bg-surface-sunken disabled:opacity-60">Rotate secret</button>
                  <button type="button" disabled={pending} onClick={() => {
                    if (window.confirm("Remove this endpoint and its delivery history?")) {
                      void run(async () => {
                        const response = await fetch(`${base}/${endpoint.id}`, { method: "DELETE" });
                        const result = (await response.json()) as { error?: { message?: string } };
                        if (!response.ok) throw new Error(result.error?.message ?? "Could not remove endpoint");
                      }, "Endpoint removed.");
                    }
                  }} className="min-h-9 rounded-lg border border-danger/40 px-3 text-small text-danger hover:bg-danger/5 disabled:opacity-60">Remove</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-line bg-surface p-5 sm:p-6">
        <h2 className="text-heading font-semibold text-fg">Recent delivery attempts</h2>
        {deliveries.length === 0 ? <p className="mt-3 text-small text-fg-subtle">No webhook deliveries yet.</p> : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-small">
              <thead><tr className="border-b border-line text-caption text-fg-subtle"><th className="py-2 pr-4 font-medium">Event</th><th className="py-2 pr-4 font-medium">Status</th><th className="py-2 pr-4 font-medium">Attempts</th><th className="py-2 font-medium">Latest response</th></tr></thead>
              <tbody>{deliveries.slice(0, 20).map((delivery) => <tr key={delivery.id} className="border-b border-line-subtle last:border-0"><td className="py-2 pr-4 font-mono text-caption">{delivery.eventType}</td><td className="py-2 pr-4">{delivery.status}</td><td className="py-2 pr-4 tabular-nums">{delivery.attemptCount}</td><td className="py-2">{delivery.lastStatusCode ?? delivery.lastError ?? "Waiting"}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
