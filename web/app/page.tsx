import { loadHackathons, siteStats } from "@/lib/listings";
import { HomeClient } from "@/components/hq/home-client";

// Re-derive deadline status/countdowns hourly (ISR) so "closing soon" flags and
// day counts stay current without a manual rebuild (issue #47).
export const revalidate = 3600;

export default function Home() {
  const hackathons = loadHackathons();
  const stats = siteStats(hackathons);

  return <HomeClient hackathons={hackathons} stats={stats} />;
}
