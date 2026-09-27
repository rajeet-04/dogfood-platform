import Link from "next/link";

export function NotAllowed({
  message,
  backHref,
}: {
  message: string;
  backHref: string;
}) {
  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-xl font-bold">Access denied</h1>
      <p className="mt-2 text-sm text-slate-600">{message}</p>
      <Link
        href={backHref}
        className="mt-6 inline-block rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
      >
        Go back
      </Link>
    </main>
  );
}