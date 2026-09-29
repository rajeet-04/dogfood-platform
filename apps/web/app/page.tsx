import { ArrowRight, Check, Minus } from "lucide-react";
import type { Metadata } from "next";

import { getActor } from "../server/session";
import { ButtonLink } from "../components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrap,
} from "../components/ui/table";

export const metadata: Metadata = {
  title: "Self-hosted hackathon submissions and judging",
  description:
    "Run a hackathon end to end: registration, submissions, rubric-based judging, locked evaluations and reproducible ranking snapshots.",
};

const LIFECYCLE = [
  { code: "00", state: "Draft", body: "Rules and windows are set. Nothing is visible yet.", phase: "setup" },
  { code: "01", state: "Registration", body: "Participants self-join and form teams.", phase: "setup" },
  { code: "02", state: "Submissions open", body: "Teams submit and revise; rosters lock.", phase: "setup" },
  { code: "03", state: "Submissions closed", body: "No new work. The project set is fixed.", phase: "setup" },
  { code: "04", state: "Judging", body: "Judges score against the active rubric.", phase: "judging" },
  { code: "05", state: "Results ready", body: "A ranking snapshot exists for organizers.", phase: "verified" },
  { code: "06", state: "Published", body: "Scores and rank are public to everyone.", phase: "verified" },
] as const;

const PHASE_BORDER: Record<(typeof LIFECYCLE)[number]["phase"], string> = {
  setup: "var(--color-line-strong)",
  judging: "var(--color-accent)",
  verified: "var(--color-accent2)",
};

const MANIFEST = [
  {
    tag: "run",
    title: "Run the event",
    body: "Set registration and submission windows, grant participant, judge and organizer roles, and move the event through a state machine that refuses invalid jumps.",
  },
  {
    tag: "score",
    title: "Judge fairly",
    body: "Weighted rubrics, per-criterion scores with explicit ranges, and locked evaluations so a submitted score can never be quietly rewritten.",
  },
  {
    tag: "audit",
    title: "Keep everyone honest",
    body: "Every membership change, submission, assignment and state transition is written to an append-only audit trail scoped to the event.",
  },
  {
    tag: "publish",
    title: "Publish results",
    body: "Generate a ranking snapshot with an explicit normalization strategy and tie-breakers, then publish it when you are ready for it to be public.",
  },
] as const;

const ROLE_MATRIX: Array<{
  capability: string;
  participant: boolean | "own";
  judge: boolean | "own";
  organizer: boolean;
}> = [
  { capability: "Join / form a team", participant: true, judge: false, organizer: false },
  { capability: "Submit and revise a project", participant: "own", judge: false, organizer: false },
  { capability: "See own score, once published", participant: "own", judge: false, organizer: false },
  { capability: "Score assigned projects", participant: false, judge: "own", organizer: false },
  { capability: "See other judges' scores", participant: false, judge: false, organizer: false },
  { capability: "Advance event state", participant: false, judge: false, organizer: true },
  { capability: "Assign judges, build rubrics", participant: false, judge: false, organizer: true },
  { capability: "Lock evaluations", participant: false, judge: false, organizer: true },
  { capability: "Publish results", participant: false, judge: false, organizer: true },
];

function RoleMark({ value }: { value: boolean | "own" }) {
  if (value === true) {
    return (
      <span className="inline-flex items-center gap-1 text-accent2-soft-fg">
        <Check aria-hidden="true" className="size-3.5" />
        <span className="tabular text-caption">yes</span>
      </span>
    );
  }
  if (value === "own") {
    return (
      <span className="tabular text-caption text-fg-muted">own only</span>
    );
  }
  return <Minus aria-hidden="true" className="size-3.5 text-fg-faint" />;
}

