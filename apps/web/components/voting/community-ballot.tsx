"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, MessageCircle, RotateCw } from "lucide-react";

import { Alert } from "../ui/alert";
import { Button, ButtonLink } from "../ui/button";
import { EmptyStatePanel } from "../ui/empty-state";
import { Textarea } from "../ui/input";

type BallotProject = { id: string; title: string };
type Ballot = { eventId: string; accessMode: "AUTHENTICATED" | "OPEN_LINK" | "EMAIL_GATED"; hasVoted: boolean; projects: BallotProject[] };
type Comment = { id: string; body: string; createdAt: string };
type CommentPanel = {
  comments: Comment[] | null;
  body: string;
  loading: boolean;
  posting: boolean;
  error: string | null;
};
type ApiFailure = { error?: { code?: string; message?: string } };

class RequestError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new RequestError("The server returned an unreadable response.", "INTERNAL");
  }
  if (!response.ok) {
    const error = typeof payload === "object" && payload ? payload as ApiFailure : {};
    throw new RequestError(
      error.error?.message || "The request could not be completed.",
      error.error?.code || "INTERNAL",
    );
  }
  return payload as T;
}

function votePath(eventId: string): string {
  return "/api/v1/events/" + eventId + "/voting/ballot";
}

function commentsPath(eventId: string, projectId: string): string {
  return "/api/v1/events/" + eventId + "/projects/" + projectId + "/comments";
}

function initialCommentPanel(): CommentPanel {
  return { comments: null, body: "", loading: false, posting: false, error: null };
}

