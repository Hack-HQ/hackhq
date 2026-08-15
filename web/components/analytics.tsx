"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import posthog from "posthog-js";

// Renders nothing; exists only to observe App Router navigations. Mounted once
// in app/layout.tsx (inside <Suspense> — usePathname can bail out to CSR on
// dynamic routes without a boundary). posthog-js's automatic pageview capture
// is disabled in lib/analytics.ts because it only sees full page loads; SPA
// route changes have to be reported from the router itself, and this effect —
// keyed on the pathname — is the one place that sees them all, including the
// initial load.
export function Analytics() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    posthog.capture("$pageview", { $current_url: window.location.href });
  }, [pathname]);

  return null;
}

/**
 * Synchronizes the browser analytics identity with Clerk's authenticated user.
 * This runs within ClerkProvider and identifies on a signed-in page load as
 * well as after Clerk completes a sign-in or sign-up. The SDK persists that
 * identity, so downstream events and captured exceptions inherit it.
 */
export function PostHogIdentity() {
  const { isLoaded, user } = useUser();
  const previousUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return;

    if (!user) {
      if (previousUserId.current) {
        posthog.reset();
        previousUserId.current = null;
      }
      return;
    }

    const userId = user.id;
    if (previousUserId.current === userId) return;

    if (previousUserId.current) {
      posthog.reset();
    }

    posthog.identify(userId, {
      email: user.primaryEmailAddress?.emailAddress,
      first_name: user.firstName,
      last_name: user.lastName,
    });
    previousUserId.current = userId;
  }, [isLoaded, user]);

  return null;
}
