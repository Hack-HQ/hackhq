"use client";

import { UserButton, useAuth, useUser } from "@clerk/nextjs";
import type { Hackathon } from "@/lib/types-hq";
import { AuthScreen } from "./auth-screen";
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
      {authEnabled ? (
        <GatedHub hackathons={hackathons} />
      ) : (
        <>
          <AuthSetupNotice />
          <Tracker hackathons={hackathons} />
        </>
      )}
    </PageShell>
  );
}

/* Auth-aware wrapper - only rendered when ClerkProvider exists */
function GatedHub({ hackathons }: { hackathons: Hackathon[] }) {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return (
      <section className="p-2 pt-0">
        <div className="shell min-h-[78vh] animate-pulse bg-ink" />
      </section>
    );
  }

  if (!isSignedIn) return <SignInGate />;

  return (
    <>
      <HubGreeting />
      <Tracker hackathons={hackathons} />
    </>
  );
}

/* ----- Signed-out: the members gate ----- */

function SignInGate() {
  return <AuthScreen mode="sign-in" />;
}

/* ----- Signed-in: hub header ----- */

function HubGreeting() {
  const { user } = useUser();
  return (
    <section className="p-2 pt-0">
      <div className="shell flex items-center justify-between bg-ink-soft px-6 py-6 sm:px-10">
        <div>
          <div className="kicker text-coral">Members · Hub</div>
          <div className="display mt-2 text-[clamp(1.1rem,2.4vw,1.7rem)] text-paper">
            Welcome{user?.firstName ? `, ${user.firstName}` : ""}
          </div>
        </div>
        <UserButton />
      </div>
    </section>
  );
}

/* ----- Pre-setup: shown until Clerk keys exist in .env.local ----- */

function AuthSetupNotice() {
  return (
    <section className="p-2 pt-0">
      <div className="shell bg-ink-soft px-6 py-8 sm:px-10">
        <div className="kicker text-coral">Sign-in not configured yet</div>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-paper/60">
          The hub is running in open mode. To turn on Google, GitHub, and
          email/password sign-in, create a free app at{" "}
          <a
            href="https://dashboard.clerk.com"
            target="_blank"
            rel="noreferrer"
            className="text-coral underline underline-offset-4"
          >
            dashboard.clerk.com
          </a>
          . Enable Google and GitHub under &ldquo;SSO connections&rdquo;, enable
          email/password under &ldquo;Email, phone, username&rdquo;, then paste the two
          keys into{" "}
          <code className="font-mono text-paper/80">.env.local</code> and
          restart the dev server.
        </p>
      </div>
    </section>
  );
}
