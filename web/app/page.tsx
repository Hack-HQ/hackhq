import { loadHackathons, siteStats } from "@/lib/listings";
import { HomeClient } from "@/components/hq/home-client";

export default function Home() {
  const hackathons = loadHackathons();
  const stats = siteStats(hackathons);

  return <HomeClient hackathons={hackathons} stats={stats} />;
}
