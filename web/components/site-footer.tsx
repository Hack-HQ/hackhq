import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="w-full border-t border-[var(--color-line-muted)]">
      <div className="mx-auto flex max-w-[1800px] flex-col gap-6 px-6 py-12 min-[810px]:flex-row min-[810px]:items-center min-[810px]:justify-between min-[1200px]:px-12">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <span aria-hidden>🏛️</span>
          HackHQ
        </div>

        <p className="eyebrow text-white/40">
          Open source · Community-driven · Updated daily
        </p>

        <div className="flex flex-wrap gap-5">
          <Link
            href="/hackathons"
            className="eyebrow text-white/50 transition-colors hover:text-white"
          >
            Browse
          </Link>
          <Link
            href="/globe"
            className="eyebrow text-white/50 transition-colors hover:text-white"
          >
            Globe
          </Link>
          <a
            href="https://github.com/Jose-Gael-Cruz-Lopez/hackhq"
            target="_blank"
            rel="noopener noreferrer"
            className="eyebrow text-white/50 transition-colors hover:text-white"
          >
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}
