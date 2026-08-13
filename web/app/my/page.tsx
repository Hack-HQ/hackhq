import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { loadHackathons } from "@/lib/listings";
import { MyClient } from "@/components/hq/my-client";
import { isClerkConfigured } from "@/lib/env";

// /my calls auth(), which reads request headers, so it must render per request:
// combining that with ISR (revalidate) throws DYNAMIC_SERVER_USAGE in a
// production build. force-dynamic also keeps deadline-derived countdowns fresh,
// which is the reason #47 originally set revalidate here.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "My HackHQ · Members Hub",
  description:
    "Your hackathon pipeline: save events from the deck and globe, drag them from Interested to Going.",
};

export default async function MyPage() {
  if (isClerkConfigured()) {
    const { userId } = await auth();
    if (!userId) {
      redirect("/auth/sign-in?redirect_url=/my");
    }
  }

  const hackathons = loadHackathons();
  return (
    <MyClient hackathons={hackathons} authEnabled={isClerkConfigured()} />
  );
}
