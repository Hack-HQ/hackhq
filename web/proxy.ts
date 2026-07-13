import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isClerkConfigured } from "@/lib/env";

// Clerk only takes over once its keys exist in .env.local — until then the
// site runs exactly as before (the /my hub shows setup instructions instead).
//
// /my is protected here, server-side: a signed-out visitor never reaches the
// page. signInUrl/signUpUrl are pinned in code rather than left to
// NEXT_PUBLIC_CLERK_SIGN_IN_URL / _SIGN_UP_URL, because when those are unset
// Clerk redirects to its hosted account portal instead — so a deployment
// carrying only the two Clerk keys would silently bypass the /auth screens.
const isProtectedRoute = createRouteMatcher(["/my(.*)"]);

export default isClerkConfigured()
  ? clerkMiddleware(
      async (auth, request) => {
        if (isProtectedRoute(request)) {
          await auth.protect();
        }
      },
      { signInUrl: "/auth/sign-in", signUpUrl: "/auth/sign-up" },
    )
  : () => NextResponse.next();

export const config = {
  matcher: [
    // Skip Next.js internals and static assets (incl. the hero video)
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|mp4|mov|json)).*)",
    "/(api|trpc)(.*)",
  ],
};
