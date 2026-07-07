import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Clerk only takes over once its keys exist in .env.local — until then the
// site runs exactly as before (the /my hub shows setup instructions instead).
//
// NOTE (intentional, for now): clerkMiddleware() here only wires up Clerk's
// session context — it does NOT protect any route (no createRouteMatcher /
// auth.protect()). The /my sign-in gate is enforced on the client only
// (my-client.tsx). That's acceptable today because nothing is persisted
// server-side, but a route matcher + auth.protect() MUST be added here before
// any real server-side persistence is introduced. See web/README.md.
const clerkConfigured =
  Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) &&
  Boolean(process.env.CLERK_SECRET_KEY);

export default clerkConfigured ? clerkMiddleware() : () => NextResponse.next();

export const config = {
  matcher: [
    // Skip Next.js internals and static assets (incl. the hero video)
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|mp4|mov|json)).*)",
    "/(api|trpc)(.*)",
  ],
};
