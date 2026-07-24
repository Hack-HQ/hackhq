import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { loadHackathons } from "@/lib/listings";
import { MyClient } from "@/components/hq/my-client";
import { isClerkConfigured } from "@/lib/env";

// ISR: keep deadline-derived status/countdowns fresh without a rebuild (#47).
export const revalidate = 3600;

export const metadata = {
  title: "My HackHQ · Members Hub",
  description:
    "Your hackathon pipeline: save events from the deck and globe, drag them from Interested to Going.",
};

export default async function MyPage() {
  if (isClerkConfigured()) {
    const { userId } = await auth();
    if (!userId) {
      redirect("/auth/sign-in");
    }
  }

  const hackathons = loadHackathons();
  return (
    <MyClient hackathons={hackathons} authEnabled={isClerkConfigured()} />
  );
}

