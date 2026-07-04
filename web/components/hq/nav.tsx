"use client";

import { REPO_URL } from "@/lib/types-hq";

const LINKS: [string, string][] = [
  ["GLOBE", "#globe"],
  ["DECK", "#deck"],
  ["TRACKER", "#tracker"],
];

export function NavPill() {
  return (
    <nav className="fixed inset-x-0 top-4 z-50 flex justify-center px-3">
      <div className="glass-dark flex items-center gap-1 rounded-3xl p-2 pl-2.5 shadow-[0_16px_48px_rgba(0,0,0,0.45)]">
        {/* Logo chip - HQ monogram */}
        <a
          href="#globe"
          className="mr-1 flex items-center rounded-2xl bg-ink px-3.5 py-3.5 ring-1 ring-white/10 transition hover:ring-coral/60"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/hackhq-monogram.svg" alt="HackHQ" className="h-4 w-auto" />
        </a>

        {/* Links */}
        <div className="hidden items-center sm:flex">
          {LINKS.map(([label, href]) => (
            <a
              key={label}
              href={href}
              className="rounded-full px-4 py-2.5 font-mono text-[11px] tracking-[0.18em] text-paper/80 transition hover:bg-white/10 hover:text-paper"
            >
              {label}
            </a>
          ))}
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="rounded-full px-4 py-2.5 font-mono text-[11px] tracking-[0.18em] text-paper/50 transition hover:bg-white/10 hover:text-paper"
          >
            ★ GITHUB
          </a>
        </div>

        {/* Submit CTA */}
        <a
          href="#submit"
          className="ml-1 flex items-center gap-2 rounded-2xl bg-paper px-5 py-3 font-mono text-[11px] font-bold tracking-[0.18em] text-ink transition hover:bg-white"
        >
          + SUBMIT
        </a>
      </div>
    </nav>
  );
}