export function CommunityBallot({ eventId }: { eventId: string }) {
  const [ballot, setBallot] = useState<Ballot | null>(null);
  const [loading, setLoading] = useState(true);
  const [authRequired, setAuthRequired] = useState(false);
  const [invitationRequired, setInvitationRequired] = useState(false);
  const [invitationToken, setInvitationToken] = useState("");
  const [closed, setClosed] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [openComments, setOpenComments] = useState<string | null>(null);
  const [commentPanels, setCommentPanels] = useState<Record<string, CommentPanel>>({});

  useEffect(() => {
    let current = true;
    setLoading(true);
    setAuthRequired(false);
    setInvitationRequired(false);
    setClosed(false);
    setLoadError(null);
    const fragmentToken = new URLSearchParams(window.location.hash.slice(1)).get("invite") ?? "";
    const token = fragmentToken || invitationToken;
    if (fragmentToken) {
      setInvitationToken(fragmentToken);
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    requestJson<{ ballot: Ballot }>(votePath(eventId), { cache: "no-store", headers: token ? { "X-Voting-Invitation": token } : undefined })
      .then(({ ballot: next }) => {
        if (current) setBallot(next);
      })
      .catch((error: unknown) => {
        if (!current) return;
        if (error instanceof RequestError && error.code === "UNAUTHENTICATED") {
          if (error.message.toLowerCase().includes("invitation")) setInvitationRequired(true);
          else setAuthRequired(true);
        } else if (error instanceof RequestError && error.code === "CONFLICT") {
          setClosed(true);
        } else {
          setLoadError(error instanceof Error ? error.message : "The ballot could not be loaded.");
        }
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [eventId, reloadKey]);

  async function submitVote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProjectId || submitting) return;
    setSubmitting(true);
    setVoteError(null);
    try {
      await requestJson("/api/v1/events/" + eventId + "/votes", {
        method: "POST",
        body: JSON.stringify({ projectId: selectedProjectId }),
        headers: invitationToken ? { "X-Voting-Invitation": invitationToken } : undefined,
      });
      setBallot((current) => current ? { ...current, hasVoted: true } : current);
    } catch (error) {
      setVoteError(error instanceof Error ? error.message : "Your vote could not be recorded.");
      if (error instanceof RequestError && error.code === "CONFLICT") {
        setVoteError(null);
        setReloadKey((key) => key + 1);
      }
    } finally {
      setSubmitting(false);
    }
  }

  function submitInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!invitationToken.trim()) return;
    setInvitationToken(invitationToken.trim());
    setReloadKey((key) => key + 1);
  }

  function updateCommentPanel(projectId: string, update: Partial<CommentPanel>) {
    setCommentPanels((current) => ({
      ...current,
      [projectId]: { ...initialCommentPanel(), ...current[projectId], ...update },
    }));
  }

  async function toggleComments(projectId: string) {
    if (openComments === projectId) {
      setOpenComments(null);
      return;
    }
    setOpenComments(projectId);
    if (commentPanels[projectId]?.comments) return;
    await loadComments(projectId);
  }

  async function loadComments(projectId: string) {
    updateCommentPanel(projectId, { loading: true, error: null });
    try {
      const { comments } = await requestJson<{ comments: Comment[] }>(
        commentsPath(eventId, projectId),
        { cache: "no-store" },
      );
      updateCommentPanel(projectId, { comments });
    } catch (error) {
      updateCommentPanel(projectId, {
        error: error instanceof Error ? error.message : "Comments could not be loaded.",
      });
    } finally {
      updateCommentPanel(projectId, { loading: false });
    }
  }

  async function postComment(projectId: string) {
    const panel = commentPanels[projectId] ?? initialCommentPanel();
    const body = panel.body.trim();
    if (!body || panel.posting) return;
    updateCommentPanel(projectId, { posting: true, error: null });
    try {
      const { comment } = await requestJson<{ comment: Comment }>(
        commentsPath(eventId, projectId),
        { method: "POST", body: JSON.stringify({ body }) },
      );
      updateCommentPanel(projectId, {
        body: "",
        comments: [...(panel.comments ?? []), comment],
      });
    } catch (error) {
      updateCommentPanel(projectId, {
        error: error instanceof Error ? error.message : "Your comment could not be posted.",
      });
    } finally {
      updateCommentPanel(projectId, { posting: false });
    }
  }

  const signInHref = "/login?next=" + encodeURIComponent("/events/" + eventId + "/vote");

  if (loading) {
    return (
      <div aria-busy="true" data-testid="ballot-loading">
        <p role="status" className="sr-only">Loading the community ballot.</p>
        <div className="mb-4 h-16 rounded-lg border border-line bg-surface animate-shimmer" />
        <ul className="grid gap-3">
          {[0, 1, 2].map((index) => (
            <li key={index} className="h-24 rounded-xl border border-line bg-surface animate-shimmer" />
          ))}
        </ul>
      </div>
    );
  }

  if (authRequired) {
    return (
      <Alert tone="info" title="Sign in to cast a vote" testId="ballot-auth-required">
        Voting uses one account per person.{" "}
        <Link href={signInHref} className="font-semibold text-accent underline underline-offset-2 hover:text-accent-hover">
          Sign in to continue
        </Link>
        .
      </Alert>
    );
  }

  if (invitationRequired) {
    return <Alert tone="info" title="Use your voting invitation" testId="ballot-invitation-required">
      <p>This bearer link was issued for an email address, but the app does not verify email ownership. Use the invitation link supplied by the organizer.</p>
      <form onSubmit={submitInvitation} className="mt-3 flex flex-col gap-2 sm:flex-row"><label className="sr-only" htmlFor="voting-invitation-code">Invitation code</label><input id="voting-invitation-code" aria-label="Voting invitation code" value={invitationToken} onChange={(event) => setInvitationToken(event.target.value)} className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2 text-small text-fg" /><Button type="submit" variant="secondary">Continue</Button></form>
    </Alert>;
  }

  if (closed) {
    return (
      <EmptyStatePanel
        icon="calendar"
        title="Voting is not open"
        description="The organizer has not opened community voting yet, or the voting window has closed."
        action={<ButtonLink href={"/events/" + eventId} variant="secondary">Back to event</ButtonLink>}
        testId="ballot-closed"
      />
    );
  }

  if (loadError) {
    return (
      <Alert tone="danger" title="The ballot could not be loaded" testId="ballot-error">
        <p>{loadError}</p>
        <Button type="button" variant="secondary" size="sm" className="mt-2" onClick={() => setReloadKey((key) => key + 1)}>
          <RotateCw aria-hidden="true" className="size-3.5" />
          Try again
        </Button>
      </Alert>
    );
  }

  if (!ballot) return null;

  if (ballot.projects.length === 0) {
    return (
      <EmptyStatePanel
        icon="inbox"
        title="No submitted projects are available"
        description="Projects appear on the ballot after they are submitted and made public."
        action={<ButtonLink href="/projects" variant="secondary">Browse the gallery</ButtonLink>}
        testId="ballot-empty"
      />
    );
  }

  return (
    <div data-testid="community-ballot" className="space-y-5">
      <Alert tone="info" title="Choose one project">
        Your vote is private. Community tallies stay hidden until voting closes. Comments require a signed-in account.
      </Alert>

      {ballot.hasVoted ? (
        <Alert tone="success" title="Your vote is recorded." testId="vote-success">
          The community tally will be available after voting closes.{ballot.accessMode === "AUTHENTICATED" ? " You can still read and add comments." : " Comments require a signed-in account."}
        </Alert>
      ) : null}
      {voteError ? <Alert tone="danger" title="Vote not recorded" testId="vote-error">{voteError}</Alert> : null}

      <form onSubmit={submitVote} aria-label="Community ballot" className="space-y-4">
          <fieldset className="space-y-3">
            <legend className="sr-only">Select one submitted project</legend>
            <ul className="grid gap-3">
              {ballot.projects.map((project) => {
                const selected = selectedProjectId === project.id;
                const panel = commentPanels[project.id] ?? initialCommentPanel();
                const commentsOpen = openComments === project.id;
                const projectControlId = "project-" + project.id;
                const commentsId = "comments-" + project.id;
                return (
                  <li key={project.id} className={"rounded-xl border bg-surface shadow-xs transition-[border-color,box-shadow] duration-150 " + (selected ? "border-accent-border ring-2 ring-accent/20" : "border-line hover:border-line-strong")}>
                    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
                      <label htmlFor={projectControlId} className="flex min-w-0 cursor-pointer items-start gap-3 rounded-md focus-within:outline-2 focus-within:outline-offset-4 focus-within:outline-[var(--df-ring)]">
                        <input
                          id={projectControlId}
                          type="radio"
                          name="projectId"
                          value={project.id}
                          required
                          checked={selected}
                          disabled={submitting || ballot.hasVoted}
                          aria-label={"Vote for " + project.title}
                          onChange={() => setSelectedProjectId(project.id)}
                          className="mt-1 size-4 shrink-0 accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--df-ring)]"
                        />
                        <span className="min-w-0">
                          <span className="block text-subheading font-semibold text-fg">{project.title}</span>
                          <span className="mt-1 block text-caption text-fg-subtle">Submitted project</span>
                        </span>
                      </label>
                      <Link href={"/projects/" + project.id} className="inline-flex items-center gap-1.5 self-start text-small font-medium text-accent hover:text-accent-hover hover:underline">
                        Project details
                        <ArrowRight aria-hidden="true" className="size-4" />
                      </Link>
                    </div>
                    <div className="border-t border-line-subtle px-4 py-3 sm:px-5">
                      {ballot.accessMode === "AUTHENTICATED" ? <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-expanded={commentsOpen}
                        aria-controls={commentsId}
                        onClick={() => void toggleComments(project.id)}
                      >
                        <MessageCircle aria-hidden="true" className="size-4" />
                        {commentsOpen ? "Hide comments" : "Comments"}
                        {panel.comments?.length ? <span className="text-fg-faint">({panel.comments.length})</span> : null}
                      </Button> : <Link href={signInHref} className="text-small font-medium text-accent underline underline-offset-2">Sign in for comments</Link>}
                      {commentsOpen ? (
                        <section id={commentsId} aria-label={"Comments on " + project.title} className="mt-3 border-t border-line-subtle pt-3">
                          {panel.loading ? (
                            <div aria-busy="true" className="h-12 rounded-md bg-surface-sunken animate-shimmer">
                              <span className="sr-only">Loading comments.</span>
                            </div>
                          ) : panel.error ? (
                            <Alert tone="danger" title="Comments are unavailable">
                              <p>{panel.error}</p>
                              <Button type="button" variant="secondary" size="sm" className="mt-2" onClick={() => void loadComments(project.id)}>
                                <RotateCw aria-hidden="true" className="size-3.5" />
                                Try again
                              </Button>
                            </Alert>
                          ) : panel.comments?.length ? (
                            <ul className="divide-y divide-line-subtle">
                              {panel.comments.map((comment) => (
                                <li key={comment.id} className="py-3 first:pt-0">
                                  <p className="whitespace-pre-wrap text-small leading-6 text-fg">{comment.body}</p>
                                  <time dateTime={comment.createdAt} className="mt-1 block text-caption text-fg-faint">
                                    {new Date(comment.createdAt).toLocaleString()}
                                  </time>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-small text-fg-subtle">No comments yet. Add a useful note about this project.</p>
                          )}
                          {!panel.error ? (
                            <div className="mt-3 space-y-2">
                              <label htmlFor={"comment-" + project.id} className="block text-small font-medium text-fg">Add a comment</label>
                              <Textarea
                                id={"comment-" + project.id}
                                value={panel.body}
                                maxLength={2000}
                                aria-describedby={"comment-count-" + project.id}
                                rows={3}
                                disabled={panel.posting}
                                onChange={(event) => updateCommentPanel(project.id, { body: event.target.value })}
                                placeholder="Share a constructive thought"
                              />
                              <div className="flex items-center justify-between gap-3">
                                <span id={"comment-count-" + project.id} aria-live="polite" className="text-caption text-fg-faint">{panel.body.length}/2000</span>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  disabled={!panel.body.trim() || panel.posting}
                                  aria-busy={panel.posting || undefined}
                                  onClick={() => void postComment(project.id)}
                                >
                                  {panel.posting ? "Posting…" : "Post comment"}
                                </Button>
                              </div>
                              {panel.error ? <p role="alert" className="text-caption text-danger-fg">{panel.error}</p> : null}
                            </div>
                          ) : null}
                        </section>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        {!ballot.hasVoted ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-subtle pt-4">
            <p className="text-caption text-fg-subtle">{ballot.accessMode === "AUTHENTICATED" ? "One vote per account." : ballot.accessMode === "OPEN_LINK" ? "One vote per browser link token." : "One vote per invitation."} Your choice cannot be changed.</p>
            <Button type="submit" disabled={!selectedProjectId || submitting} aria-busy={submitting || undefined}>
              {submitting ? "Submitting…" : "Submit vote"}
              {!submitting ? <ArrowRight aria-hidden="true" className="size-4" /> : null}
            </Button>
          </div>
        ) : null}
      </form>
    </div>
  );
}
