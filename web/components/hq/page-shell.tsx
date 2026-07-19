"use client";

import { HQProvider } from "./store";
import { NavPill } from "./nav";
import { Footer } from "./sections";
import { DetailModal } from "./detail-modal";

/* Shared chrome for the standalone pages (/globe, /deck, /my):
   store provider + floating nav + footer + a detail surface. The detail
   surface defaults to the centered modal; pages can override it (the globe
   passes the left-anchored Event Cartridge). */
export function PageShell({
  children,
  detail,
}: {
  children: React.ReactNode;
  detail?: React.ReactNode;
}) {
  return (
    <HQProvider>
      <NavPill />
      <main className="pt-24">{children}</main>
      <Footer />
      {detail ?? <DetailModal />}
    </HQProvider>
  );
}
