import { loadGalleryPhotos, packGalleryTiles } from "@/lib/gallery";
import { loadHackathons, siteStats } from "@/lib/listings";
import { HomeClient } from "@/components/hq/home-client";

// Re-derive deadline status/countdowns hourly (ISR) so "closing soon" flags and
// day counts stay current without a manual rebuild (issue #47).
export const revalidate = 3600;

export default function Home() {
  const hackathons = loadHackathons();
  const stats = siteStats(hackathons);
  // Pack on the server, not inside the canvas. GalleryPhoto carries the
  // submitter's credit name and credit URL, and every prop handed to a client
  // component is serialized verbatim into the RSC flight payload the browser
  // downloads. No component renders those two fields, so packing here means
  // the payload holds only the tiles that are actually drawn (src / alt /
  // geometry) and the attribution never leaves the build.
  const gallery = packGalleryTiles(loadGalleryPhotos());

  return <HomeClient hackathons={hackathons} stats={stats} gallery={gallery} />;
}
