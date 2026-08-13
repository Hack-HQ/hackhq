"use client";

import type { GalleryPhoto } from "@/lib/gallery";
import type { Hackathon, SiteStats } from "@/lib/types-hq";
import { HQProvider } from "./store";
import { NavPill } from "./nav";
import { Preloader } from "./preloader";
import { DiscPlayer } from "./disc-player";
import { GlobeHero } from "./globe-hero";
import { DetailModal } from "./detail-modal";
import {
  StatsStrip,
  ThemeMarquee,
  Developers,
  SubmitSection,
  Footer,
} from "./sections";
import { ResourcesShowcase } from "./resources-showcase";
import { GalleryCanvas } from "./gallery-canvas";

export function HomeClient({
  hackathons,
  stats,
  galleryPhotos,
}: {
  hackathons: Hackathon[];
  stats: SiteStats;
  galleryPhotos: GalleryPhoto[];
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
        <GalleryCanvas photos={galleryPhotos} />
        <Developers />
        <SubmitSection />
      </main>
      <Footer />
      <DiscPlayer />
      <DetailModal />
    </HQProvider>
  );
}
