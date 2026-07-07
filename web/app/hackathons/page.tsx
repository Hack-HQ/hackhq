import Link from "next/link";
import { loadSiteData } from "@/lib/parse-readme";
import { Browser } from "@/components/legacy/browser";

// ISR: re-parse the README + re-derive status on a schedule so the legacy
// browser doesn't freeze deadline state at build time (#47).
export const revalidate = 3600;

export const metadata = {
  title: "All hackathons · HackHQ",
  description:
    "Browse every tracked hackathon. Search and filter in-person, virtual, and hybrid events.",
};

export default function HackathonsPage() {
  const { opportunities, statsBannerSrc } = loadSiteData();

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <header className="border-b border-zinc-200 dark:border-zinc-900">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              ← Back to HackHQ
            </Link>
            <h1 className="max-w-3xl text-balance text-3xl font-semibold leading-tight tracking-tight text-zinc-950 dark:text-zinc-50 sm:text-4xl">
              Every hackathon, in one place.
            </h1>
            <p className="max-w-2xl text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
              Search and filter in-person, virtual, and hybrid hackathons.
              Updated daily.
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Browser opportunities={opportunities} statsBannerSrc={statsBannerSrc} />
      </main>

      <footer className="mt-16 border-t border-zinc-200 dark:border-zinc-900">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-2 px-4 py-8 text-sm text-zinc-500 sm:flex-row sm:items-center sm:px-6 lg:px-8 dark:text-zinc-400">
          <div>Open source · Community-driven</div>
          <Link
            href="/globe"
            className="font-medium text-zinc-900 hover:underline dark:text-zinc-100"
          >
            View the globe →
          </Link>
        </div>
      </footer>
    </div>
  );
}
