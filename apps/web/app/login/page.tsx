import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { ActionForm } from "../../components/action-form";
import { AuthLink, AuthShell } from "../../components/auth-shell";
import { Field, Input } from "../../components/ui/input";
import { getActor } from "../../server/session";
import { loginAction } from "../../server/actions/auth";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const actor = await getActor();
  if (actor) redirect(next && next.startsWith("/") ? next : "/events");

  return (
    <AuthShell
      title="Log in"
      description="Use the email and password you registered with."
      footer={
        <>
          No account yet? <AuthLink href="/register">Register</AuthLink>
        </>
      }
    >
      <ActionForm action={loginAction} submitLabel="Log in" className="space-y-4">
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
        <Field label="Password">
          <Input
            type="password"
            name="password"
            required
            autoComplete="current-password"
          />
        </Field>
      </ActionForm>
    </AuthShell>
  );
}
