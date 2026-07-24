"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { NAV_LINKS, isActiveRoute } from "@/lib/nav";
import { REPO_URL } from "@/lib/types-hq";

/**
 * The primary sections below 768px.
 *
 * The desktop links are `hidden md:flex`, which left mobile visitors on /globe,
 * /deck, or /my with no way to reach the other sections at all (#113). This is
 * a disclosure button plus a panel carrying the same links.
 *
 * Rendered inside the nav pill and hidden at `md` and up, where the inline
 * links take over.
 */
export function MobileMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

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

  // A tap anywhere outside the menu dismisses it. Focus is not moved here: the
  // pointer has already gone where the user wants it, unlike the Escape case.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // The panel stops existing at `md` and up, but `md:hidden` is CSS — the state
  // stays true. Rotating a phone to landscape therefore hid the panel with focus
  // still inside it (focus fell to <body>), left this component's document-level
  // key handler live on desktop, and popped the panel back open on rotating
  // back. Close it when the breakpoint is crossed so the state matches reality.
  useEffect(() => {
    if (!open) return;
    const desktop = window.matchMedia("(min-width: 768px)");
    const onChange = () => {
      if (desktop.matches) setOpen(false);
    };
    onChange();
    desktop.addEventListener("change", onChange);
    return () => desktop.removeEventListener("change", onChange);
  }, [open]);

  // Close when focus leaves the menu entirely.
  //
  // A disclosure needs no focus trap — but it does need focus *management*.
  // Without this, a keyboard user could tab out of the open panel, activate a
  // hackathon card, and end up with the detail modal stacked on top of a still
  // open nav panel: two overlays at once, one Escape tearing down both.
  const onBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (!rootRef.current?.contains(e.relatedTarget as Node | null)) {
      setOpen(false);
    }
  };

  return (
    // Not `relative`: with no positioned ancestor here, the panel below resolves
    // against the fixed <nav>, whose height IS the pill's height.
    <div
      ref={rootRef}
      onBlur={onBlur}
      className="md:hidden"
    >
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="hq-mobile-menu"
        // A stable name. Flipping it to "Close menu" while open would break
        // voice control ("click Open menu" stops matching the thing it opened),
        // and aria-expanded already carries the state.
        aria-label="Menu"
        className="flex items-center rounded-2xl px-3.5 py-3.5 text-paper/80 transition hover:bg-white/10 hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
      >
        <MenuIcon open={open} />
      </button>

      {open && (
        <div
          id="hq-mobile-menu"
          // Anchored to the <nav>, not to a magic offset. `top-[5.5rem]` was a
          // guess at where the pill ends, and it only held while the pill's
          // height happened to match: the pill is sized by px-based text, so a
          // browser minimum-font-size setting (Chrome and Firefox both go to
          // 24px) grew the pill past the offset and the panel landed ON TOP of
          // it — for exactly the users who set larger text. `top-full` tracks
          // the real height instead. inset-x-3 matches the nav's px-3 gutter,
          // which keeps the panel on screen at 375px.
          className="mobile-nav-lens absolute inset-x-3 top-full mt-3 flex flex-col gap-1 rounded-3xl p-2"
        >
          {NAV_LINKS.map(([label, href]) => {
            const active = isActiveRoute(pathname, href);
            return (
              <Link
                key={label}
                href={href}
                // Dismiss on the press. A route change does remount the nav (each
                // page renders its own PageShell), but that lands after the
                // navigation resolves — and it never happens at all for GITHUB
                // below, which opens a new tab. Closing here covers both, plus a
                // tap on the section you are already in.
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={`rounded-2xl px-4 py-3 font-mono text-[15px] tracking-[0.18em] transition hover:bg-white/10 hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-inset ${
                  active ? "bg-white/10 text-paper" : "text-paper-dim"
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
            onClick={() => setOpen(false)}
            className="rounded-2xl px-4 py-3 font-mono text-[13px] tracking-[0.18em] text-paper/50 transition hover:bg-white/10 hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-inset"
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
    <span aria-hidden="true" className="flex h-5 w-5 flex-col justify-center gap-[5px]">
      <span
        className={`h-[1.5px] w-full bg-current transition ${
          open ? "translate-y-[6.5px] rotate-45" : ""
        }`}
      />
      <span className={`h-[1.5px] w-full bg-current transition ${open ? "opacity-0" : ""}`} />
      <span
        className={`h-[1.5px] w-full bg-current transition ${
          open ? "-translate-y-[6.5px] -rotate-45" : ""
        }`}
      />
    </span>
  );
}
