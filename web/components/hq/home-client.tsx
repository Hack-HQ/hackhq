"use client";

import type { Hackathon, SiteStats } from "@/lib/types-hq";
import { HQProvider } from "./store";
import { NavPill } from "./nav";
import { Preloader } from "./preloader";
import { DiscPlayer } from "./disc-player";
import { GlobeHero } from "./globe-hero";
import { Deck } from "./deck";
import { Tracker } from "./tracker";
import { DetailModal } from "./detail-modal";
import { StatsStrip, ThemeMarquee, SubmitSection, Footer } from "./sections";

export function HomeClient({
  hackathons,
  stats,
}: {
  hackathons: Hackathon[];
  stats: SiteStats;
}) {
  return (
    <HQProvider>
      <Preloader />
      <NavPill />
      <main>
        <GlobeHero hackathons={hackathons} />
        <StatsStrip stats={stats} />
        <Deck hackathons={hackathons} />
        <Tracker hackathons={hackathons} />
        <ThemeMarquee hackathons={hackathons} />
        <SubmitSection />
      </main>
      <Footer />
      <DiscPlayer />
      <DetailModal />
    </HQProvider>
  );
}
