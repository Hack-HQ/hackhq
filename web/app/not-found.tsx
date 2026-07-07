import Link from "next/link";

// Branded 404 for unknown routes.
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-black px-6 text-center text-zinc-100">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-[#f5a623]">
        404
      </p>
      <h1 className="max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">
        This page isn&apos;t on the map.
      </h1>
      <p className="max-w-md text-zinc-400">
        The link may be broken or the page may have moved.
      </p>
      <Link
        href="/"
        className="mt-2 rounded-full bg-zinc-100 px-5 py-2.5 text-sm font-medium text-black transition hover:bg-white"
      >
        Back to HackHQ
      </Link>
    </main>
  );
}
