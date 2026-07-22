"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { NAV_LINKS, isActiveRoute } from "@/lib/nav";
import { MobileMenu } from "./mobile-menu";
import { REPO_URL } from "@/lib/types-hq";

export function NavPill() {
  const pathname = usePathname();
  const pillRef = useRef<HTMLDivElement>(null);

  // The pill floats over the page, so anything an anchor jumps to has to be
  // pushed clear of it. Publish where its bottom edge actually falls rather
  // than letting each scroll target guess: the pill is sized by px-based text,
  // so a browser minimum-font-size setting grows it past any literal — the
  // same thing that broke the mobile menu's offset in #113.
  useEffect(() => {
    const pill = pillRef.current;
    if (!pill) return;
    const publish = () => {
      const { bottom } = pill.getBoundingClientRect();
      document.documentElement.style.setProperty(
        "--nav-pill-bottom",
        `${Math.round(bottom)}px`,
      );
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(pill);
    return () => observer.disconnect();
  }, []);

  return (
    <nav className="fixed inset-x-0 top-4 z-50 flex justify-center px-3">
      <div
        ref={pillRef}
        className="glass-dark flex items-center gap-1 rounded-3xl p-2 pl-2.5 shadow-[0_16px_48px_rgba(0,0,0,0.45)]"
      >
        {/* Logo chip - HQ monogram */}
        <Link
          href="/"
          className="mr-1 flex items-center rounded-2xl bg-ink px-3.5 py-3.5 ring-1 ring-white/10 transition hover:ring-coral/60"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/hackhq-monogram.svg" alt="HackHQ" className="h-4 w-auto" />
        </Link>

        {/* Links - desktop (md and up). Below that they live in the menu.
            Not `sm`: with RESOURCES the inline row needs 674px of viewport, so
            between 640 and 673 the pill was squeezed narrower than its content
            and wrapped to a second line. */}
        <div className="hidden items-center md:flex">
          {NAV_LINKS.map(([label, href]) => {
            const active = isActiveRoute(pathname, href);
            return (
              <Link
                key={label}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`rounded-full px-4 py-2.5 font-mono text-[11px] tracking-[0.18em] transition hover:bg-white/10 hover:text-paper ${
                  active ? "bg-white/10 text-paper" : "text-paper/80"
                }`}
              >
                {label}
              </Link>
            );
          })}
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="rounded-full px-4 py-2.5 font-mono text-[11px] tracking-[0.18em] text-paper/50 transition hover:bg-white/10 hover:text-paper"
          >
            ★ GITHUB
          </a>
        </div>

        {/* Links - below sm, where the row above is hidden */}
        <MobileMenu />

        {/* Submit CTA.
            On the home page this has to scroll itself. <Link>'s documented
            default is to *maintain* scroll position and only jump when the
            target Page is outside the viewport — on "/" the Page is already
            visible, so the router kept the position and the button appeared
            dead. The footer's plain <a> never had the problem because it
            bypasses the router and the browser handles the fragment.
            Off the home page there is a real route change, so the router
            still does the work and we leave it alone. */}
        <Link
          href="/#submit"
          onClick={(e) => {
            if (pathname !== "/") return;
            const target = document.getElementById("submit");
            if (!target) return;
            e.preventDefault();
            // Honours the section's scroll-margin-top, so it lands clear of
            // this pill rather than behind it.
            target.scrollIntoView();
            window.history.pushState(null, "", "/#submit");
          }}
          className="ml-1 flex items-center gap-2 rounded-2xl bg-paper px-5 py-3 font-mono text-[11px] font-bold tracking-[0.18em] text-ink transition hover:bg-white"
        >
          + SUBMIT
        </Link>
      </div>
    </nav>
  );
}
