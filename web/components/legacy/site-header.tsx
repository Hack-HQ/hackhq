import Link from "next/link";

const NAV = [
  { label: "Work", href: "#works" },
  { label: "About", href: "#about" },
  { label: "Contact", href: "#contact" },
];

export function SiteHeader() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 h-[var(--header-h)]">
      <div className="relative mx-auto flex h-full max-w-[1800px] items-center justify-between px-6 min-[1200px]:px-12">
        <Link
          href="/"
          className="text-sm font-medium uppercase tracking-[0.04em] text-white"
        >
          HackHQ
        </Link>

        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-7 min-[810px]:flex">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-sm font-medium uppercase tracking-[0.04em] text-white/70 transition-colors hover:text-white"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <span className="text-sm font-medium uppercase tracking-[0.04em] text-white/70">
          ®2026
        </span>
      </div>
    </header>
  );
}
