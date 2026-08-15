"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { capturePageview } from "@/lib/analytics";

// Renders nothing; exists only to observe App Router navigations. Mounted once
// in app/layout.tsx (inside <Suspense> — usePathname can bail out to CSR on
// dynamic routes without a boundary). posthog-js automatic pageview capture is
// disabled because it only sees full page loads; SPA route changes have to be
// reported from the router itself. This module must not import posthog-js —
// that would SSR the package into the Cloudflare Worker.
export function Analytics() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;

    capturePageview();
    window.addEventListener("hackhq:posthog-ready", capturePageview);
    return () => {
      window.removeEventListener("hackhq:posthog-ready", capturePageview);
    };
  }, [pathname]);

  return null;
}
