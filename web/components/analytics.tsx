"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { capture } from "@/lib/analytics";

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
    // `capture` is a no-op unless analytics is enabled (key present, no
    // DNT/GPC), so this costs nothing on the default keyless deploy.
    capture("$pageview", { $current_url: window.location.href });
  }, [pathname]);

  return null;
}
