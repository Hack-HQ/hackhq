import { loadHackathons } from "@/lib/listings";
import { MyClient } from "@/components/hq/my-client";

// ISR: keep deadline-derived status/countdowns fresh without a rebuild (#47).
export const revalidate = 3600;

export const metadata = {
  title: "My HackHQ · Members Hub",
  description:
    "Your hackathon pipeline: save events from the deck and globe, drag them from Interested to Going.",
};

export default function MyPage() {
  const hackathons = loadHackathons();
  const authEnabled = Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
      process.env.CLERK_SECRET_KEY,
  );
  return <MyClient hackathons={hackathons} authEnabled={authEnabled} />;
}
