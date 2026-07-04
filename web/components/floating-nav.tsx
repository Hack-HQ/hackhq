import Link from "next/link";

const LINKS = [
  { label: "Home", href: "#top" },
  { label: "Events", href: "#events" },
  { label: "About", href: "#about" },
  { label: "Globe", href: "/globe" },
];

/** Magnetto-style persistent pill nav, docked bottom-center over every card. */
export function FloatingNav() {
  return (
    <nav className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
      <div className="flex items-center gap-2 rounded-full bg-[#171412]/90 p-2 shadow-[0_18px_50px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        {/* Logo tile */}
        <Link
          href="#top"
          aria-label="HackHQ home"
          className="px-display grid size-12 shrink-0 place-items-center rounded-[18px] bg-hq-orange text-2xl text-black"
        >
          HQ
        </Link>

        {/* Links */}
        <ul className="hidden items-center gap-1 px-2 sm:flex">
          {LINKS.map((link) => (
            <li key={link.label}>
              <Link
                href={link.href}
                className="px-label block px-2.5 py-2 text-[13px] text-white/75 transition-colors hover:text-white"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        {/* CTA pill */}
        <Link
          href="#submit"
          className="px-label flex h-12 items-center gap-2 rounded-full bg-white px-6 text-[13px] text-black transition-transform hover:scale-[1.03]"
        >
          Submit
          <span aria-hidden>+</span>
        </Link>
      </div>
    </nav>
  );
}
