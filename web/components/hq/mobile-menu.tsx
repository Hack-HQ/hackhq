"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { NAV_LINKS, isActiveRoute } from "@/lib/nav";
import { REPO_URL } from "@/lib/types-hq";

/**
 * The primary sections below 640px.
 *
 * The desktop links are `hidden sm:flex`, which left mobile visitors on /globe,
 * /deck, or /my with no way to reach the other sections at all (#113). This is
 * a disclosure button plus a panel carrying the same links.
 *
 * Rendered inside the nav pill and hidden at `sm` and up, where the inline
 * links take over.
 */
export function MobileMenu() {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Escape closes and hands focus back to the button that opened the panel —
  // without the restore, a keyboard user is dumped at the top of the document.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="relative sm:hidden">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="hq-mobile-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        className="flex items-center rounded-2xl px-3.5 py-3.5 text-paper/80 transition hover:bg-white/10 hover:text-paper"
      >
        <MenuIcon open={open} />
      </button>

      {open && (
        <div
          id="hq-mobile-menu"
          className="glass-dark absolute right-0 top-[calc(100%+0.6rem)] flex w-52 flex-col gap-1 rounded-3xl p-2 shadow-[0_16px_48px_rgba(0,0,0,0.45)]"
        >
          {NAV_LINKS.map(([label, href]) => {
            const active = isActiveRoute(pathname, href);
            return (
              <Link
                key={label}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`rounded-2xl px-4 py-3 font-mono text-[11px] tracking-[0.18em] transition hover:bg-white/10 hover:text-paper ${
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
            className="rounded-2xl px-4 py-3 font-mono text-[11px] tracking-[0.18em] text-paper/50 transition hover:bg-white/10 hover:text-paper"
          >
            ★ GITHUB
          </a>
        </div>
      )}
    </div>
  );
}

/** Hamburger that becomes a close glyph while the panel is open. */
function MenuIcon({ open }: { open: boolean }) {
  return (
    <span aria-hidden="true" className="flex h-4 w-4 flex-col justify-center gap-[3px]">
      <span
        className={`h-[1.5px] w-full bg-current transition ${
          open ? "translate-y-[4.5px] rotate-45" : ""
        }`}
      />
      <span className={`h-[1.5px] w-full bg-current transition ${open ? "opacity-0" : ""}`} />
      <span
        className={`h-[1.5px] w-full bg-current transition ${
          open ? "-translate-y-[4.5px] -rotate-45" : ""
        }`}
      />
    </span>
  );
}
