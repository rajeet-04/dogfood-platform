import { ArrowRight, Gavel, Layers, ListChecks, Trophy } from "lucide-react";
import type { Metadata } from "next";

import { getActor } from "../server/session";
import { ButtonLink } from "../components/ui/button";

export const metadata: Metadata = {
  title: "Self-hosted hackathon submissions and judging",
  description:
    "Run a hackathon end to end: registration, submissions, rubric-based judging, locked evaluations and reproducible ranking snapshots.",
};

const CAPABILITIES = [
  {
    icon: Layers,
    title: "Run the event",
    body: "Set registration and submission windows, grant participant, judge and organizer roles, and move the event through a state machine that refuses invalid jumps.",
  },
  {
    icon: Gavel,
    title: "Judge fairly",
    body: "Weighted rubrics, per-criterion scores with explicit ranges, and locked evaluations so a submitted score can never be quietly rewritten.",
  },
  {
    icon: ListChecks,
    title: "Keep everyone honest",
    body: "Every membership change, submission, assignment and state transition is written to an append-only audit trail scoped to the event.",
  },
  {
    icon: Trophy,
    title: "Publish results",
    body: "Generate a ranking snapshot with an explicit normalization strategy and tie-breakers, then publish it when you are ready for it to be public.",
  },
] as const;

const LIFECYCLE = [
  { state: "Draft", body: "Create the event and set its rules." },
  { state: "Registration", body: "Participants self-join and form teams." },
  { state: "Submissions open", body: "Teams submit and revise projects; rosters lock." },
  { state: "Submissions closed", body: "No new work; the project set is fixed." },
  { state: "Judging", body: "Judges score against the active rubric." },
  { state: "Results ready", body: "A ranking snapshot exists for organizers." },
  { state: "Published", body: "Scores and rank are public to everyone." },
] as const;

export default async function Home() {
  const actor = await getActor();

  return (
    <main className="flex-1">
      {/* Hero */}
      <section className="border-b border-line-subtle bg-surface">
        <div className="mx-auto grid w-full max-w-7xl gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:px-8">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-accent-border bg-accent-soft px-3 py-1 text-micro font-semibold tracking-[0.06em] text-accent-soft-fg uppercase">
              Self-hosted hackathons
            </span>
            <h1 className="mt-5 text-display font-semibold text-fg sm:text-[2.5rem] sm:leading-[2.75rem]">
              Run the whole hackathon, not just a sign-up form.
            </h1>
            <p className="mt-4 max-w-xl text-body text-fg-muted">
              DOGFOOD is a self-hosted submission and judging platform. Create
              events, collect projects, score them against weighted rubrics, and
              publish ranking snapshots you can reproduce and verify yourself.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              {actor ? (
                <ButtonLink href="/events" size="lg">
                  Browse events
                  <ArrowRight aria-hidden="true" className="size-4" />
                </ButtonLink>
              ) : (
                <>
                  <ButtonLink href="/register" size="lg">
                    Create an account
                    <ArrowRight aria-hidden="true" className="size-4" />
                  </ButtonLink>
                  <ButtonLink href="/login" size="lg" variant="outline">
                    Log in
                  </ButtonLink>
                </>
              )}
            </div>
          </div>

          {/* The event lifecycle, which is the product's real spine. */}
          <ol className="rounded-xl border border-line bg-canvas p-5 shadow-xs">
            <li className="pb-3 text-micro font-semibold tracking-[0.06em] text-fg-faint uppercase">
              Event lifecycle
            </li>
            {LIFECYCLE.map((step, index) => (
              <li
                key={step.state}
                className="flex gap-3 border-t border-line-subtle py-2.5 first:border-t-0"
              >
                <span
                  aria-hidden="true"
                  className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-accent-soft text-micro font-semibold text-accent-soft-fg tabular"
                >
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-small font-medium text-fg">
                    {step.state}
                  </span>
                  <span className="block text-caption text-fg-subtle">
                    {step.body}
                  </span>
                </span>
              </li>
            ))}
            <li className="border-t border-line-subtle pt-2.5 text-caption text-fg-faint">
              Every transition is validated server-side. Archiving is the final
              state, and an archived event can be restored.
            </li>
          </ol>
        </div>
      </section>

      {/* Capabilities */}
      <section className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
        <div className="max-w-2xl">
          <h2 className="text-title font-semibold text-fg">
            Everything an organizer needs, nothing it does not
          </h2>
          <p className="mt-2 text-body text-fg-muted">
            Each event is a self-contained workspace with its own roster,
            permissions and audit trail.
          </p>
        </div>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {CAPABILITIES.map((item) => (
            <li
              key={item.title}
              className="rounded-xl border border-line bg-surface p-5 shadow-xs transition-colors hover:border-line-strong"
            >
              <span className="grid size-9 place-items-center rounded-lg bg-accent-soft text-accent-soft-fg">
                <item.icon aria-hidden="true" className="size-4.5" />
              </span>
              <h3 className="mt-3.5 text-subheading font-semibold text-fg">
                {item.title}
              </h3>
              <p className="mt-1.5 text-small text-fg-subtle">{item.body}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Roles */}
      <section className="border-t border-line-subtle bg-surface">
        <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
          <h2 className="text-title font-semibold text-fg">
            One account, a different role per event
          </h2>
          <p className="mt-2 max-w-2xl text-body text-fg-muted">
            Membership is per event, and every read and write is checked against
            it. Nobody sees a workspace they have no role in.
          </p>
          <dl className="mt-8 grid gap-4 sm:grid-cols-3">
            {[
              {
                term: "Participant",
                body: "Form a team, submit a project, revise it until the deadline, then see your score once results are published.",
              },
              {
                term: "Judge",
                body: "Get assigned projects, score each rubric criterion in range, and submit an evaluation you can reopen until it locks.",
              },
              {
                term: "Organizer",
                body: "Advance the event, manage the roster, build rubrics, assign judges, lock evaluations and publish the results.",
              },
            ].map((role) => (
              <div
                key={role.term}
                className="rounded-xl border border-line bg-canvas p-5"
              >
                <dt className="text-subheading font-semibold text-fg">
                  {role.term}
                </dt>
                <dd className="mt-1.5 text-small text-fg-subtle">{role.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </main>
  );
}
