import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isClerkConfigured } from "@/lib/env";

// Next 16's Node-runtime middleware convention (renamed from `middleware.ts`).
// -----------------------------------------------------------------------------
// This deploys to Vercel, where Clerk must run on the Node.js runtime: its
// shared modules pull Node built-ins (#crypto, #safe-node-apis) that the Edge
// runtime rejects — the "Edge Function is referencing unsupported modules"
// build error. Next 16 runs `proxy.ts` on Node, so keeping this as `proxy.ts`
// (not the deprecated Edge `middleware.ts`) is what lets Clerk auth build.
//
// Reviving the Cloudflare/OpenNext path means renaming this file back to
// `middleware.ts` — same logic, Edge runtime — because `opennextjs-cloudflare
// build` cannot compile Node middleware. That rename breaks the Vercel build the
// moment it lands, so it must not happen on `main` while `main` is what
// production deploys. See the Deployment section of README.md.
//
// Clerk only takes over once its keys exist — until then the site runs exactly
// as before (the /my hub shows setup instructions instead).
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
