import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isClerkConfigured } from "@/lib/env";

// This is deliberately `middleware.ts`, not Next 16's newer `proxy.ts`.
// -----------------------------------------------------------------------------
// Next 16 renamed Middleware -> Proxy and runs `proxy.ts` on the Node.js
// runtime. `opennextjs-cloudflare build` hard-fails on Node middleware
// ("Node.js middleware is not currently supported"), but it compiles the Edge
// runtime that `middleware.ts` still targets — so this filename is what keeps
// the app deployable to Workers. Next prints a middleware->proxy deprecation
// warning; that is expected and must stay until OpenNext supports Node proxy.
//
// This file cannot simply be deleted in favour of gating /my inside the page:
// `auth()` requires clerkMiddleware to have run, and without it every server-
// side caller — including /api/tracker, which the whole synced tracker depends
// on — fails with "auth() was called but Clerk can't detect usage of
// clerkMiddleware()".
//
// An earlier revision moved this to `proxy.ts`, on the understanding that Clerk
// pulled Node built-ins (#crypto, #safe-node-apis) that Edge rejects. With
// @clerk/nextjs 7.6.0 that is no longer so: `main` carries this file as Edge
// middleware and both hosts build it green — Workers Builds and Vercel alike.
// Verify with a Vercel build before reintroducing the rename.
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
