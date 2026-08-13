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
    let userId: string | null = null;
    try {
      const authResult = await auth();
      userId = authResult.userId;
      // TEMP DIAGNOSTIC: safe metadata only - no tokens/cookies/JWTs/PII.
      console.log("CLERK AUTH OK ON /my", {
        hasUserId: Boolean(authResult.userId),
        hasSessionId: Boolean(authResult.sessionId),
      });
    } catch (error) {
      // TEMP DIAGNOSTIC: log the ORIGINAL auth exception before Next.js
      // sanitizes it in the production Server Components error.
      console.error("CLERK AUTH FAILURE ON /my", {
        error,
        message: error instanceof Error ? error.message : undefined,
        stack: error instanceof Error ? error.stack : undefined,
        cause: error instanceof Error ? error.cause : undefined,
      });
      throw error;
    }
    // Kept outside the try so Next's redirect control-flow isn't caught/logged.
    if (!userId) {
      redirect("/auth/sign-in?redirect_url=/my");
    }
  }

  // TEMP DIAGNOSTIC: distinguish a data/render throw from an auth throw.
  let hackathons: ReturnType<typeof loadHackathons>;
  try {
    hackathons = loadHackathons();
  } catch (error) {
    console.error("DATA FAILURE ON /my (loadHackathons)", {
      error,
      message: error instanceof Error ? error.message : undefined,
      stack: error instanceof Error ? error.stack : undefined,
      cause: error instanceof Error ? error.cause : undefined,
    });
    throw error;
  }

  return (
    <MyClient hackathons={hackathons} authEnabled={isClerkConfigured()} />
  );
}
