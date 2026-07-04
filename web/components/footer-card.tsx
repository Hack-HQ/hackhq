import Link from "next/link";

const REPO_URL = "https://github.com/Jose-Gael-Cruz-Lopez/hackhq";

/**
 * The template's footer: intro copy, pixel link list with superscript
 * counts, social row, then the giant pixel wordmark and copyright.
 */
export function FooterCard({ total }: { total: number }) {
  const links = [
    { label: "Home", href: "#top", count: null },
    { label: "Hackathons", href: "/hackathons", count: total },
    { label: "Globe", href: "/globe", count: null },
    { label: "GitHub", href: REPO_URL, count: null },
  ];

  return (
    <footer className="relative bg-black px-6 pb-40 pt-24 sm:px-12">
      <p className="body-copy mx-auto w-[min(88vw,440px)] text-center">
        HackHQ is your headquarters for every hackathon worth joining. Open
        source and community-driven — every listing lives in a public repo,
        updated daily.
      </p>

      <p className="mt-8 text-center text-sm text-white/60">
        Made with love by{" "}
        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-white/90 underline-offset-4 hover:underline"
        >
          the HackHQ community
        </a>
      </p>

      <nav className="mt-20">
        <ul className="flex flex-col gap-5">
          {links.map((link) => (
            <li key={link.label}>
              <Link
                href={link.href}
                {...(link.href.startsWith("http")
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
                className="px-display inline-flex items-start gap-1 text-[clamp(28px,4vw,40px)] text-white/85 transition-colors hover:text-white"
              >
                {link.label}
                {link.count != null && (
                  <sup className="px-label mt-2 text-[11px] text-white/45">
                    ({link.count})
                  </sup>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <p className="px-display mt-16 text-[clamp(20px,2.4vw,28px)] text-white/70">
        Social Media
      </p>
      <div className="mt-4 flex items-center gap-5">
        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="HackHQ on GitHub"
          className="text-white/50 transition-colors hover:text-white"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="size-6">
            <path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.72.5.1.68-.22.68-.49 0-.24-.01-.87-.01-1.7-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.63.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.9 1.57 2.36 1.12 2.94.85.09-.67.35-1.12.63-1.38-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.7 0 0 .84-.28 2.75 1.05a9.36 9.36 0 0 1 5 0c1.91-1.33 2.75-1.05 2.75-1.05.55 1.4.2 2.44.1 2.7.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.8-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .27.18.6.69.49A10.05 10.05 0 0 0 22 12.25C22 6.58 17.52 2 12 2Z" />
          </svg>
        </a>
      </div>

      <div className="mt-24 flex flex-col items-center gap-4">
        <p className="px-display select-none text-[clamp(72px,13vw,190px)] leading-none text-white/85">
          HackHQ
        </p>
        <p className="text-sm text-white/45">
          © 2026 HackHQ. Open source, community-driven.
        </p>
      </div>
    </footer>
  );
}
