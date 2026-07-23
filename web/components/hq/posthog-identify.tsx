"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import { useEffect, useRef } from "react";
import posthog from "posthog-js";

export function PostHogIdentify() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const { user } = useUser();
  const prevSignedIn = useRef<boolean | null>(null);

  useEffect(() => {
    if (!isLoaded) return;

    if (isSignedIn && userId) {
      posthog.identify(userId, {
        email: user?.primaryEmailAddress?.emailAddress,
        name: user?.fullName ?? undefined,
      });
    } else if (!isSignedIn && prevSignedIn.current === true) {
      posthog.reset();
    }

    prevSignedIn.current = Boolean(isSignedIn);
  }, [isLoaded, isSignedIn, userId, user]);

  return null;
}
