import { loadHackathons } from "@/lib/listings";
import { PageShell } from "@/components/hq/page-shell";
import { GlobeMap } from "@/components/hq/globe-map";

export const metadata = {
  title: "The Globe · HackHQ",
  description:
    "Every hackathon worth joining on one living 3D map. Spin it, tap a marker, fly in.",
};

export default function GlobePage() {
  const hackathons = loadHackathons();
  return (
    <PageShell>
      <GlobeMap hackathons={hackathons} />
    </PageShell>
  );
}
