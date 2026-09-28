import Link from "next/link";

export function NotAllowed({
  message,
  backHref,
}: {
  message: string;
  backHref: string;
}) {
  return (
    <main className="mx-auto max-w-md px-4 py-20 text-center">
      <p className="text-xs font-semibold tracking-widest text-slate-400 uppercase">
        403
      </p>
      <h1 className="mt-2 text-xl font-bold tracking-tight">Access denied</h1>
      <p className="mt-2 text-sm text-slate-600">{message}</p>
      <Link
        href={backHref}
        className="mt-6 inline-block rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
      >
        Go back
      </Link>
    </main>
  );
}