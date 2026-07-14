import { loadHackathons } from "@/lib/listings";
import { PageShell } from "@/components/hq/page-shell";
import { GlobeClient } from "@/components/hq/globe-client";

// ISR: keep deadline-derived status/countdowns fresh without a rebuild (#47).
export const revalidate = 3600;

export const metadata = {
  title: "The Globe · HackHQ",
  description:
    "Every hackathon worth joining on one living 3D map. Search it, filter it, tap a marker, fly in.",
};

export default function GlobePage() {
  const hackathons = loadHackathons();
  return (
    <PageShell>
      <GlobeClient hackathons={hackathons} />
    </PageShell>
  );
}
