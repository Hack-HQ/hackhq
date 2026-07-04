"use client";

import { HQProvider } from "./store";
import { NavPill } from "./nav";
import { Footer } from "./sections";
import { DetailModal } from "./detail-modal";

/* Shared chrome for the standalone pages (/globe, /deck, /my):
   store provider + floating nav + footer + the hackathon detail modal. */
export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <HQProvider>
      <NavPill />
      <main className="pt-24">{children}</main>
      <Footer />
      <DetailModal />
    </HQProvider>
  );
}
