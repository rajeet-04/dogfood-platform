import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { ActionForm } from "../../components/action-form";
import { AuthLink, AuthShell } from "../../components/auth-shell";
import { Field, Input } from "../../components/ui/input";
import { getActor } from "../../server/session";
import { registerAction } from "../../server/actions/auth";

export const metadata: Metadata = { title: "Register" };

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const actor = await getActor();
  if (actor) redirect(next && next.startsWith("/") ? next : "/events");

  return (
    <AuthShell
      title="Create an account"
      description="One account per person. You can hold several roles per event."
      footer={
        <>
          Already registered? <AuthLink href="/login">Log in</AuthLink>
        </>
      }
    >
      <ActionForm
        action={registerAction}
        submitLabel="Register"
        className="space-y-4"
      >
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <Field label="Email">
          <Input
            type="email"
            name="email"
            required
            autoComplete="email"
            autoFocus
            placeholder="you@example.com"
          />
        </Field>
        <Field label="Display name">
          <Input
            type="text"
            name="displayName"
            required
            autoComplete="name"
            placeholder="Ada Lovelace"
          />
        </Field>
        <Field label="Password" description="At least 8 characters.">
          <Input
            type="password"
            name="password"
            minLength={8}
            required
            autoComplete="new-password"
          />
        </Field>
      </ActionForm>
    </AuthShell>
  );
}