export default async function Home() {
  const actor = await getActor();

  return (
    <main className="flex-1">
      {/* Hero: the state machine is the product's real spine, so it is the
          first viewport — not a marketing claim beside it. */}
      <section className="border-b border-line-subtle bg-surface">
        <div className="mx-auto w-full max-w-7xl px-4 pt-14 pb-10 sm:px-6 sm:pt-20 sm:pb-14 lg:px-8">
          <h1 className="font-display max-w-3xl text-display font-semibold text-fg sm:text-[3.25rem] sm:leading-[3.25rem]">
            Run the whole hackathon, not just a sign-up form.
          </h1>
          <p className="mt-5 max-w-xl text-body text-fg-muted">
            DOGFOOD is a self-hosted submission and judging platform. Create
            events, collect projects, score them against weighted rubrics,
            and publish ranking snapshots you can reproduce and verify
            yourself.
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

        {/* The event lifecycle state machine, rendered as itself. */}
        <div className="border-t border-line-subtle bg-surface-sunken">
          <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
              <p className="tabular text-micro font-semibold tracking-[0.08em] text-fg-faint uppercase">
                [ event state machine ]
              </p>
              <div className="flex items-center gap-4 text-micro text-fg-faint">
                <span className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="h-0.5 w-3" style={{ backgroundColor: PHASE_BORDER.setup }} />
                  collecting
                </span>
                <span className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="h-0.5 w-3" style={{ backgroundColor: PHASE_BORDER.judging }} />
                  judging
                </span>
                <span className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="h-0.5 w-3" style={{ backgroundColor: PHASE_BORDER.verified }} />
                  verified
                </span>
              </div>
            </div>
            <ol className="mt-4 grid gap-3 sm:grid-cols-7 sm:gap-0">
              {LIFECYCLE.map((step) => (
                <li
                  key={step.state}
                  className="flex items-start gap-3 border-t-2 pt-3 sm:flex-col sm:gap-2 sm:pr-4 sm:pt-4"
                  style={{ borderTopColor: PHASE_BORDER[step.phase] }}
                >
                  <span className="tabular shrink-0 text-caption text-fg-faint">
                    {step.code}
                  </span>
                  <div className="min-w-0">
                    <span className="block text-small font-semibold text-fg">
                      {step.state}
                    </span>
                    <span className="mt-0.5 block text-caption text-fg-subtle">
                      {step.body}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-5 text-caption text-fg-faint">
              Every transition is validated server-side. Archiving is the
              final state, and an archived event can be restored.
            </p>
          </div>
        </div>
      </section>

      {/* Manifest: what the platform does, as a dense list rather than an
          icon-card grid. */}
      <section className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
        <h2 className="font-display text-title font-semibold text-fg">
          Everything an organizer needs, nothing it does not
        </h2>
        <p className="mt-2 max-w-2xl text-body text-fg-muted">
          Each event is a self-contained workspace with its own roster,
          permissions and audit trail.
        </p>
        <ul className="mt-8 divide-y divide-line-subtle border-y border-line-subtle">
          {MANIFEST.map((item) => (
            <li
              key={item.tag}
              className="grid gap-2 py-5 sm:grid-cols-[8rem_1fr] sm:gap-6"
            >
              <span className="tabular text-caption text-fg-faint">
                [{item.tag}]
              </span>
              <div className="min-w-0">
                <h3 className="text-subheading font-semibold text-fg">
                  {item.title}
                </h3>
                <p className="mt-1 max-w-2xl text-small text-fg-subtle">
                  {item.body}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Roles: the real permission ledger, not three restated cards. */}
      <section className="border-t border-line-subtle bg-surface">
        <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
          <h2 className="font-display text-title font-semibold text-fg">
            One account, a different role per event
          </h2>
          <p className="mt-2 max-w-2xl text-body text-fg-muted">
            Membership is per event, and every read and write is checked
            against it. Nobody sees a workspace they have no role in.
          </p>
          <div className="mt-8 rounded-lg border border-line">
            <TableWrap>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>Capability</TableHeader>
                    <TableHeader align="center">Participant</TableHeader>
                    <TableHeader align="center">Judge</TableHeader>
                    <TableHeader align="center">Organizer</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {ROLE_MATRIX.map((row) => (
                    <TableRow key={row.capability}>
                      <TableCell primary>{row.capability}</TableCell>
                      <TableCell align="center" label="Participant">
                        <RoleMark value={row.participant} />
                      </TableCell>
                      <TableCell align="center" label="Judge">
                        <RoleMark value={row.judge} />
                      </TableCell>
                      <TableCell align="center" label="Organizer">
                        <RoleMark value={row.organizer} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableWrap>
          </div>
        </div>
      </section>
    </main>
  );
}
