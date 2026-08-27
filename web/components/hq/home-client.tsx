"use client";

import type { PackedGallery } from "@/lib/gallery";
import type { Hackathon, SiteStats } from "@/lib/types-hq";
import { HQProvider } from "./store";
import { NavPill } from "./nav";
import { Preloader } from "./preloader";
import { GlobeHero } from "./globe-hero";
import { DetailModal } from "./detail-modal";
import {
  StatsStrip,
  ThemeMarquee,
  Developers,
  SubmitSection,
  Footer,
  GallerySubmitSection,
} from "./sections";
import { ResourcesShowcase } from "./resources-showcase";
import { GalleryCanvas } from "./gallery-canvas";

export function HomeClient({
  hackathons,
  stats,
  gallery,
}: {
  hackathons: Hackathon[];
  stats: SiteStats;
  gallery: PackedGallery;
}) {
  return (
    <HQProvider>
      <Preloader />
      <NavPill />
      <main>
        <GlobeHero />
        <StatsStrip stats={stats} />
        <ThemeMarquee hackathons={hackathons} />
        <ResourcesShowcase />
        <GalleryCanvas gallery={gallery} />
        <GallerySubmitSection />
        <Developers />
        <SubmitSection />
      </main>
      <Footer />
      <DetailModal />
    </HQProvider>
  );
}
