"use client";

import { useEffect } from "react";

// Route-level error boundary: catches thrown errors from the page/segment and
// offers a recovery action instead of falling through to Next's default screen.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-black px-6 text-center text-zinc-100">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-[#ed5b29]">
        Something broke
      </p>
      <h1 className="max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">
        We hit an unexpected error.
      </h1>
      <p className="max-w-md text-zinc-400">
        This one&apos;s on us. Try again, or head back to the map.
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={reset}
          className="rounded-full bg-zinc-100 px-5 py-2.5 text-sm font-medium text-black transition hover:bg-white"
        >
          Try again
        </button>
        <a
          href="/"
          className="rounded-full border border-zinc-700 px-5 py-2.5 text-sm font-medium text-zinc-200 transition hover:border-zinc-500"
        >
          Back to HackHQ
        </a>
      </div>
    </main>
  );
}
