import { ButtonLink } from "./ui/button";

export function NotAllowed({
  message,
  backHref,
}: {
  message: string;
  backHref: string;
}) {
  return (
    <main className="mx-auto max-w-md px-4 py-20 text-center">
      <p className="tabular text-caption font-semibold tracking-[0.08em] text-danger-fg uppercase">
        403 · access denied
      </p>
      <h1 className="mt-3 text-title font-semibold text-fg">
        Not on this roster
      </h1>
      <p className="mt-2 text-body text-fg-muted">{message}</p>
      <ButtonLink href={backHref} variant="secondary" size="md" className="mt-6">
        Go back
      </ButtonLink>
    </main>
  );
}
