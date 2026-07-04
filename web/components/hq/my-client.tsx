"use client";

import type { Hackathon } from "@/lib/types-hq";
import { PageShell } from "./page-shell";
import { Tracker } from "./tracker";

export function MyClient({
  hackathons,
  authEnabled,
}: {
  hackathons: Hackathon[];
  authEnabled: boolean;
}) {
  return (
    <PageShell>
      {!authEnabled && <AuthSetupNotice />}
      <Tracker hackathons={hackathons} />
    </PageShell>
  );
}

/* ----- Pre-setup: shown until Clerk keys exist in .env.local ----- */

function AuthSetupNotice() {
  return (
    <section className="p-2 pt-0">
      <div className="shell bg-ink-soft px-6 py-8 sm:px-10">
        <div className="kicker text-coral">Sign-in not configured yet</div>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-paper/60">
          The hub is running in open mode. To turn on Google + GitHub sign-in:
          create a free app at{" "}
          <a
            href="https://dashboard.clerk.com"
            target="_blank"
            rel="noreferrer"
            className="text-coral underline underline-offset-4"
          >
            dashboard.clerk.com
          </a>
          , enable Google and GitHub under &ldquo;SSO connections&rdquo;, then
          paste the two keys into{" "}
          <code className="font-mono text-paper/80">.env.local</code> and
          restart the dev server.
        </p>
      </div>
    </section>
  );
}
